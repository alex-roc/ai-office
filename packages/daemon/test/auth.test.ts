import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Fastify from 'fastify'
import { createToken, normalizePath, persistToken, registerGuards } from '../src/auth.ts'

const TOKEN = 'token-de-prueba'

/** App mínima con las mismas rutas sensibles que el servidor real, detrás del guard real. */
const buildApp = async () => {
  const app = Fastify({ logger: false })
  registerGuards(app, { token: TOKEN, tokenPath: '/nada', port: 7377 })
  app.get('/api/health', async () => ({ ok: true }))
  app.get('/api/snapshot', async () => ({ secreto: true }))
  app.post('/api/mutations/apply', async () => ({ aplicado: true }))
  app.get('/api/live', async () => ({ ws: true }))
  app.get('/', async () => 'interfaz')
  await app.ready()
  return app
}

const auth = { authorization: `Bearer ${TOKEN}` }

test('sin token o con token erróneo, la API responde 401', async () => {
  const app = await buildApp()
  assert.equal((await app.inject({ url: '/api/snapshot' })).statusCode, 401)
  const wrong = await app.inject({
    url: '/api/snapshot',
    headers: { authorization: 'Bearer otro' },
  })
  assert.equal(wrong.statusCode, 401)
  const ok = await app.inject({ url: '/api/snapshot', headers: auth })
  assert.equal(ok.statusCode, 200)
})

test('una ruta codificada, en mayúsculas o con barras dobles no salta el token', async () => {
  const app = await buildApp()
  for (const url of [
    '/%61pi/mutations/apply',
    '/%61%70%69/mutations/apply',
    '/api%2Fmutations%2Fapply',
    '/%2561pi/mutations/apply',
    '/API/mutations/apply',
    '//api/mutations/apply',
    '/./api/mutations/apply',
    '/x/../api/mutations/apply',
    '/api/mutations/apply?x=1',
  ]) {
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { 'x-ai-office': '1' },
      payload: {},
    })
    // 401 si el guard la reconoce como API, 404 si el router no la resuelve: lo que NUNCA puede
    // pasar es que el manejador se ejecute sin token.
    assert.notEqual(res.statusCode, 200, `${url} llegó al manejador sin token`)
    assert.ok([401, 404].includes(res.statusCode), `${url} -> ${res.statusCode}`)
  }
})

test('la ruta codificada concreta del hallazgo exige token', async () => {
  const app = await buildApp()
  const res = await app.inject({ method: 'POST', url: '/%61pi/mutations/apply', payload: {} })
  assert.equal(res.statusCode, 401)
})

test('lo público es una lista cerrada: health, live y los estáticos', async () => {
  const app = await buildApp()
  assert.equal((await app.inject({ url: '/api/health' })).statusCode, 200)
  assert.equal((await app.inject({ url: '/api/live' })).statusCode, 200)
  assert.equal((await app.inject({ url: '/' })).statusCode, 200)
  // La variante codificada de una ruta pública también sigue siendo pública, y nada más.
  assert.equal((await app.inject({ url: '/%61pi/health' })).statusCode, 200)
})

test('un POST con token pero sin X-AI-Office se rechaza', async () => {
  const app = await buildApp()
  const sin = await app.inject({ method: 'POST', url: '/api/mutations/apply', headers: auth })
  assert.equal(sin.statusCode, 403)
  const con = await app.inject({
    method: 'POST',
    url: '/api/mutations/apply',
    headers: { ...auth, 'x-ai-office': '1' },
    payload: {},
  })
  assert.equal(con.statusCode, 200)
})

test('Host y Origin no locales se rechazan antes de mirar el token', async () => {
  const app = await buildApp()
  const host = await app.inject({
    url: '/api/health',
    headers: { host: 'evil.example.com' },
  })
  assert.equal(host.statusCode, 403)
  const origin = await app.inject({
    url: '/api/snapshot',
    headers: { ...auth, origin: 'https://evil.example.com' },
  })
  assert.equal(origin.statusCode, 403)
  const local = await app.inject({
    url: '/api/snapshot',
    headers: { ...auth, origin: 'http://localhost:7378' },
  })
  assert.equal(local.statusCode, 200)
})

test('normalizePath decodifica, colapsa y pasa a minúsculas', () => {
  assert.equal(normalizePath('/%61pi/x?y=1'), '/api/x')
  assert.equal(normalizePath('//API//x/'), '/api/x')
  assert.equal(normalizePath('/a/../api/x'), '/api/x')
  assert.equal(normalizePath('/%E0%A4%A'), null)
})

test('el token no toca el disco hasta persistToken', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aio-token-'))
  try {
    const cfg = await createToken(join(dir, 'run'), 7377)
    assert.throws(() => statSync(cfg.tokenPath))
    await persistToken(cfg)
    assert.equal(readFileSync(cfg.tokenPath, 'utf8'), cfg.token)
    assert.equal(statSync(cfg.tokenPath).mode & 0o777, 0o600)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
