import { open, readdir, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import type { KnownProject, ScopeSelection } from '@ai-office/core'
import { readClaudeJson } from './mcp.ts'
import { paths } from './paths.ts'
import { isRecord } from './settings.ts'

/**
 * Proyectos que Claude Code conoce: las claves de `projects` de `~/.claude.json` (estado interno,
 * se lee a la defensiva) y los `cwd` de los transcripts. Los que existen en disco van primero.
 */

const isDir = (path: string): Promise<boolean> =>
  stat(path).then(
    (st) => st.isDirectory(),
    () => false,
  )

/** El `cwd` de un transcript: el primer `"cwd":"…"` de sus primeros 64 KB (sin leerlo entero). */
const cwdOfTranscript = async (path: string): Promise<string | null> => {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(path, 'r')
    const buf = Buffer.alloc(64 * 1024)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    const m = /"cwd":("(?:[^"\\]|\\.)*")/.exec(buf.toString('utf8', 0, bytesRead))
    return m?.[1] ? (JSON.parse(m[1]) as string) : null
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

/** `cwd` -> nº de sesiones, leyendo el directorio de cada proyecto bajo `~/.claude/projects`. */
const transcriptProjects = async (): Promise<Map<string, number>> => {
  const out = new Map<string, number>()
  const root = paths().projects
  for (const slug of await readdir(root).catch(() => [])) {
    if (slug.startsWith('.')) continue
    const dir = join(root, slug)
    const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.jsonl'))
    if (files.length === 0) continue
    let cwd: string | null = null
    for (const f of files.slice(0, 3)) {
      cwd = await cwdOfTranscript(join(dir, f))
      if (cwd) break
    }
    if (cwd && isAbsolute(cwd)) out.set(cwd, (out.get(cwd) ?? 0) + files.length)
  }
  return out
}

export const scanKnownProjects = async (current?: ScopeSelection): Promise<KnownProject[]> => {
  const sessions = new Map<string, number>()
  // Dos rutas que son el mismo directorio (una con enlaces simbólicos) son un solo proyecto: se
  // unifican por su forma real cuando existe, que es también la que usa el ámbito.
  const canonical = (path: string): Promise<string> => realpath(path).catch(() => path)
  for (const [cwd, count] of await transcriptProjects()) {
    const path = await canonical(cwd)
    sessions.set(path, (sessions.get(path) ?? 0) + count)
  }
  const known = new Set(sessions.keys())
  const claude = await readClaudeJson()
  if (claude && isRecord(claude.data.projects)) {
    for (const key of Object.keys(claude.data.projects)) {
      if (isAbsolute(key)) known.add(await canonical(key))
    }
  }
  if (current?.kind === 'project') known.add(await canonical(current.path))

  const list = await Promise.all(
    [...known].map(
      async (path): Promise<KnownProject> => ({
        path,
        name: basename(path) || path,
        exists: await isDir(path),
        hasClaudeDir: await isDir(join(path, '.claude')),
        sessions: sessions.get(path) ?? 0,
      }),
    ),
  )
  return list.sort(
    (a, b) =>
      Number(b.exists) - Number(a.exists) ||
      b.sessions - a.sessions ||
      a.name.localeCompare(b.name) ||
      a.path.localeCompare(b.path),
  )
}

/** El proyecto del ámbito activo siempre figura en la lista, aunque ningún transcript lo nombre. */
export const withCurrentProject = async (
  list: KnownProject[],
  current: ScopeSelection,
): Promise<KnownProject[]> => {
  if (current.kind !== 'project' || list.some((p) => p.path === current.path)) return list
  return [
    {
      path: current.path,
      name: basename(current.path) || current.path,
      exists: await isDir(current.path),
      hasClaudeDir: await isDir(join(current.path, '.claude')),
      sessions: 0,
    },
    ...list,
  ]
}
