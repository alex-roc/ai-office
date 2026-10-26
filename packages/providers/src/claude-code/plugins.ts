import { readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  type Agent,
  type Command,
  type McpServer,
  type Plugin,
  pluginId,
  type ScopeSelection,
  type Skill,
} from '@ai-office/core'
import { readPluginMcp } from './mcp.ts'
import { paths } from './paths.ts'
import { pluginName, scanAgents, scanCommands, scanSkills } from './scanners.ts'
import { combineEnabledPlugins, isRecord, type SettingsFile } from './settings.ts'

/**
 * Plugins instalados: qué hay, qué traen y si están habilitados.
 *
 * `installed_plugins.json` es de Claude Code y su esquema NO está documentado del todo (v1: claves
 * de primer nivel; v2: bajo `plugins`, con una lista de instalaciones por clave). Todo se lee a la
 * defensiva: un campo que falta se deduce o se ignora, y un archivo roto es "sin plugins".
 */

export interface InstalledPlugin {
  /** `<nombre>@<marketplace>`. */
  key: string
  version?: string
  installPath?: string
  /** Dónde se instaló: `user`, `project` o `local` (en v2). */
  scope?: string
  projectPath?: string
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** Normaliza v1 y v2 en una lista plana de instalaciones. */
export const parseInstalledPlugins = (raw: unknown): InstalledPlugin[] => {
  if (!isRecord(raw)) return []
  const registry = isRecord(raw.plugins) ? raw.plugins : raw
  const out: InstalledPlugin[] = []
  for (const [key, value] of Object.entries(registry)) {
    const entries = Array.isArray(value) ? value : [value]
    for (const e of entries) {
      if (!isRecord(e)) continue
      out.push({
        key,
        version: str(e.version),
        installPath: str(e.installPath),
        scope: str(e.scope),
        projectPath: str(e.projectPath),
      })
    }
  }
  return out
}

/** `null` si el archivo no existe o no se puede leer: es lo mismo que "ningún plugin". */
export const readInstalledPlugins = async (
  errors?: string[],
): Promise<InstalledPlugin[] | null> => {
  const path = join(paths().plugins, 'installed_plugins.json')
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      errors?.push(`${path}: ${(err as Error).message}`)
    return null
  }
  try {
    return parseInstalledPlugins(JSON.parse(text))
  } catch (err) {
    errors?.push(`${path}: ${(err as Error).message}`)
    return null
  }
}

const realOr = async (p: string): Promise<string> => realpath(p).catch(() => resolve(p))

/**
 * De las instalaciones de un mismo plugin, la que está activa en este ámbito: la de usuario
 * (o sin ámbito), o la de proyecto/local si es de ESTE proyecto. Una instalación de otro proyecto
 * no es de este ámbito.
 */
const relevantInstall = async (
  installs: InstalledPlugin[],
  scope: ScopeSelection,
): Promise<InstalledPlugin | null> => {
  const here = scope.kind === 'project' ? await realOr(scope.path) : null
  let projectMatch: InstalledPlugin | null = null
  for (const i of installs) {
    if (i.scope === undefined || i.scope === 'user' || i.scope === 'managed') return i
    if (here === null) continue
    if (i.projectPath === undefined || (await realOr(i.projectPath)) === here) projectMatch ??= i
  }
  return projectMatch
}

/** `<cache>/<marketplace>/<plugin>/<version>`: dónde lo deja Claude Code si el registro no dice la ruta. */
const defaultInstallPath = (key: string, version?: string): string => {
  const at = key.lastIndexOf('@')
  const name = key.slice(0, at)
  const marketplace = key.slice(at + 1)
  return join(paths().plugins, 'cache', marketplace, name, ...(version ? [version] : []))
}

const readManifest = async (root: string): Promise<Record<string, unknown> | null> => {
  try {
    const data: unknown = JSON.parse(
      await readFile(join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
    )
    return isRecord(data) ? data : null
  } catch {
    return null
  }
}

export interface PluginScan {
  plugins: Plugin[]
  agents: Agent[]
  skills: Skill[]
  commands: Command[]
  mcpServers: McpServer[]
}

/**
 * Los plugins instalados con sus agentes, skills, comandos y servidores MCP (layout documentado:
 * `agents/`, `skills/<n>/SKILL.md`, `commands/`, `.mcp.json`). Las rutas personalizadas que un
 * `plugin.json` pueda declarar para esas carpetas no se siguen.
 */
export const scanPlugins = async (
  scope: ScopeSelection,
  settings: SettingsFile[],
  errors: string[],
): Promise<PluginScan> => {
  const out: PluginScan = { plugins: [], agents: [], skills: [], commands: [], mcpServers: [] }
  const installed = await readInstalledPlugins(errors)
  if (!installed?.length) return out
  const enabled = combineEnabledPlugins(settings)

  const byKey = new Map<string, InstalledPlugin[]>()
  for (const i of installed) byKey.set(i.key, [...(byKey.get(i.key) ?? []), i])

  for (const [key, installs] of byKey) {
    const install = await relevantInstall(installs, scope)
    if (!install) continue
    const at = key.lastIndexOf('@')
    const root = install.installPath ?? defaultInstallPath(key, install.version)
    const origin = { scope: 'plugin' as const, plugin: key }
    const manifest = await readManifest(root)
    const [agents, skills, commands, mcpServers] = await Promise.all([
      scanAgents(join(root, 'agents'), errors, origin),
      scanSkills(join(root, 'skills'), errors, origin),
      scanCommands(join(root, 'commands'), errors, origin),
      readPluginMcp(root, key, manifest, errors),
    ])
    const state = enabled.get(key)
    out.plugins.push({
      id: pluginId(key),
      key,
      name: pluginName(key),
      marketplace: at > 0 ? key.slice(at + 1) : '',
      version: install.version ?? str(manifest?.version) ?? 'unknown',
      ...(str(manifest?.description) ? { description: str(manifest?.description) } : {}),
      installPath: root,
      enabled: state?.enabled ?? false,
      enabledSource: state?.source ?? null,
      agents: agents.map((a) => a.id),
      skills: skills.map((s) => s.id),
      commands: commands.map((c) => c.id),
      mcpServers: mcpServers.map((m) => m.id),
      descriptionTokens: skills
        .filter((s) => !s.disabledForModel)
        .reduce((n, s) => n + s.descriptionTokens, 0),
    })
    out.agents.push(...agents)
    out.skills.push(...skills)
    out.commands.push(...commands)
    out.mcpServers.push(...mcpServers)
  }
  out.plugins.sort((a, b) => a.key.localeCompare(b.key))
  return out
}
