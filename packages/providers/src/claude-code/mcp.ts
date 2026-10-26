import { readFile, realpath, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import {
  type Catalog,
  type McpScope,
  type McpServer,
  type McpTransport,
  makeId,
  type ScopeSelection,
  type Source,
} from '@ai-office/core'
import { managedDir, paths } from './paths.ts'
import { disabledMcpjson, isRecord, type SettingsFile } from './settings.ts'

/**
 * Servidores MCP de todos los ámbitos documentados (docs/CLAUDE-CODE-CONFIG.md).
 *
 * REGLA: de un servidor solo sale lo que no puede ser un secreto: el ejecutable, el host y los
 * NOMBRES de `env` y `headers`. Ni valores, ni argumentos (llevan tokens con frecuencia: `--token
 * xxx`), ni la URL entera (credenciales en la consulta o antes del host).
 */

/** Claude Code sustituye lo que no es `[A-Za-z0-9_-]` por `_` al construir el nombre de la herramienta. */
export const normalizeMcpName = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, '_')

/** `mcp__<servidor>__<herramienta>` -> sus dos partes. `null` si no es una herramienta MCP. */
export const parseMcpToolName = (name: string): { server: string; tool: string | null } | null => {
  if (!name.startsWith('mcp__')) return null
  const rest = name.slice('mcp__'.length)
  const i = rest.indexOf('__')
  if (i === 0 || rest === '') return null
  if (i < 0) return { server: rest, tool: null }
  return { server: rest.slice(0, i), tool: rest.slice(i + 2) || null }
}

/** Nombre del servidor dentro de su plugin (`<plugin>:<servidor>` -> `<servidor>`). */
const bareName = (server: Pick<McpServer, 'name' | 'plugin'>): string => {
  if (!server.plugin) return server.name
  const plugin = server.plugin.slice(0, server.plugin.lastIndexOf('@'))
  return server.name.startsWith(`${plugin}:`) ? server.name.slice(plugin.length + 1) : server.name
}

/** La parte `<servidor>` de `mcp__<servidor>__<herramienta>` tal y como la escribe Claude Code. */
export const mcpTranscriptKey = (server: Pick<McpServer, 'name' | 'plugin'>): string => {
  if (!server.plugin) return normalizeMcpName(server.name)
  const plugin = server.plugin.slice(0, server.plugin.lastIndexOf('@'))
  return `plugin_${normalizeMcpName(plugin)}_${normalizeMcpName(bareName(server))}`
}

/** Mayor precedencia primero (ver docs/CLAUDE-CODE-CONFIG.md): managed > local > project > user > plugin. */
const PRECEDENCE: McpScope[] = ['managed', 'local', 'project', 'user', 'plugin']

/**
 * Resuelve la clave de una herramienta (`github`, `plugin_acme_search`) al servidor del catálogo.
 * Se incluyen los de plugins deshabilitados: el historial es de cuando estaban activos.
 */
export const mcpResolver = (catalog: Pick<Catalog, 'mcpServers'>) => {
  const byKey = new Map<string, McpServer>()
  // De menor a mayor precedencia: la última escritura es la ganadora.
  const ordered = [...catalog.mcpServers].sort(
    (a, b) => PRECEDENCE.indexOf(b.scope) - PRECEDENCE.indexOf(a.scope),
  )
  for (const s of ordered) {
    if (s.status === 'shadowed') continue
    byKey.set(mcpTranscriptKey(s), s)
  }
  return (key: string): McpServer | undefined => byKey.get(key)
}

/** Id de un servidor que el historial nombra y el catálogo no conoce (conectores, servidores ya borrados). */
export const unknownMcpId = (key: string): string => `mcp:claude-code/unknown/${key}`

// ---------------------------------------------------------------------------------------------
// Lectura de la configuración
// ---------------------------------------------------------------------------------------------

/** Tipo de transporte declarado, o inferido: `command` es stdio y `url` es http. */
const transportOf = (raw: Record<string, unknown>): McpTransport => {
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : null
  if (type === 'stdio' || type === 'sse') return type
  if (type === 'http' || type === 'streamable-http') return 'http'
  if (type === null) {
    if (typeof raw.command === 'string') return 'stdio'
    if (typeof raw.url === 'string') return 'http'
  }
  return 'unknown'
}

/** Solo el ejecutable: sin argumentos (`npx -y x`) y sin directorios (`/Users/yo/bin/x`). */
const executableOf = (command: unknown): string | undefined => {
  if (typeof command !== 'string') return undefined
  const first = command.trim().split(/\s+/)[0] ?? ''
  const base = first.split(/[\\/]/).pop() ?? ''
  return base || undefined
}

/** Solo el host. `URL.host` ya descarta credenciales, ruta y consulta. */
const hostOf = (url: unknown): string | undefined => {
  if (typeof url !== 'string') return undefined
  try {
    return new URL(url).host || undefined
  } catch {
    return undefined // p. ej. `${MCP_URL}/mcp`: la plantilla no es una URL todavía
  }
}

const keysOf = (v: unknown): string[] => (isRecord(v) ? Object.keys(v).sort() : [])

const fileSource = async (path: string, readOnly: boolean): Promise<Source> => {
  let st: { mtimeMs: number; size: number } = { mtimeMs: 0, size: 0 }
  try {
    st = await stat(path)
  } catch {
    /* el archivo existe (acabamos de leerlo): si no se puede medir, no pasa nada */
  }
  return {
    path,
    realPath: path,
    mtimeMs: st.mtimeMs,
    size: st.size,
    symlink: false,
    projections: [],
    readOnly,
  }
}

interface Declared {
  scope: McpScope
  /** Nombre dentro de su ámbito (para un plugin ya lleva el prefijo `<plugin>:`). */
  name: string
  raw: Record<string, unknown>
  source: Source
  plugin?: string
}

const toServer = (d: Declared): McpServer => ({
  id: makeId('mcp', 'claude-code', d.scope, d.name),
  kind: 'mcp',
  name: d.name,
  scope: d.scope,
  ...(d.plugin ? { plugin: d.plugin } : {}),
  provider: 'claude-code',
  description: '',
  source: d.source,
  status: 'active',
  problems: [],
  bodyStartLine: 1,
  transport: transportOf(d.raw),
  ...(executableOf(d.raw.command) ? { command: executableOf(d.raw.command) } : {}),
  ...(hostOf(d.raw.url) ? { urlHost: hostOf(d.raw.url) } : {}),
  envKeys: keysOf(d.raw.env),
  headerKeys: keysOf(d.raw.headers),
  enabled: null,
})

/** Un archivo JSON que puede no existir: `null` sin error si falta; con motivo si está roto. */
const readJson = async (
  path: string,
  errors?: string[],
): Promise<{ text: string; data: Record<string, unknown> } | null> => {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      errors?.push(`${path}: ${(err as Error).message}`)
    return null
  }
  try {
    const data: unknown = JSON.parse(text)
    if (!isRecord(data)) throw new Error('not a JSON object')
    return { text, data }
  } catch (err) {
    errors?.push(`${path}: ${(err as Error).message}`)
    return null
  }
}

/** `~/.claude.json`: estado que Claude Code reescribe él mismo. Aquí solo se lee. */
export const readClaudeJson = (errors?: string[]) => readJson(paths().usageJson, errors)

/**
 * La clave de `projects` de `~/.claude.json` que corresponde al proyecto. La regla exacta no está
 * documentada: se prueba la ruta tal cual y su `realpath`. `null` si el archivo no la nombra.
 */
export const claudeJsonProjectKey = async (
  data: Record<string, unknown>,
  projectPath: string,
): Promise<string | null> => {
  const projects = data.projects
  if (!isRecord(projects)) return null
  const candidates = [projectPath]
  let real: string | null = null
  try {
    real = await realpath(projectPath)
    candidates.push(real)
  } catch {
    /* la ruta ya no existe: solo vale tal cual */
  }
  const exact = candidates.find((c) => c in projects)
  if (exact !== undefined || real === null) return exact ?? null
  // Último recurso: la clave puede ser una forma con enlaces simbólicos del mismo directorio.
  for (const key of Object.keys(projects).slice(0, 500)) {
    if (key.startsWith('/') && (await realpath(key).catch(() => null)) === real) return key
  }
  return null
}

/** Lo declarado en un objeto `{ nombre: { command | url, ... } }`; lo que no es un objeto se ignora. */
const declaredIn = (
  section: unknown,
  base: Omit<Declared, 'name' | 'raw'>,
  prefix = '',
): Declared[] =>
  isRecord(section)
    ? Object.entries(section)
        .filter((e): e is [string, Record<string, unknown>] => isRecord(e[1]))
        .map(([name, raw]) => ({ ...base, name: `${prefix}${name}`, raw }))
    : []

/**
 * Los `.mcp.json` de un plugin admiten `{ "mcpServers": {...} }` o el mapa directamente.
 * (El formato del mapa suelto es el menos documentado: se acepta solo si TODO parece un servidor.)
 */
const serversSection = (data: Record<string, unknown>): unknown => {
  if (isRecord(data.mcpServers)) return data.mcpServers
  const values = Object.values(data)
  const looksLikeServers =
    values.length > 0 &&
    values.every((v) => isRecord(v) && ('command' in v || 'url' in v || 'type' in v))
  return looksLikeServers ? data : null
}

/** Una ruta del manifiesto del plugin, solo si cae dentro del plugin. */
const insidePlugin = (root: string, rel: string): string | null => {
  const abs = resolve(root, rel)
  return abs === root || abs.startsWith(root + sep) ? abs : null
}

/** Servidores MCP de un plugin: `mcpServers` del `plugin.json` (objeto, ruta o lista) y su `.mcp.json`. */
export const readPluginMcp = async (
  root: string,
  pluginKey: string,
  manifest: Record<string, unknown> | null,
  errors?: string[],
): Promise<McpServer[]> => {
  const pluginName = pluginKey.slice(0, pluginKey.lastIndexOf('@')) || pluginKey
  const found = new Map<string, McpServer>()
  const add = async (section: unknown, path: string) => {
    const base = {
      scope: 'plugin' as const,
      plugin: pluginKey,
      source: await fileSource(path, true),
    }
    for (const d of declaredIn(section, base, `${pluginName}:`)) {
      // Lo primero que se lee gana: el manifiesto manda sobre el `.mcp.json` de la raíz.
      if (!found.has(d.name)) found.set(d.name, toServer(d))
    }
  }

  const manifestPath = join(root, '.claude-plugin', 'plugin.json')
  const inline = manifest?.mcpServers
  const refs = Array.isArray(inline) ? inline : inline === undefined ? [] : [inline]
  for (const ref of refs) {
    if (typeof ref === 'string') {
      const path = insidePlugin(root, ref)
      const file = path ? await readJson(path, errors) : null
      if (path && file) await add(serversSection(file.data), path)
    } else if (isRecord(ref)) {
      await add(serversSection(ref) ?? ref, manifestPath)
    }
  }
  const mcpJson = join(root, '.mcp.json')
  const file = await readJson(mcpJson, errors)
  if (file) await add(serversSection(file.data), mcpJson)
  return [...found.values()]
}

export interface McpScanInput {
  scope: ScopeSelection
  settings: SettingsFile[]
  /** Servidores de los plugins instalados (ya leídos por `scanPlugins`) y qué plugins están activos. */
  pluginServers: McpServer[]
  pluginEnabled: Map<string, boolean>
  errors: string[]
}

/** Todos los servidores de los ámbitos documentados, con su estado de activación y su precedencia. */
export const scanMcpServers = async (input: McpScanInput): Promise<McpServer[]> => {
  const { scope, settings, errors } = input
  const claude = await readClaudeJson(errors)
  const declared: Declared[] = []

  if (claude) {
    const source = await fileSource(paths().usageJson, false)
    declared.push(...declaredIn(claude.data.mcpServers, { scope: 'user', source }))
  }

  let disabledMcpServers = new Set<string>()
  if (scope.kind === 'project') {
    // local: `~/.claude.json` -> projects[<ruta>].mcpServers, lo que `claude mcp add` escribe por defecto.
    if (claude) {
      const key = await claudeJsonProjectKey(claude.data, scope.path)
      const entry = key ? (claude.data.projects as Record<string, unknown>)[key] : null
      if (isRecord(entry)) {
        const source = await fileSource(paths().usageJson, false)
        declared.push(...declaredIn(entry.mcpServers, { scope: 'local', source }))
        if (Array.isArray(entry.disabledMcpServers)) {
          disabledMcpServers = new Set(
            entry.disabledMcpServers.filter((x) => typeof x === 'string'),
          )
        }
      }
    }
    const mcpJson = join(scope.path, '.mcp.json')
    const file = await readJson(mcpJson, errors)
    if (file) {
      const source = await fileSource(mcpJson, false)
      declared.push(...declaredIn(serversSection(file.data), { scope: 'project', source }))
    }
  }

  const managedPath = join(managedDir(), 'managed-mcp.json')
  const managed = await readJson(managedPath, errors)
  if (managed) {
    const source = await fileSource(managedPath, true)
    declared.push(...declaredIn(serversSection(managed.data), { scope: 'managed', source }))
  }

  const disabledJson = disabledMcpjson(settings)
  const inProject = scope.kind === 'project'
  const servers = declared.map((d): McpServer => {
    const server = toServer(d)
    if (d.scope === 'managed') return { ...server, enabled: true }
    // Claude Code guarda las listas de desactivados POR PROYECTO: sin proyecto no se sabe.
    if (!inProject) return server
    if (d.scope === 'project') {
      const where = disabledJson.get(d.name)
      return where
        ? { ...server, enabled: false, disabledVia: 'disabledMcpjsonServers', disabledIn: where }
        : { ...server, enabled: true }
    }
    return disabledMcpServers.has(d.name)
      ? { ...server, enabled: false, disabledVia: 'disabledMcpServers' }
      : { ...server, enabled: true }
  })

  for (const s of input.pluginServers) {
    if (input.pluginEnabled.get(s.plugin ?? '') === false) {
      servers.push({ ...s, enabled: false })
      continue
    }
    // Cómo se nombra un servidor de plugin en `disabledMcpServers` NO está documentado: se
    // asume `plugin:<plugin>:<servidor>`, como lo muestra `/mcp`.
    if (!inProject) servers.push(s)
    else if (disabledMcpServers.has(`plugin:${s.name}`)) {
      servers.push({ ...s, enabled: false, disabledVia: 'disabledMcpServers' })
    } else servers.push({ ...s, enabled: true })
  }

  return markShadowed(servers)
}

/**
 * Un servidor del mismo nombre en un ámbito de mayor precedencia tapa al de menor (managed >
 * local > project > user). Los de plugin van con su prefijo y no compiten por nombre.
 */
const markShadowed = (servers: McpServer[]): McpServer[] => {
  const winner = new Map<string, McpServer>()
  for (const s of servers) {
    if (s.scope === 'plugin') continue
    const cur = winner.get(s.name)
    if (!cur || PRECEDENCE.indexOf(s.scope) < PRECEDENCE.indexOf(cur.scope)) winner.set(s.name, s)
  }
  return servers
    .map((s) => {
      const w = winner.get(s.name)
      return s.scope !== 'plugin' && w && w.id !== s.id
        ? { ...s, status: 'shadowed' as const, shadowedBy: w.id }
        : s
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || PRECEDENCE.indexOf(a.scope) - PRECEDENCE.indexOf(b.scope),
    )
}
