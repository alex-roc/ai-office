import { apiPost } from './api.ts'
import { getLang } from './i18n/index.ts'
import type { DetalleCodigo } from './types.ts'

/**
 * Cliente de escritura. Dos tiempos siempre: primero se pide el plan (que no toca nada y
 * devuelve el diff), el usuario lo ve, y solo entonces se aplica. Nunca hay una escritura
 * sorpresa: se está editando la configuración que gobierna todo el trabajo del usuario.
 *
 * Cada petición lleva `lang`: lo que una mutación escribe como prosa (la mención de una skill en
 * un prompt, por ejemplo) sale en el idioma de la interfaz.
 */

export interface MutationPlan {
  path: string
  diff: string
  changed: boolean
  /** En inglés, de respaldo. */
  warnings: string[]
  /** Los mismos avisos con `code` y parámetros, en el mismo orden; opcional según la versión del daemon. */
  warningDetails?: DetalleCodigo[]
  /** `'absent'` si el archivo aún no existe, o `multi:…` si el plan toca varios: se devuelve tal cual al aplicar. */
  etag: string
  /** Un plan que toca varios archivos (`mcp.enable` de un servidor desactivado en varios ajustes): `diff` es la suma. */
  files?: { scope: string; path: string; diff: string; changed: boolean }[]
}

export type MutationKind =
  | 'agent.color'
  | 'agent.description'
  | 'agent.body'
  | 'agent.model'
  | 'agent.tools'
  | 'agent.preloadedSkills'
  | 'agent.skillMentions'
  | 'skill.description'
  | 'skill.body'
  | 'command.description'
  | 'command.body'
  | 'command.argumentHint'
  | 'skill.retire'
  | 'skill.unretire'
  | 'agent.archive'
  | 'agent.unarchive'
  | 'plugin.enable'
  | 'plugin.disable'
  | 'mcp.enable'
  | 'mcp.disable'

export interface MutationRequest {
  kind: MutationKind
  entityId: string
  value?: unknown
}

/** El `value` de un plugin o de un servidor MCP de `.mcp.json`: en qué ajustes se escribe. */
export interface ValorAjustes {
  scope: 'user' | 'project' | 'local'
}

export const planMutation = (req: MutationRequest): Promise<MutationPlan> =>
  apiPost<MutationPlan>('/api/mutations/plan', { ...req, lang: getLang() })

export const applyMutation = (req: MutationRequest & { etag: string }): Promise<{ etag: string }> =>
  apiPost<{ etag: string }>('/api/mutations/apply', { ...req, lang: getLang() })

/** Lo que se crea desde la interfaz: un archivo nuevo en la carpeta de usuario o en la del proyecto activo. */
export interface CreateRequest {
  kind: 'agent' | 'skill' | 'command'
  name: string
  description: string
  body?: string
  /** Dónde nace; sin él, en el usuario. `project` exige un ámbito de proyecto abierto. */
  scope?: 'user' | 'project'
}

/** Crear no tiene etag que comprobar (el archivo aún no existe): es el plan de una mutación sin él. */
export type CreatePlan = Omit<MutationPlan, 'etag'>

export interface CreateResult {
  path: string
  etag: string
  id: string
}

export const planCreate = (req: CreateRequest): Promise<CreatePlan> =>
  apiPost<CreatePlan>('/api/entities/plan', { ...req, lang: getLang() })

export const createEntity = (req: CreateRequest): Promise<CreateResult> =>
  apiPost<CreateResult>('/api/entities/create', { ...req, lang: getLang() })
