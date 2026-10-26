import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import type { NormalizedEvent } from '../src/ingest/normalize.ts'
import { startIngestSocket } from '../src/ingest/socket.ts'
import { createDedupeCache, drainSpool, watchSpool } from '../src/ingest/spool.ts'

// AF_UNIX limita sun_path a ~104 bytes en macOS: usamos un HOME corto bajo /tmp, no el
// scratchpad del proyecto (demasiado profundo para caber).
const createdDirs: string[] = []
const tmpDir = (prefix: string) => {
  const dir = mkdtempSync(`/tmp/${prefix}-`)
  createdDirs.push(dir)
  return dir
}
test.after(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true })
})

const send = (socketPath: string, line: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const client = createConnection(socketPath)
    client.on('connect', () => client.end(line))
    client.on('close', () => resolve())
    client.on('error', reject)
  })

test('el servidor de ingesta normaliza lo que llega por el socket', async () => {
  const dir = tmpDir('aio-sock')
  const socketPath = join(dir, 'ingest.sock')
  const received: NormalizedEvent[] = []
  const handle = await startIngestSocket(socketPath, (e) => received.push(e))

  assert.equal(statSync(socketPath).mode & 0o777, 0o600)

  await send(
    socketPath,
    `${JSON.stringify({ hook_event_name: 'SessionStart', session_id: 's1' })}\n`,
  )
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(received.length, 1)
  assert.equal(received[0]!.type, 'session.start')

  await handle.close()
})

test('un socket huérfano (archivo sin nadie escuchando) se limpia solo', async () => {
  const dir = tmpDir('aio-sock')
  const socketPath = join(dir, 'ingest.sock')
  writeFileSync(socketPath, '') // simula el archivo que deja un daemon que murió mal

  const handle = await startIngestSocket(socketPath, () => {})
  await handle.close()
})

test('si ya hay un servidor escuchando, arrancar un segundo falla', async () => {
  const dir = tmpDir('aio-sock')
  const socketPath = join(dir, 'ingest.sock')
  const handle = await startIngestSocket(socketPath, () => {})
  await assert.rejects(() => startIngestSocket(socketPath, () => {}))
  await handle.close()
})

test('drainSpool ingiere y borra los ndjson pendientes, marcando replayed', () => {
  const dir = tmpDir('aio-spool')
  const line1 = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 's1', ts: 1 })
  const line2 = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's1', ts: 2 })
  writeFileSync(join(dir, '2026-09-01.ndjson'), `${line1}\n${line2}\n`)

  const received: NormalizedEvent[] = []
  drainSpool(dir, (e) => received.push(e))

  assert.equal(received.length, 2)
  assert.equal(received[0]!.replayed, true)
  assert.throws(() => statSync(join(dir, '2026-09-01.ndjson'))) // se borró
})

test('drainSpool no revienta con líneas corruptas', () => {
  const dir = tmpDir('aio-spool')
  writeFileSync(join(dir, '2026-09-01.ndjson'), 'esto no es json\n')
  const received: NormalizedEvent[] = []
  assert.doesNotThrow(() => drainSpool(dir, (e) => received.push(e)))
  assert.equal(received.length, 0)
})

test('el dedupe evita reprocesar lo que ya llegó por el socket', () => {
  const dedupe = createDedupeCache(5000)
  const key = { sessionId: 's1', type: 'tool.start', toolUseId: 'tu-1', ts: 10 }
  assert.equal(dedupe.seen(key), false) // primera vez: nuevo
  assert.equal(dedupe.seen(key), true) // segunda vez: duplicado
})

test('el dedupe expulsa lo más viejo al superar el límite', () => {
  const dedupe = createDedupeCache(2)
  dedupe.seen({ sessionId: 'a', type: 't', ts: 1 })
  dedupe.seen({ sessionId: 'b', type: 't', ts: 2 })
  dedupe.seen({ sessionId: 'c', type: 't', ts: 3 }) // expulsa 'a'
  assert.equal(dedupe.seen({ sessionId: 'a', type: 't', ts: 1 }), false) // ya no lo recuerda
  assert.equal(dedupe.seen({ sessionId: 'c', type: 't', ts: 3 }), true) // este sigue vivo
})

test('watchSpool drena lo que ya había y lo que se escribe después', async () => {
  const dir = tmpDir('aio-spool')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '2026-09-01.ndjson'),
    `${JSON.stringify({ hook_event_name: 'SessionStart', session_id: 's1', ts: 1 })}\n`,
  )

  const received: NormalizedEvent[] = []
  const handle = watchSpool(dir, (e) => received.push(e))
  assert.equal(received.length, 1, 'drena lo pendiente al arrancar')

  writeFileSync(
    join(dir, '2026-09-02.ndjson'),
    `${JSON.stringify({ hook_event_name: 'SessionEnd', session_id: 's1', ts: 2 })}\n`,
  )

  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (received.length >= 2) {
        clearInterval(check)
        resolve(undefined)
      }
    }, 20)
  })
  assert.equal(received.length, 2)
  handle.close()
})
