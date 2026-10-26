import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aplicarShow,
  itemsDePlugins,
  MAX_ITEMS_PLUGIN,
  resolverShow,
  type Show,
  showPorDefecto,
} from '../src/show.ts'
import {
  agente,
  comando,
  piezasDePlugin,
  plugin,
  servidor,
  skill,
  snapshot,
} from './fixtures-alcance.ts'

const TODO: Show = { agents: true, skills: true, commands: true, plugins: true, mcp: true }

/** Un snapshot con lo de usuario, un plugin habilitado, otro apagado y dos servidores. */
const completo = () => {
  const on = piezasDePlugin('on')
  const off = piezasDePlugin('off')
  const a = agente('ana')
  const k = skill('uno')
  const c = comando('ir')
  return {
    a,
    k,
    c,
    on,
    off,
    s: snapshot({
      agents: [a, on.a, off.a],
      skills: [k, on.s, off.s],
      commands: [c, on.c, off.c],
      plugins: [
        plugin('on', { agents: [on.a.id], skills: [on.s.id], commands: [on.c.id] }),
        plugin('off', {
          enabled: false,
          agents: [off.a.id],
          skills: [off.s.id],
          commands: [off.c.id],
        }),
      ],
      mcpServers: [servidor('github'), servidor('pg')],
      salas: [
        {
          id: 'sala/1',
          nombre: 'x',
          tipo: 'skill',
          motivo: '',
          agents: [a.id],
          skills: [k.id],
          commands: [c.id],
        },
      ],
    }),
  }
}

describe('Show por defecto', () => {
  it('todo activo salvo plugins, que dependen de cuántas piezas traen', () => {
    const { s } = completo()
    assert.deepEqual(showPorDefecto(s), TODO)
  })

  it('solo cuentan las piezas de los plugins habilitados', () => {
    const { s } = completo()
    // 3 del habilitado; las 3 del apagado no se dibujarían nunca.
    assert.equal(itemsDePlugins(s), 3)
  })

  it('con más piezas de plugin que el límite, los plugins arrancan apagados', () => {
    const muchas = Array.from({ length: MAX_ITEMS_PLUGIN + 1 }, (_, i) => skill(`p${i}`))
    const p = plugin('gordo', { skills: muchas.map((k) => k.id) })
    const s = snapshot({ skills: muchas, plugins: [p] })
    assert.equal(showPorDefecto(s).plugins, false)
    // En el límite exacto todavía entran.
    const justas = muchas.slice(0, MAX_ITEMS_PLUGIN)
    const p2 = plugin('justo', { skills: justas.map((k) => k.id) })
    assert.equal(showPorDefecto(snapshot({ skills: justas, plugins: [p2] })).plugins, true)
  })

  it('sin plugins ni servidores no pasa nada', () => {
    assert.deepEqual(showPorDefecto(snapshot({})), TODO)
  })
})

describe('resolverShow', () => {
  it('lo guardado manda y lo que falta toma el valor por defecto', () => {
    const { s } = completo()
    assert.deepEqual(resolverShow(s, { agents: false, mcp: false }), {
      ...TODO,
      agents: false,
      mcp: false,
    })
  })

  it('ignora valores que no son booleanos', () => {
    const { s } = completo()
    assert.deepEqual(resolverShow(s, { agents: 'no' } as unknown as Partial<Show>), TODO)
  })
})

describe('aplicarShow', () => {
  const ids = (l: { id: string }[]) => l.map((e) => e.id)

  it('con todo activo deja los plugins habilitados y quita los apagados', () => {
    const { s, on, off } = completo()
    const v = aplicarShow(s, TODO)
    assert.deepEqual(
      v.catalog.plugins?.map((p) => p.name),
      ['on'],
    )
    assert.ok(ids(v.catalog.agents).includes(on.a.id))
    assert.ok(!ids(v.catalog.agents).includes(off.a.id))
    assert.ok(!ids(v.catalog.skills).includes(off.s.id))
    assert.equal(v.catalog.mcpServers?.length, 2)
  })

  it('sin plugins desaparecen los plugins y todas sus piezas', () => {
    const { s, a } = completo()
    const v = aplicarShow(s, { ...TODO, plugins: false })
    assert.deepEqual(v.catalog.plugins, [])
    assert.deepEqual(ids(v.catalog.agents), [a.id])
    assert.equal(v.catalog.skills.length, 1)
    assert.equal(v.catalog.commands.length, 1)
  })

  it('sin MCP no queda ningún servidor', () => {
    const { s } = completo()
    assert.deepEqual(aplicarShow(s, { ...TODO, mcp: false }).catalog.mcpServers, [])
  })

  it('sin agentes se van también los de los plugins, y los despachos sin nadie', () => {
    const { s, on } = completo()
    const v = aplicarShow(s, { ...TODO, agents: false })
    assert.equal(v.catalog.agents.length, 0)
    // El despacho conserva su skill y su comando.
    assert.equal(v.planta.salas.length, 1)
    assert.deepEqual(v.planta.salas[0]?.agents, [])
    assert.ok(ids(v.catalog.skills).includes(on.s.id))
    const vacio = aplicarShow(s, {
      agents: false,
      skills: false,
      commands: false,
      plugins: true,
      mcp: true,
    })
    assert.equal(vacio.planta.salas.length, 0)
  })

  it('no toca el snapshot original', () => {
    const { s } = completo()
    aplicarShow(s, { ...TODO, plugins: false, agents: false })
    assert.equal(s.catalog.agents.length, 3)
    assert.equal(s.catalog.plugins?.length, 2)
  })
})
