import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeHookEvent } from '../src/ingest/normalize.ts'

const base = { session_id: 's1', cwd: '/proj', ts: 1000 }

test('cada fila de la tabla de mapeo produce el tipo correcto', () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ ...base, hook_event_name: 'SessionStart' }, 'session.start'],
    [{ ...base, hook_event_name: 'SessionEnd' }, 'session.end'],
    [{ ...base, hook_event_name: 'UserPromptSubmit' }, 'turn.start'],
    [{ ...base, hook_event_name: 'Stop' }, 'turn.end'],
    [{ ...base, hook_event_name: 'StopFailure' }, 'turn.end'],
    [{ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash' }, 'tool.start'],
    [{ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash' }, 'tool.end'],
    [{ ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash' }, 'tool.failed'],
    [
      { ...base, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' },
      'agent.start',
    ],
    [{ ...base, hook_event_name: 'SubagentStop', agent_id: 'a1' }, 'agent.stop'],
    [{ ...base, hook_event_name: 'PermissionRequest' }, 'permission.requested'],
    [{ ...base, hook_event_name: 'PermissionDenied' }, 'permission.denied'],
    [{ ...base, hook_event_name: 'TaskCreated' }, 'task.created'],
    [{ ...base, hook_event_name: 'TaskCompleted' }, 'task.completed'],
    [{ ...base, hook_event_name: 'PreCompact' }, 'compact.start'],
    [{ ...base, hook_event_name: 'PostCompact' }, 'compact.end'],
    [{ ...base, hook_event_name: 'Notification' }, 'notify'],
    [{ ...base, hook_event_name: 'ConfigChange' }, 'config.changed'],
    [{ ...base, hook_event_name: 'FileChanged' }, 'config.changed'],
  ]
  for (const [raw, expected] of cases) {
    const event = normalizeHookEvent(raw)
    assert.ok(event, `esperaba un evento para ${raw.hook_event_name}`)
    assert.equal(event!.type, expected, `hook ${raw.hook_event_name}`)
  }
})

test('PreToolUse con tool_name Skill produce skill.invoked con el nombre de la skill', () => {
  const event = normalizeHookEvent({
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'mi-skill' },
  })
  assert.equal(event?.type, 'skill.invoked')
  assert.equal(event?.skill, 'mi-skill')
})

test('el actor sale de agent_id/agent_type; sin ellos es el hilo principal', () => {
  const withAgent = normalizeHookEvent({
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    agent_id: 'ag-1',
    agent_type: 'Explore',
  })
  assert.deepEqual(withAgent?.actor, { kind: 'agent', agentId: 'ag-1', agentType: 'Explore' })

  const main = normalizeHookEvent({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash' })
  assert.deepEqual(main?.actor, { kind: 'main' })
})

test('SubagentStart mapea agent_type/agent_id al actor', () => {
  const event = normalizeHookEvent({
    ...base,
    hook_event_name: 'SubagentStart',
    agent_id: 'ag-2',
    agent_type: 'general-purpose',
  })
  assert.equal(event?.actor.agentId, 'ag-2')
  assert.equal(event?.actor.agentType, 'general-purpose')
})

test('un hook_event_name desconocido no lanza y devuelve null', () => {
  assert.equal(
    normalizeHookEvent({ ...base, hook_event_name: 'AlgoNuevoDeUnaVersionFutura' }),
    null,
  )
})

test('payloads incompletos no lanzan', () => {
  assert.equal(normalizeHookEvent(null), null)
  assert.equal(normalizeHookEvent(undefined), null)
  assert.equal(normalizeHookEvent('un string'), null)
  assert.equal(normalizeHookEvent(42), null)
  assert.equal(normalizeHookEvent({}), null) // sin session_id
  assert.equal(normalizeHookEvent({ session_id: 's1' }), null) // sin hook_event_name
  // tool_input con tipos inesperados: no debe reventar
  assert.doesNotThrow(() =>
    normalizeHookEvent({
      ...base,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: 'no-es-un-objeto',
    }),
  )
})

test('sin ts en el payload, usa la hora de normalización', () => {
  const before = Date.now()
  const event = normalizeHookEvent({ session_id: 's1', hook_event_name: 'SessionStart' })
  assert.ok(event!.ts >= before)
})

test('cwd ausente queda null, no undefined, para respetar el contrato', () => {
  const event = normalizeHookEvent({ session_id: 's1', hook_event_name: 'SessionStart' })
  assert.equal(event?.cwd, null)
})
