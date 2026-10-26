import assert from 'node:assert/strict'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { type ServerHandle, startServer } from '../src/server.ts'
import type { Snapshot } from '../src/snapshot.ts'

// El socket de ingesta (AF_UNIX) tiene un límite de ruta de ~104 bytes: un HOME corto bajo /tmp.
const home = realpathSync(mkdtempSync('/tmp/aio-srv-'))
process.env.CLAUDE_HOME = home

const doc = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: d ${name}\n${extra}---\ncuerpo\n`
for (const d of ['agents/.archivo', 'commands', 'skills/viva', 'skills/jubilada']) {
  mkdirSync(join(home, d), { recursive: true })
}
writeFileSync(join(home, 'agents/activo.md'), doc('activo'))
writeFileSync(join(home, 'agents/.archivo/viejo.md'), doc('viejo'))
writeFileSync(join(home, 'skills/viva/SKILL.md'), doc('viva'))
writeFileSync(
  join(home, 'skills/jubilada/SKILL.md'),
  doc('jubilada', 'disable-model-invocation: true\n'),
)
writeFileSync(join(home, 'commands/x.md'), '---\ndescription: x\n---\ncuerpo\n')
writeFileSync(join(home, 'settings.json'), JSON.stringify({ cleanupPeriodDays: 45 }))
writeFileSync(
  join(home, 'history.jsonl'),
  `${JSON.stringify({ display: '/x ahora', timestamp: 1_700_000_000_000, project: '/p', sessionId: 's1' })}\n`,
)

let server: ServerHandle
test.before(async () => {
  server = await startServer(0)
})
test.after(async () => {
  await server.close()
  rmSync(home, { recursive: true, force: true })
})

const api = (path: string, body?: unknown) =>
  fetch(`http://127.0.0.1:${server.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${server.token}`,
      'x-ai-office': '1',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const snapshot = async (): Promise<Snapshot> =>
  (await api('/api/snapshot')).json() as Promise<Snapshot>

test('el token se guarda al escuchar, y un segundo arranque no lo invalida', async () => {
  const tokenPath = join(home, 'ai-office/run/token')
  assert.equal(readFileSync(tokenPath, 'utf8'), server.token)
  await assert.rejects(() => startServer(server.port), /already listening on port/)
  assert.equal(readFileSync(tokenPath, 'utf8'), server.token, 'el token del primero sigue vigente')
})

test('la ruta codificada no salta el token, con una petición HTTP real', async () => {
  const res = await fetch(`http://127.0.0.1:${server.port}/%61pi/mutations/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ai-office': '1' },
    body: '{}',
  })
  assert.equal(res.status, 401)
})

test('el snapshot trae scanErrors, la ventana, los jubilados y la actividad de los comandos', async () => {
  const snap = await snapshot()
  assert.deepEqual(snap.scanErrors, [])
  assert.equal(snap.stats.historyWindowDays, 45)
  assert.equal(snap.stats.skillsRetired, 1)
  assert.equal(snap.stats.activeRatio, 0, 'una skill viva sin uso: 0 de 1, sin contar la jubilada')
  assert.equal(snap.stats.commandsUsed, 1)
  assert.equal(snap.activity['command:claude-code/user/x']?.uses, 1)
  // Archivados: se listan para poder restaurarlos, pero no cuentan.
  assert.equal(snap.stats.agents, 1)
  const viejo = snap.catalog.agents.find((a) => a.name === 'viejo')
  assert.equal(viejo?.archived, true)
  assert.ok(!snap.planta.salas.some((s) => s.agents.includes(viejo?.id ?? '')))
})

test('agent.unarchive restaura el agente y una mutación no reescanea el historial', async () => {
  const before = await snapshot()
  const id = before.catalog.agents.find((a) => a.archived)?.id as string

  // Un prompt nuevo en history.jsonl: solo debe verse tras /api/refresh, no tras una mutación.
  appendFileSync(
    join(home, 'history.jsonl'),
    `${JSON.stringify({ display: 'hola', timestamp: 1 })}\n`,
  )

  const plan = await (
    await api('/api/mutations/plan', { kind: 'agent.unarchive', entityId: id })
  ).json()
  assert.ok(plan.etag)
  const applied = await api('/api/mutations/apply', {
    kind: 'agent.unarchive',
    entityId: id,
    etag: plan.etag,
  })
  assert.equal(applied.status, 200)
  assert.ok(existsSync(join(home, 'agents/viejo.md')))
  assert.ok(!existsSync(join(home, 'agents/.archivo/viejo.md')))

  const after = await snapshot()
  assert.equal(after.stats.agents, 2, 'el catálogo se reescaneó')
  assert.equal(after.stats.historyPrompts, before.stats.historyPrompts, 'el historial se reutilizó')

  const refreshed = (await (await api('/api/refresh', {})).json()) as Snapshot
  assert.equal(refreshed.stats.historyPrompts, before.stats.historyPrompts + 1)
})

test('restaurar un agente que no está archivado se rechaza', async () => {
  const snap = await snapshot()
  const id = snap.catalog.agents.find((a) => a.name === 'activo')?.id as string
  const res = await api('/api/mutations/plan', { kind: 'agent.unarchive', entityId: id })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; code: string; reason: string }
  assert.match(body.error, /is not archived/)
  assert.equal(body.code, 'invalid-request')
  assert.equal(body.reason, 'not-archived')
})

test('un WebSocket que no manda su primer frame se cierra', async () => {
  const second = await startServerForSocket()
  try {
    const closed = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${second.port}/api/live`)
      const giveUp = setTimeout(() => resolve(false), 3000)
      ws.addEventListener('close', () => {
        clearTimeout(giveUp)
        resolve(true)
      })
    })
    assert.equal(closed, true)
  } finally {
    await second.close()
  }
})

/** Otro servidor, con el plazo del primer frame recortado para no esperar 5 s. */
const startServerForSocket = async (): Promise<ServerHandle> => {
  // El primero ya ocupa el socket de ingesta: el segundo sigue funcionando sin él (`.catch`).
  return startServer(0, { helloTimeoutMs: 150 })
}

test('los errores salen como { error, code } con un código estable', async () => {
  const noToken = await fetch(`http://127.0.0.1:${server.port}/api/snapshot`)
  assert.equal(noToken.status, 401)
  assert.equal(((await noToken.json()) as { code: string }).code, 'unauthorized')

  const noHeader = await fetch(`http://127.0.0.1:${server.port}/api/refresh`, {
    method: 'POST',
    headers: { authorization: `Bearer ${server.token}`, 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(noHeader.status, 403)
  assert.equal(((await noHeader.json()) as { code: string }).code, 'missing-header')

  const badOrigin = await fetch(`http://127.0.0.1:${server.port}/api/snapshot`, {
    headers: { origin: 'http://evil.example', authorization: `Bearer ${server.token}` },
  })
  assert.equal(badOrigin.status, 403)
  assert.equal(((await badOrigin.json()) as { code: string }).code, 'forbidden-origin')

  const missing = await api('/api/mutations/plan', { kind: 'agent.color', entityId: 'nope' })
  assert.equal(missing.status, 404)
  const body = (await missing.json()) as { error: string; code: string; reason: string }
  assert.equal(body.code, 'not-found')
  assert.equal(body.reason, 'entity-not-found')
  assert.match(body.error, /does not exist/)

  const unknown = await api('/api/no-such-route', {})
  assert.equal(unknown.status, 404)
  assert.equal(((await unknown.json()) as { code: string }).code, 'not-found')
})

test('un conflicto de etag es 409 con code conflict y currentEtag', async () => {
  const snap = await snapshot()
  const id = snap.catalog.agents.find((a) => a.name === 'activo')?.id as string
  const res = await api('/api/mutations/apply', {
    kind: 'agent.color',
    entityId: id,
    value: 'blue',
    etag: 'etag-viejo',
  })
  assert.equal(res.status, 409)
  const body = (await res.json()) as { code: string; currentEtag: string }
  assert.equal(body.code, 'conflict')
  assert.ok(body.currentEtag)
})
