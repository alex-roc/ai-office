import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  direccionInicial,
  filasLedger,
  filtrarFilas,
  herramientasTop,
  ordenarFilas,
} from '../src/ledger.ts'
import {
  agente,
  piezasDePlugin,
  plugin,
  servidor,
  skill,
  snapshot,
  uso,
} from './fixtures-alcance.ts'

const base = { tipo: 'all' as const, soloSinUsar: false, busqueda: '' }

const con = () => {
  const on = piezasDePlugin('on')
  const off = piezasDePlugin('off')
  const propia = agente('ana')
  const tapada = agente('beto', {
    status: 'shadowed',
    shadowedBy: 'agent:claude-code/project/beto',
  })
  const deProyecto = agente('beto', {
    id: 'agent:claude-code/project/beto',
    scope: 'project',
  })
  const gh = servidor('github', { enabled: true })
  const pg = servidor('pg')
  const figma = servidor('figma', {
    id: 'mcp:claude-code/project/figma',
    scope: 'project',
    enabled: false,
  })
  const pOn = plugin('on', { skills: [on.s.id], descriptionTokens: 30 })
  const pOff = plugin('off', { enabled: false, skills: [off.s.id], descriptionTokens: 12 })
  return filasLedger(
    snapshot({
      agents: [propia, tapada, deProyecto],
      skills: [skill('uno'), on.s, off.s],
      plugins: [pOn, pOff],
      mcpServers: [gh, pg, figma],
      activity: {
        [gh.id]: uso(gh.id, 32, { byTool: { list_issues: 10, get_diff: 13, x: 3 } }),
        [pOn.id]: uso(pOn.id, 7),
      },
    }),
  )
}

describe('filas de plugins y servidores', () => {
  it('hay una fila por plugin y por servidor, con su tipo', () => {
    const f = con()
    assert.equal(f.filter((r) => r.kind === 'plugin').length, 2)
    assert.equal(f.filter((r) => r.kind === 'mcp').length, 3)
  })

  it('un plugin lleva su coste en tokens y su estado', () => {
    const f = con()
    const on = f.find((r) => r.kind === 'plugin' && r.origen === 'on')
    const off = f.find((r) => r.kind === 'plugin' && r.origen === 'off')
    assert.equal(on?.descTokens, 30)
    assert.equal(on?.enabled, true)
    assert.equal(on?.uses, 7)
    assert.equal(off?.enabled, false)
  })

  it('las entidades de un plugin apagado salen como no cargadas, con su origen', () => {
    const f = con()
    const s = f.find((r) => r.name === 'off:tag')
    assert.equal(s?.scope, 'plugin')
    assert.equal(s?.origen, 'off')
    assert.equal(s?.enabled, false)
    assert.equal(f.find((r) => r.name === 'on:tag')?.enabled, true)
  })

  it('un servidor de usuario no sabe si está habilitado (por proyecto): null', () => {
    const f = con()
    assert.equal(f.find((r) => r.name === 'pg')?.enabled, null)
    assert.equal(f.find((r) => r.name === 'figma')?.enabled, false)
    assert.equal(f.find((r) => r.name === 'github')?.enabled, true)
  })

  it('un servidor trae sus herramientas más usadas, de más a menos', () => {
    const gh = con().find((r) => r.name === 'github')
    assert.deepEqual(gh?.tools, [
      ['get_diff', 13],
      ['list_issues', 10],
      ['x', 3],
    ])
    assert.equal(con().find((r) => r.name === 'pg')?.tools, null)
  })

  it('una entidad tapada dice quién la tapa y no cuenta como habilitada', () => {
    const t = con().find((r) => r.name === 'beto' && r.scope === 'user')
    assert.equal(t?.shadowedBy, 'agent:claude-code/project/beto')
    assert.equal(t?.enabled, false)
  })
})

describe('filtros del Registro con plugins y MCP', () => {
  it('por tipo', () => {
    const f = con()
    assert.deepEqual(
      filtrarFilas(f, { ...base, tipo: 'plugin' }).map((r) => r.kind),
      ['plugin', 'plugin'],
    )
    assert.equal(filtrarFilas(f, { ...base, tipo: 'mcp' }).length, 3)
  })

  it('por ámbito: local cuenta como proyecto y plugin incluye al plugin y a sus piezas', () => {
    const f = con()
    const nombres = (a: 'user' | 'project' | 'plugin') =>
      filtrarFilas(f, { ...base, ambito: a })
        .map((r) => r.name)
        .sort()
    assert.deepEqual(nombres('project'), ['beto', 'figma'])
    assert.deepEqual(nombres('plugin'), ['off:tag', 'on:tag', 'off@mkt', 'on@mkt'].sort())
    assert.ok(nombres('user').includes('github'))
    assert.ok(!nombres('user').includes('figma'))
  })

  it('sin `ambito` (los llamadores antiguos) no filtra por ámbito', () => {
    assert.equal(filtrarFilas(con(), base).length, con().length)
  })

  it('el tipo y el ámbito se combinan', () => {
    const f = filtrarFilas(con(), { ...base, tipo: 'mcp', ambito: 'project' })
    assert.deepEqual(
      f.map((r) => r.name),
      ['figma'],
    )
  })
})

describe('orden por ámbito y por habilitado', () => {
  it('por ámbito de A a Z, y por habilitado con los desconocidos al final', () => {
    const f = con()
    assert.equal(direccionInicial('scope'), 'asc')
    const porAmbito = ordenarFilas(f, 'scope', 'asc').map((r) => r.scope)
    assert.deepEqual(porAmbito, [...porAmbito].sort())
    const porEstado = ordenarFilas(f, 'enabled', 'desc')
    assert.equal(porEstado.at(-1)?.enabled, null)
    assert.equal(porEstado[0]?.enabled, true)
  })
})

describe('herramientasTop', () => {
  it('ordena por uso con el nombre de desempate, ignora ceros y recorta', () => {
    const a = uso('m', 5, { byTool: { b: 2, a: 2, c: 7, z: 0 } })
    assert.deepEqual(herramientasTop(a), [
      ['c', 7],
      ['a', 2],
      ['b', 2],
    ])
    assert.deepEqual(herramientasTop(a, 1), [['c', 7]])
  })

  it('sin datos devuelve vacío', () => {
    assert.deepEqual(herramientasTop(undefined), [])
    assert.deepEqual(herramientasTop(uso('m', 0)), [])
  })
})
