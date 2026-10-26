import { apiPost } from './api.ts'

/**
 * Cliente de escritura. Dos tiempos siempre: primero se pide el plan (que no toca nada y
 * devuelve el diff), el usuario lo ve, y solo entonces se aplica. Nunca hay una escritura
 * sorpresa: se está editando la configuración que gobierna todo el trabajo del usuario.
 */

export interface MutationPlan {
  path: string
  diff: string
  changed: boolean
  warnings: string[]
  etag: string
}

export type MutationKind =
  | 'agent.color'
  | 'agent.model'
  | 'agent.tools'
  | 'agent.preloadedSkills'
  | 'agent.skillMentions'
  | 'skill.description'
  | 'skill.retire'
  | 'skill.unretire'
  | 'agent.archive'
  | 'agent.unarchive'

export interface MutationRequest {
  kind: MutationKind
  entityId: string
  value?: unknown
}

export const planMutation = (req: MutationRequest): Promise<MutationPlan> =>
  apiPost<MutationPlan>('/api/mutations/plan', req)

export const applyMutation = (req: MutationRequest & { etag: string }): Promise<{ etag: string }> =>
  apiPost<{ etag: string }>('/api/mutations/apply', req)
