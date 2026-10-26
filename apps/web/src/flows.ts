import { getToken } from './api.ts'
import type { MutationPlan } from './mutations.ts'

/** Cliente del editor de flujos: abrir un comando, previsualizarlo y guardarlo. */

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

const headers = (): HeadersInit => ({
  authorization: `Bearer ${getToken()}`,
  'x-ai-office': '1',
  'content-type': 'application/json',
})

const post = async <T>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) {
    try {
      throw new Error((JSON.parse(text) as { error?: string }).error ?? `error ${res.status}`)
    } catch (e) {
      throw e instanceof Error ? e : new Error(`error ${res.status}`)
    }
  }
  return JSON.parse(text) as T
}

export const openFlow = (commandId: string): Promise<FlowResponse> =>
  post<FlowResponse>('/api/flows/open', { commandId })

export const previewFlow = (flow: Flow): Promise<FlowResponse> =>
  post<FlowResponse>('/api/flows/preview', { flow })

export const planFlow = (flow: Flow): Promise<MutationPlan> =>
  post<MutationPlan>('/api/flows/plan', { flow })

export const saveFlow = (flow: Flow, etag: string): Promise<{ path: string; etag: string }> =>
  post<{ path: string; etag: string }>('/api/flows/save', { flow, etag })
