import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PluginEnabledSource, PluginSettingsScope, ScopeSelection } from '@ai-office/core'
import { managedDir, paths } from './paths.ts'

/**
 * Los archivos de ajustes de Claude Code que influyen en plugins y servidores MCP, de menor a
 * mayor precedencia: user < project < local < managed (ver docs/CLAUDE-CODE-CONFIG.md).
 * `project` y `local` solo existen con un ámbito de proyecto.
 */

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export interface SettingsFile {
  source: PluginEnabledSource
  path: string
  data: Record<string, unknown>
}

/** Dónde vive el `settings` de cada fuente. `null` si no aplica (proyecto sin ámbito de proyecto). */
export const settingsPathFor = (
  source: PluginEnabledSource,
  scope: ScopeSelection,
): string | null => {
  if (source === 'user') return paths().settings
  if (source === 'managed') return join(managedDir(), 'managed-settings.json')
  if (scope.kind !== 'project') return null
  return join(scope.path, '.claude', source === 'project' ? 'settings.json' : 'settings.local.json')
}

const SOURCES: PluginEnabledSource[] = ['user', 'project', 'local', 'managed']

/**
 * Lee los ajustes que existen. Uno ilegible o que no es un objeto no tumba nada: se anota en
 * `errors` y se sigue sin él.
 */
export const readSettingsFiles = async (
  scope: ScopeSelection,
  errors?: string[],
): Promise<SettingsFile[]> => {
  const out: SettingsFile[] = []
  for (const source of SOURCES) {
    const path = settingsPathFor(source, scope)
    if (!path) continue
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        errors?.push(`${path}: ${(err as Error).message}`)
      }
      continue
    }
    try {
      const data: unknown = JSON.parse(text)
      if (!isRecord(data)) throw new Error('not a JSON object')
      out.push({ source, path, data })
    } catch (err) {
      errors?.push(`${path}: ${(err as Error).message}`)
    }
  }
  return out
}

/**
 * `enabledPlugins` combinado clave a clave: gana la fuente de mayor precedencia que nombra la
 * clave (un `true` de managed fuerza, un `false` bloquea).
 */
export const combineEnabledPlugins = (
  files: SettingsFile[],
): Map<string, { enabled: boolean; source: PluginEnabledSource }> => {
  const out = new Map<string, { enabled: boolean; source: PluginEnabledSource }>()
  // `files` ya viene de menor a mayor precedencia: la última escritura es la que manda.
  for (const f of files) {
    const section = f.data.enabledPlugins
    if (!isRecord(section)) continue
    for (const [key, value] of Object.entries(section)) {
      if (typeof value === 'boolean') out.set(key, { enabled: value, source: f.source })
    }
  }
  return out
}

/** Nombres de `disabledMcpjsonServers` por fuente de ajustes (managed no cuenta: no es del usuario). */
export const disabledMcpjson = (files: SettingsFile[]): Map<string, PluginSettingsScope[]> => {
  const out = new Map<string, PluginSettingsScope[]>()
  for (const f of files) {
    if (f.source === 'managed') continue
    const list = f.data.disabledMcpjsonServers
    if (!Array.isArray(list)) continue
    for (const name of list) {
      if (typeof name !== 'string') continue
      out.set(name, [...(out.get(name) ?? []), f.source])
    }
  }
  return out
}
