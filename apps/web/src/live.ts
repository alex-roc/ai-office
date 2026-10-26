import { useEffect, useRef, useSyncExternalStore } from 'react'
import { abrirSocketVivo } from './api.ts'
import { esperaTras } from './reconexion.ts'

/**
 * Cliente de eventos en vivo.
 *
 * Reglas que hereda del contrato: cada evento trae un `seq` monotónico, así que al reconectar se
 * pide desde el último visto y no se pierde nada; si el servidor ya no tiene ese `seq` en su
 * buffer, responde que hay que recargar el snapshot entero.
 *
 * El estado vive FUERA de React, en un almacén con suscripción por selector. Un evento en vivo
 * llega varias veces por segundo mientras alguien trabaja; si el estado viviera en `App`, cada
 * uno re-renderizaría la aplicación entera. Así solo se re-renderiza quien lee lo que cambió
 * (el contador de sesiones, el indicador de conexión) y la Sala se entera por `onEvento` sin
 * pasar por React.
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
  /** Solo es true tras AUTENTICAR: el servidor contesta al primer frame o cierra sin decir nada. */
  connected: boolean
  sessions: LiveSession[]
  /** Intentos fallidos seguidos: con varios, lo más probable es un token caducado. */
  fallos: number
}

const INICIAL: LiveState = { connected: false, sessions: [], fallos: 0 }

let state: LiveState = INICIAL
const suscriptores = new Set<() => void>()
const oyentesEvento = new Set<(e: LiveEvent) => void>()

const poner = (cambio: Partial<LiveState>): void => {
  const siguiente = { ...state, ...cambio }
  if (
    siguiente.connected === state.connected &&
    siguiente.sessions === state.sessions &&
    siguiente.fallos === state.fallos
  ) {
    return
  }
  state = siguiente
  for (const f of suscriptores) f()
}

const suscribir = (f: () => void): (() => void) => {
  suscriptores.add(f)
  return () => {
    suscriptores.delete(f)
  }
}

/** Lee una porción del estado. El selector debe devolver un valor estable (primitivo o referencia). */
export const useLiveSelector = <T>(selector: (s: LiveState) => T): T =>
  useSyncExternalStore(suscribir, () => selector(state))

/** Cada evento recibido, sin pasar por React: así es como la Sala enciende una figura. */
export const onEvento = (f: (e: LiveEvent) => void): (() => void) => {
  oyentesEvento.add(f)
  return () => {
    oyentesEvento.delete(f)
  }
}

/**
 * Mantiene la conexión mientras el componente vive. Se reconecta con el token nuevo cuando
 * cambia (el daemon genera uno en cada arranque). No devuelve estado: no re-renderiza a quien la use.
 */
export const useLiveConnection = (token: string, onResync: () => void): void => {
  const seqRef = useRef(0)
  const onResyncRef = useRef(onResync)
  onResyncRef.current = onResync

  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let retry: ReturnType<typeof setTimeout> | null = null
    let fallos = 0
    // Con otro token los `seq` del servidor anterior no valen: se pide desde cero.
    seqRef.current = 0

    const connect = () => {
      if (closed) return
      ws = abrirSocketVivo()

      ws.onopen = () => {
        // El token va en el primer frame, nunca en la query string: no queda en logs.
        // `connected` NO se pone aquí: un token malo también abre el socket, y el servidor lo
        // cierra sin decir por qué. Se considera conectado al recibir la primera respuesta.
        ws?.send(JSON.stringify({ token, resumeFrom: seqRef.current }))
      }

      ws.onmessage = (msg) => {
        let payload: unknown
        try {
          payload = JSON.parse(String(msg.data))
        } catch {
          return
        }
        if (fallos !== 0 || !state.connected) {
          fallos = 0
          poner({ connected: true, fallos: 0 })
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
        if (data.sessions) poner({ sessions: data.sessions })
        for (const e of data.events ?? []) {
          if (e.seq > seqRef.current) seqRef.current = e.seq
          for (const f of oyentesEvento) f(e)
        }
      }

      ws.onclose = () => {
        ws = null
        if (closed) return
        fallos++
        poner({ connected: false, fallos })
        retry = setTimeout(connect, esperaTras(fallos))
      }
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      ws?.close()
      poner({ connected: false, sessions: [], fallos: 0 })
    }
  }, [token])
}
