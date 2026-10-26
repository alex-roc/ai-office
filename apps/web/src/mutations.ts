import { getToken } from './api.ts'

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

export interface MutationRequest {
  kind: MutationKind
  entityId: string
  value?: unknown
}

const headers = (): HeadersInit => ({
  authorization: `Bearer ${getToken()}`,
  'x-ai-office': '1',
  'content-type': 'application/json',
})

const post = async <T>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) {
    let message = `El servidor respondió ${res.status}`
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string }
      message = parsed.error ?? parsed.message ?? message
    } catch {
      /* respuesta no JSON: se usa el mensaje genérico */
    }
    throw new Error(message)
  }
  return JSON.parse(text) as T
}

export const planMutation = (req: MutationRequest): Promise<MutationPlan> =>
  post<MutationPlan>('/api/mutations/plan', req)

export const applyMutation = (req: MutationRequest & { etag: string }): Promise<{ etag: string }> =>
  post<{ etag: string }>('/api/mutations/apply', req)
