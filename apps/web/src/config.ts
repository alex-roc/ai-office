import { apiGet, apiPost } from './api.ts'
import type { Show } from './show.ts'
import type { ScopeSelection } from './types.ts'

/**
 * La configuración PROPIA de ai-office (`~/.claude/ai-office/config.json`), que nunca se mezcla con
 * la de Claude Code: el ámbito de trabajo y qué familias dibujan la Sala y el Plano. Se lee y se
 * escribe por `/api/config`; el daemon es quien guarda el archivo.
 */

export interface ConfigView {
  config: {
    scope?: 'user' | 'project'
    project?: string
    show?: Partial<Show>
  }
  /** El archivo existe pero no es válido: el daemon trabaja sin él. */
  configError?: string
  path: string
  /** El ámbito efectivo ahora mismo. */
  scope: ScopeSelection
  /** Quién lo decidió: la línea de comandos, el archivo, la detección automática o el defecto. */
  scopeSource: 'flag' | 'config' | 'auto' | 'default'
  changed: boolean
  /** Solo la demo estática: no puede cambiar de ámbito (falta el snapshot de proyecto). */
  scopeLocked?: boolean
}

/** Un parche: una clave a `null` la quita y `show` se combina clave a clave con lo guardado. */
export interface ConfigPatch {
  scope?: 'user' | 'project' | null
  project?: string | null
  show?: Partial<Show>
}

export const fetchConfig = (): Promise<ConfigView> => apiGet<ConfigView>('/api/config')

export const patchConfig = (patch: ConfigPatch): Promise<ConfigView> =>
  apiPost<ConfigView>('/api/config', patch)
