import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { OfficeEvent } from '@ai-office/core'
import { createPresenceStore } from '../src/presence.ts'

let seq = 0
const ev = (
  partial: Partial<OfficeEvent> & Pick<OfficeEvent, 'type' | 'sessionId' | 'ts'>,
): OfficeEvent => ({
  v: 1,
  seq: seq++,
  cwd: '/proj',
  actor: { kind: 'main' },
  ...partial,
})

test('una sesión con subagentes que nacen y mueren', () => {
  const store = createPresenceStore()

  store.apply(ev({ type: 'session.start', sessionId: 's1', ts: 1 }))
  let s = store.get('s1')!
  assert.equal(s.status, 'starting')

  store.apply(ev({ type: 'turn.start', sessionId: 's1', ts: 2 }))
  assert.equal(store.get('s1')!.status, 'thinking')

  store.apply(
    ev({
      type: 'agent.start',
      sessionId: 's1',
      ts: 3,
      actor: { kind: 'agent', agentId: 'ag-1', agentType: 'Explore' },
    }),
  )
  s = store.get('s1')!
  assert.ok(s.agents['ag-1'])
  assert.equal(s.agents['ag-1']!.agentType, 'Explore')
  assert.equal(s.agents['ag-1']!.currentTool, null)

  store.apply(
    ev({
      type: 'tool.start',
      sessionId: 's1',
      ts: 4,
      tool: 'Read',
      actor: { kind: 'agent', agentId: 'ag-1', agentType: 'Explore' },
    }),
  )
  assert.equal(store.get('s1')!.agents['ag-1']!.currentTool, 'Read')
  // el subagente trabajando no debe pisar el status del hilo principal
  assert.equal(store.get('s1')!.status, 'thinking')

  store.apply(
    ev({
      type: 'agent.stop',
      sessionId: 's1',
      ts: 5,
      actor: { kind: 'agent', agentId: 'ag-1', agentType: 'Explore' },
    }),
  )
  assert.equal(store.get('s1')!.agents['ag-1'], undefined)

  store.apply(ev({ type: 'tool.start', sessionId: 's1', ts: 6, tool: 'Bash' }))
  assert.equal(store.get('s1')!.status, 'working')
  assert.equal(store.get('s1')!.currentTool, 'Bash')

  store.apply(ev({ type: 'tool.end', sessionId: 's1', ts: 7, tool: 'Bash' }))
  assert.equal(store.get('s1')!.status, 'thinking')
  assert.equal(store.get('s1')!.currentTool, null)

  store.apply(ev({ type: 'turn.end', sessionId: 's1', ts: 8 }))
  assert.equal(store.get('s1')!.status, 'idle')
})

test('permission y compact cambian el status y se resuelven', () => {
  const store = createPresenceStore()
  store.apply(ev({ type: 'session.start', sessionId: 's1', ts: 1 }))
  store.apply(ev({ type: 'permission.requested', sessionId: 's1', ts: 2 }))
  assert.equal(store.get('s1')!.status, 'waiting-permission')
  store.apply(ev({ type: 'permission.denied', sessionId: 's1', ts: 3 }))
  assert.equal(store.get('s1')!.status, 'thinking')
  store.apply(ev({ type: 'compact.start', sessionId: 's1', ts: 4 }))
  assert.equal(store.get('s1')!.status, 'compacting')
  store.apply(ev({ type: 'compact.end', sessionId: 's1', ts: 5 }))
  assert.equal(store.get('s1')!.status, 'thinking')
})

test('reconcile cierra una sesión huérfana que nunca vio Stop', () => {
  const store = createPresenceStore()
  store.apply(ev({ type: 'session.start', sessionId: 's1', ts: 1 }))
  store.apply(ev({ type: 'tool.start', sessionId: 's1', ts: 2, tool: 'Bash' }))
  store.apply(ev({ type: 'session.start', sessionId: 's2', ts: 1 }))

  assert.equal(store.get('s1')!.status, 'working') // el usuario interrumpió: nunca llegó Stop

  const closed = store.reconcile(['s2'])
  assert.equal(closed.length, 1)
  assert.equal(closed[0]!.sessionId, 's1')
  assert.equal(store.get('s1')!.status, 'ended')
  assert.equal(store.get('s2')!.status, 'starting') // sigue viva, no la toca

  // una segunda pasada no vuelve a "cerrar" lo que ya estaba cerrado
  const again = store.reconcile([])
  assert.equal(
    again.some((s) => s.sessionId === 's1'),
    false,
  )
})

test('purge olvida las sesiones terminadas hace tiempo, y solo esas', () => {
  const store = createPresenceStore()
  store.apply(ev({ type: 'session.start', sessionId: 'vieja', ts: 1 }))
  store.apply(ev({ type: 'session.end', sessionId: 'vieja', ts: 2 }))
  store.apply(ev({ type: 'session.start', sessionId: 'viva', ts: 3 }))
  store.apply(ev({ type: 'session.start', sessionId: 'reciente', ts: 4 }))
  store.apply(ev({ type: 'session.end', sessionId: 'reciente', ts: 5 }))

  assert.equal(store.purge(Date.now(), 60_000), 0, 'recién terminadas: se ven un rato')
  // Una hora después, solo sobreviven las vivas.
  assert.equal(store.purge(Date.now() + 3_600_000, 60_000), 2)
  assert.deepEqual(
    store.list().map((s) => s.sessionId),
    ['viva'],
  )
})
