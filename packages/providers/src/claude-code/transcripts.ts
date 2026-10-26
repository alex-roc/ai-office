import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseMcpToolName } from './mcp.ts'
import { paths } from './paths.ts'

/**
 * Lectura del historial de sesiones.
 *
 * Advertencia de diseño: el formato de estos .jsonl es interno de Claude Code y no tiene
 * contrato de estabilidad (los subagentes ya se mudaron de un campo del archivo principal a
 * archivos propios entre versiones recientes). Por eso todo el parseo vive aquí detrás, es
 * defensivo, y ninguna función de primer nivel del producto depende de que funcione: si
 * cambia el formato, se pierde el historial, no el producto.
 */

/** Quién ejerció: el hilo principal o un subagente concreto. */
export type Actor = { kind: 'main' } | { kind: 'agent'; agentType: string; agentId: string }

export interface Invocation {
  /** Nombre de la skill invocada, tal cual aparece en `tool_input.skill`; con `type: 'mcp'`, la
   * parte `<servidor>` de `mcp__<servidor>__<herramienta>` (`plugin_<plugin>_<servidor>` en un plugin). */
  target: string
  type: 'skill' | 'agent' | 'mcp'
  /** Solo con `type: 'mcp'`: la herramienta llamada. */
  tool?: string
  /** Transcript del que sale, para citarlo como evidencia. */
  file?: string
  actor: Actor
  sessionId: string
  projectSlug: string
  cwd: string | null
  ts: number
  /** Id del `tool_use`: es lo que permite no contar dos veces el mismo bloque. */
  toolUseId: string | null
}

export interface TranscriptScan {
  invocations: Invocation[]
  filesRead: number
  bytesRead: number
  sessions: Set<string>
  /**
   * Directorio de trabajo con el que arrancó cada sesión (el primer `cwd` que trae su archivo
   * principal). Permite saber en qué proyecto estuvo una sesión aunque no haya invocado nada.
   */
  sessionCwd: Map<string, string>
  errors: string[]
}

/**
 * Solo se parsean las líneas que pueden contener una invocación. Descarta la gran mayoría.
 * `"name":"Task"` es el nombre antiguo de la herramienta de subagentes (hoy `Agent`): los
 * historiales de versiones previas siguen en disco y no deben desaparecer del censo. Las
 * herramientas MCP se llaman `mcp__<servidor>__<herramienta>`.
 */
const isCandidate = (line: string): boolean =>
  line.includes('"name":"Skill"') ||
  line.includes('"name":"Agent"') ||
  line.includes('"name":"Task"') ||
  line.includes('"name":"mcp__')

const parseLine = (
  line: string,
  projectSlug: string,
  actor: Actor,
  out: Invocation[],
  seen: Set<string>,
  file: string,
): void => {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(line)
  } catch {
    return
  }
  const message = obj.message as { content?: unknown } | undefined
  const content = message?.content
  if (!Array.isArray(content)) return
  const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : Number.NaN
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as {
      type?: string
      id?: string
      name?: string
      input?: Record<string, unknown>
    }
    if (b.type !== 'tool_use') continue
    // El mismo bloque puede aparecer en más de una línea (mensajes reescritos al reanudar, o
    // copiados a un archivo nuevo al bifurcar una sesión): el id del tool_use lo identifica.
    const toolUseId = typeof b.id === 'string' ? b.id : null
    if (toolUseId) {
      if (seen.has(toolUseId)) continue
      seen.add(toolUseId)
    }
    const mcp = typeof b.name === 'string' ? parseMcpToolName(b.name) : null
    if (mcp) {
      out.push({
        target: mcp.server,
        type: 'mcp',
        tool: mcp.tool ?? '',
        file,
        actor,
        sessionId: String(obj.sessionId ?? ''),
        projectSlug,
        cwd: typeof obj.cwd === 'string' ? obj.cwd : null,
        ts: Number.isNaN(ts) ? 0 : ts,
        toolUseId,
      })
    } else if (b.name === 'Skill' && typeof b.input?.skill === 'string') {
      out.push({
        target: b.input.skill,
        type: 'skill',
        actor,
        sessionId: String(obj.sessionId ?? ''),
        projectSlug,
        cwd: typeof obj.cwd === 'string' ? obj.cwd : null,
        ts: Number.isNaN(ts) ? 0 : ts,
        toolUseId,
      })
    } else if (
      (b.name === 'Agent' || b.name === 'Task') &&
      typeof b.input?.subagent_type === 'string'
    ) {
      out.push({
        target: b.input.subagent_type,
        type: 'agent',
        actor,
        sessionId: String(obj.sessionId ?? ''),
        projectSlug,
        cwd: typeof obj.cwd === 'string' ? obj.cwd : null,
        ts: Number.isNaN(ts) ? 0 : ts,
        toolUseId,
      })
    }
  }
}

/** El primer `"cwd":"…"` de una línea, sin parsear la línea entera (la mayoría no se parsea). */
const firstCwd = (line: string): string | null => {
  if (!line.includes('"cwd":"')) return null
  const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(line)
  if (!m?.[1]) return null
  try {
    return JSON.parse(`"${m[1]}"`) as string
  } catch {
    return null
  }
}

const readJsonl = async (
  path: string,
  projectSlug: string,
  actor: Actor,
  scan: TranscriptScan,
  seen: Set<string>,
  /** Solo para el archivo principal de una sesión: se anota con qué `cwd` arrancó. */
  sessionId?: string,
): Promise<void> => {
  try {
    const st = await stat(path)
    scan.bytesRead += st.size
    scan.filesRead += 1
    const rl = createInterface({
      input: createReadStream(path, { encoding: 'utf8' }),
      crlfDelay: Number.POSITIVE_INFINITY,
    })
    let needCwd = sessionId !== undefined
    for await (const line of rl) {
      if (needCwd && sessionId) {
        const cwd = firstCwd(line)
        if (cwd) {
          scan.sessionCwd.set(sessionId, cwd)
          needCwd = false
        }
      }
      if (!isCandidate(line)) continue
      parseLine(line, projectSlug, actor, scan.invocations, seen, path)
    }
  } catch (err) {
    scan.errors.push(`${path}: ${(err as Error).message}`)
  }
}

/** Lee el agentType de un subagente desde su .meta.json hermano. */
const actorForSubagent = async (metaPath: string, agentId: string): Promise<Actor> => {
  try {
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { agentType?: string }
    if (typeof meta.agentType === 'string') {
      return { kind: 'agent', agentType: meta.agentType, agentId }
    }
  } catch {
    /* sin meta legible: se atribuye a un agente desconocido, nunca al hilo principal */
  }
  return { kind: 'agent', agentType: '(desconocido)', agentId }
}

export const scanTranscripts = async (
  root = paths().projects,
  onProgress?: (done: number, total: number) => void,
): Promise<TranscriptScan> => {
  const scan: TranscriptScan = {
    invocations: [],
    filesRead: 0,
    bytesRead: 0,
    sessions: new Set(),
    sessionCwd: new Map(),
    errors: [],
  }
  const seen = new Set<string>()
  let projects: string[]
  try {
    projects = await readdir(root)
  } catch {
    return scan
  }

  for (let i = 0; i < projects.length; i++) {
    const projectSlug = projects[i] ?? ''
    if (projectSlug.startsWith('.')) continue
    const projectDir = join(root, projectSlug)
    let entries: string[]
    try {
      entries = await readdir(projectDir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.endsWith('.jsonl')) {
        const sessionId = basename(entry, '.jsonl')
        scan.sessions.add(sessionId)
        await readJsonl(
          join(projectDir, entry),
          projectSlug,
          { kind: 'main' },
          scan,
          seen,
          sessionId,
        )
        continue
      }
      // Un directorio con el nombre de la sesión contiene los subagentes de esa sesión.
      const subDir = join(projectDir, entry, 'subagents')
      let subs: string[]
      try {
        subs = await readdir(subDir)
      } catch {
        continue
      }
      for (const sub of subs) {
        if (!sub.endsWith('.jsonl')) continue
        const agentId = basename(sub, '.jsonl').replace(/^agent-/, '')
        const actor = await actorForSubagent(join(subDir, `agent-${agentId}.meta.json`), agentId)
        await readJsonl(join(subDir, sub), projectSlug, actor, scan, seen)
      }
    }
    onProgress?.(i + 1, projects.length)
  }
  scan.invocations.sort((a, b) => a.ts - b.ts)
  return scan
}
