import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { OfficeEvent } from '@ai-office/core'
import { createEventBus } from '../src/bus.ts'

const raw = (sessionId: string, ts: number): Omit<OfficeEvent, 'seq'> => ({
  v: 1,
  type: 'turn.start',
  ts,
  sessionId,
  cwd: null,
  actor: { kind: 'main' },
})

test('publish asigna seq monotónico y notifica a los suscriptores', () => {
  const bus = createEventBus()
  const received: OfficeEvent[] = []
  bus.subscribe((e) => received.push(e))

  const a = bus.publish(raw('s1', 1))
  const b = bus.publish(raw('s1', 2))
  assert.equal(a.seq, 1)
  assert.equal(b.seq, 2)
  assert.equal(received.length, 2)
})

test('resumeFrom reenvía solo lo que falta si sigue en el buffer', () => {
  const bus = createEventBus()
  bus.publish(raw('s1', 1))
  bus.publish(raw('s1', 2))
  bus.publish(raw('s1', 3))

  const received: OfficeEvent[] = []
  const sub = bus.subscribe((e) => received.push(e), { resumeFrom: 1 })
  assert.equal(sub.needsResync, false)
  assert.deepEqual(
    received.map((e) => e.seq),
    [2, 3],
  )
})

test('resumeFrom con un seq ya expulsado del buffer pide recargar el snapshot', () => {
  const bus = createEventBus()
  // ring de 2000: forzamos que el primero se expulse publicando de más
  for (let i = 0; i < 2005; i++) bus.publish(raw('s1', i))

  const received: OfficeEvent[] = []
  const sub = bus.subscribe((e) => received.push(e), { resumeFrom: 1 })
  assert.equal(sub.needsResync, true)
  assert.equal(received.length, 0) // no se reenvía nada a medias: hay que recargar el snapshot
})

test('close deja de recibir eventos', () => {
  const bus = createEventBus()
  const received: OfficeEvent[] = []
  const sub = bus.subscribe((e) => received.push(e))
  bus.publish(raw('s1', 1))
  sub.close()
  bus.publish(raw('s1', 2))
  assert.equal(received.length, 1)
})
