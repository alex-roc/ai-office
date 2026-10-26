import { useEffect, useRef, useState } from 'react'

/**
 * Cliente de eventos en vivo.
 *
 * Reglas que hereda del contrato: cada evento trae un `seq` monotónico, así que al reconectar se
 * pide desde el último visto y no se pierde nada; si el servidor ya no tiene ese `seq` en su
 * buffer, responde que hay que recargar el snapshot entero.
 */

export interface LiveEvent {
  v: number
  seq: number
  type: string
  ts: number
  sessionId: string
  cwd: string | null
  actor: { kind: 'main' | 'agent'; agentType?: string; agentId?: string }
  tool?: string
  skill?: string
  entityId?: string
  detail?: string
  replayed?: boolean
}

export interface LiveSession {
  sessionId: string
  cwd: string | null
  status: string
  currentTool: string | null
  agents: Record<string, { agentType: string; currentTool: string | null }>
}

export interface LiveState {
  connected: boolean
  sessions: LiveSession[]
  /** Último evento por entidad, para el destello de "esto acaba de usarse". */
  lastTouch: Record<string, number>
  events: LiveEvent[]
}

const EMPTY: LiveState = { connected: false, sessions: [], lastTouch: {}, events: [] }

export const useLive = (token: string, onResync: () => void): LiveState => {
  const [state, setState] = useState<LiveState>(EMPTY)
  const seqRef = useRef(0)
  const onResyncRef = useRef(onResync)
  onResyncRef.current = onResync

  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let retry: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      const url = `ws://${window.location.host}/api/live`
      ws = new WebSocket(url)

      ws.onopen = () => {
        // El token va en el primer frame, nunca en la query string: no queda en logs.
        ws?.send(JSON.stringify({ token, resumeFrom: seqRef.current }))
        setState((s) => ({ ...s, connected: true }))
      }

      ws.onmessage = (msg) => {
        let payload: unknown
        try {
          payload = JSON.parse(String(msg.data))
        } catch {
          return
        }
        const data = payload as {
          type?: string
          events?: LiveEvent[]
          sessions?: LiveSession[]
        }
        if (data.type === 'resync') {
          seqRef.current = 0
          onResyncRef.current()
          return
        }
        setState((s) => {
          const next = { ...s }
          if (data.sessions) next.sessions = data.sessions
          if (data.events?.length) {
            const touch = { ...s.lastTouch }
            for (const e of data.events) {
              if (e.seq > seqRef.current) seqRef.current = e.seq
              if (e.entityId) touch[e.entityId] = e.ts
            }
            next.lastTouch = touch
            // Solo se guarda una cola corta: la interfaz muestra actividad, no un log.
            next.events = [...data.events, ...s.events].slice(0, 60)
          }
          return next
        })
      }

      const reconnect = () => {
        setState((s) => ({ ...s, connected: false }))
        if (closed) return
        retry = setTimeout(connect, 1500)
      }
      ws.onclose = reconnect
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      ws?.close()
    }
  }, [token])

  return state
}
