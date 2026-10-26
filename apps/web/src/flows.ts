import { apiPost } from './api.ts'
import { getLang } from './i18n/index.ts'
import type { MutationPlan } from './mutations.ts'

/**
 * Cliente del editor de flujos: abrir un comando, previsualizarlo y guardarlo. Todas las
 * peticiones llevan `lang`: el Markdown que se genera (y se escribe en disco) sale en el idioma
 * de la interfaz.
 */

export interface FlowStep {
  agent: string
  task: string
  skills?: string[]
  phase?: number
}

export interface Flow {
  name: string
  description: string
  steps: FlowStep[]
  notes?: string
}

export interface FlowResponse {
  flow: Flow
  markdown: string
  path: string
  etag: string
  exists: boolean
}

export const openFlow = (commandId: string): Promise<FlowResponse> =>
  apiPost<FlowResponse>('/api/flows/open', { commandId, lang: getLang() })

export const previewFlow = (flow: Flow): Promise<FlowResponse> =>
  apiPost<FlowResponse>('/api/flows/preview', { flow, lang: getLang() })

export const planFlow = (flow: Flow): Promise<MutationPlan> =>
  apiPost<MutationPlan>('/api/flows/plan', { flow, lang: getLang() })

export const saveFlow = (flow: Flow, etag: string): Promise<{ path: string; etag: string }> =>
  apiPost<{ path: string; etag: string }>('/api/flows/save', { flow, etag, lang: getLang() })
