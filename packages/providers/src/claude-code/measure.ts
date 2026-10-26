import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import type { ScopeSelection } from '@ai-office/core'
import type { CommandUse, HistoryScan } from './history.ts'
import type { Invocation, TranscriptScan } from './transcripts.ts'

/**
 * Medir por ámbito. El escaneo de transcripts lee todos los proyectos una sola vez; el ámbito no
 * decide qué se lee sino qué se cuenta: en ámbito de usuario cuenta todo, y en ámbito de proyecto
 * solo lo ocurrido con un directorio de trabajo dentro de ese proyecto. Filtra lo ya escaneado:
 * cambiar de ámbito no vuelve a leer ni un transcript.
 */

/** De qué se mide: todo el historial, o las sesiones de un proyecto (cuántas, para poder decirlo). */
export type MeasuredOver = { kind: 'all' } | { kind: 'project'; path: string; sessions: number }

export interface ScopedHistory {
  invocations: Invocation[]
  commandUse: HistoryScan['commandUse']
  measuredOver: MeasuredOver
}

/** `child` es `root` o cuelga de él (prefijo de ruta CON separador: `/a/bc` no está dentro de `/a/b`). */
const isInside = (child: string, root: string): boolean =>
  child === root || child.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)

/**
 * La ruta real aunque ya no exista del todo: un worktree borrado no se puede resolver con
 * `realpath`, pero su carpeta madre sí, y con ella basta para que `/tmp/x/wt` y `/private/tmp/x`
 * se reconozcan como el mismo sitio.
 */
const realWhereverItEnds = (path: string): string => {
  const abs = resolve(path)
  const tail: string[] = []
  for (let cur = abs; ; cur = dirname(cur)) {
    try {
      return join(realpathSync(cur), ...tail.reverse())
    } catch {
      if (dirname(cur) === cur) return abs
      tail.push(basename(cur))
    }
  }
}

/** ¿Está este directorio dentro del proyecto? Compara tanto la ruta tal cual como su ruta real. */
export const projectMatcher = (projectPath: string): ((cwd: string | null) => boolean) => {
  const roots = new Set([resolve(projectPath), realWhereverItEnds(projectPath)])
  const memo = new Map<string, boolean>()
  return (cwd) => {
    // Sin directorio de trabajo no se puede situar en ningún proyecto: no cuenta.
    if (!cwd) return false
    const known = memo.get(cwd)
    if (known !== undefined) return known
    const candidates = [resolve(cwd), realWhereverItEnds(cwd)]
    const inside = candidates.some((c) => [...roots].some((r) => isInside(c, r)))
    memo.set(cwd, inside)
    return inside
  }
}

const filterCommandUse = (
  commandUse: HistoryScan['commandUse'],
  inside: (cwd: string | null) => boolean,
): HistoryScan['commandUse'] => {
  const out: HistoryScan['commandUse'] = new Map()
  for (const [name, use] of commandUse) {
    const events = use.events.filter((e) => inside(e.project))
    if (events.length === 0) continue
    const filtered: CommandUse = {
      count: events.length,
      lastUsedAt: events.reduce((max, e) => Math.max(max, e.ts), 0),
      sessions: new Set(events.flatMap((e) => (e.sessionId ? [e.sessionId] : []))),
      projects: new Set(events.flatMap((e) => (e.project ? [e.project] : []))),
      events,
    }
    out.set(name, filtered)
  }
  return out
}

export const scopeHistory = (
  scan: Pick<TranscriptScan, 'invocations' | 'sessionCwd'>,
  history: Pick<HistoryScan, 'commandUse'>,
  scope: ScopeSelection,
): ScopedHistory => {
  if (scope.kind === 'user') {
    return {
      invocations: scan.invocations,
      commandUse: history.commandUse,
      measuredOver: { kind: 'all' },
    }
  }
  const inside = projectMatcher(scope.path)
  const invocations = scan.invocations.filter((i) => inside(i.cwd))
  // Una sesión es del proyecto si arrancó dentro de él o si algo suyo se invocó dentro de él.
  const sessions = new Set(invocations.flatMap((i) => (i.sessionId ? [i.sessionId] : [])))
  for (const [id, cwd] of scan.sessionCwd) if (inside(cwd)) sessions.add(id)
  return {
    invocations,
    commandUse: filterCommandUse(history.commandUse, inside),
    measuredOver: { kind: 'project', path: scope.path, sessions: sessions.size },
  }
}
