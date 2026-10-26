import { EventEmitter } from 'node:events'
import type { OfficeEvent } from '@ai-office/core'

/**
 * Fan-out de eventos hacia los clientes conectados (la interfaz, por SSE o WebSocket). Asigna el
 * `seq` monotónico que falta en lo que produce `normalize.ts`, y guarda los últimos 2.000 eventos
 * para que un cliente que se reconecta (p. ej. tras dormir el portátil) pueda pedir "mándame lo que
 * me perdí" en vez de recargar el snapshot entero.
 *
 * Sin dependencias externas a propósito: es la pieza que más veces por segundo se toca.
 */

const RING_SIZE = 2000

export interface SubscribeOptions {
  /** El último `seq` que el cliente ya tiene. Si se omite, solo recibe eventos futuros. */
  resumeFrom?: number
}

export interface Subscription {
  /** `true` si `resumeFrom` ya había salido del buffer: el cliente debe recargar el snapshot. */
  needsResync: boolean
  close: () => void
}

export const createEventBus = () => {
  const emitter = new EventEmitter()
  emitter.setMaxListeners(0)
  const ring: OfficeEvent[] = []
  let seq = 0

  const publish = (event: Omit<OfficeEvent, 'seq'>): OfficeEvent => {
    seq += 1
    const full: OfficeEvent = { ...event, seq }
    ring.push(full)
    if (ring.length > RING_SIZE) ring.shift()
    emitter.emit('event', full)
    return full
  }

  const subscribe = (
    onEvent: (event: OfficeEvent) => void,
    opts: SubscribeOptions = {},
  ): Subscription => {
    let needsResync = false
    if (opts.resumeFrom !== undefined) {
      const oldest = ring[0]?.seq
      if (oldest !== undefined && opts.resumeFrom < oldest - 1) {
        // El hueco entre lo que el cliente tiene y lo más viejo que aún guardamos ya se perdió.
        needsResync = true
      } else {
        for (const e of ring) if (e.seq > opts.resumeFrom!) onEvent(e)
      }
    }
    emitter.on('event', onEvent)
    return { needsResync, close: () => emitter.off('event', onEvent) }
  }

  return {
    publish,
    subscribe,
    /** Snapshot de lo que hay en el buffer ahora mismo, para depurar o para el primer render. */
    snapshot: (): OfficeEvent[] => [...ring],
    get lastSeq() {
      return seq
    },
  }
}

export type EventBus = ReturnType<typeof createEventBus>
