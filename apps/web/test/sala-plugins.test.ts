import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildLayout, LUCES_RACK } from '../src/sala/layout.ts'
import { ALTO_RACK, ANCHO_RACK, luzDeRack, rack } from '../src/sala/texturas.ts'
import { aplicarShow } from '../src/show.ts'
import {
  agente,
  piezasDePlugin,
  plugin,
  servidor,
  skill,
  snapshot,
  uso,
} from './fixtures-alcance.ts'

/** Cuántos píxeles de un rack son "verdes" de luz encendida en la bandeja `i`. */
const encendida = (l: ReturnType<typeof rack>, i: number): boolean => {
  const { x, y } = luzDeRack(i)
  const o = (y * l.w + x) * 4
  // La luz encendida es salvia aclarada: su verde domina; apagada es un gris pardo.
  return (l.data[o + 1] ?? 0) > (l.data[o] ?? 0) + 10
}

describe('rack', () => {
  it('enciende tantas luces como se piden', () => {
    for (const n of [0, 1, 3, LUCES_RACK]) {
      const l = rack(n)
      assert.equal(l.w, ANCHO_RACK)
      assert.equal(l.h, ALTO_RACK)
      const lit = Array.from({ length: LUCES_RACK }, (_, i) => encendida(l, i)).filter(Boolean)
      assert.equal(lit.length, n)
    }
  })

  it('las luces se encienden de arriba abajo', () => {
    const l = rack(2)
    assert.deepEqual(
      Array.from({ length: LUCES_RACK }, (_, i) => encendida(l, i)),
      [true, true, false, false, false],
    )
  })
})

describe('bahías de plugin y de servidores', () => {
  const on = piezasDePlugin('on')
  const p = plugin('on', { agents: [on.a.id], skills: [on.s.id], commands: [on.c.id] })
  const gh = servidor('github', { enabled: true })
  const pg = servidor('pg', { enabled: true })
  const off = servidor('figma', { enabled: false })
  const s = snapshot({
    agents: [agente('ana'), on.a],
    skills: [on.s],
    commands: [on.c],
    plugins: [p],
    mcpServers: [gh, pg, off],
    activity: { [gh.id]: uso(gh.id, 30, { grade: 'certified' }), [off.id]: uso(off.id, 4) },
  })

  it('un despacho por plugin, con sus piezas, y una sala de servidores', () => {
    const l = buildLayout(s)
    const bp = l.bahias.find((b) => b.tipo === 'plugin')
    assert.equal(bp?.plugin?.id, p.id)
    assert.equal(bp?.nombre, 'on')
    assert.deepEqual(
      bp?.agentes.map((a) => a.id),
      [on.a.id],
    )
    assert.equal(bp?.lomos.length, 1)
    assert.equal(bp?.tarjetas.length, 1)
    const sv = l.bahias.find((b) => b.tipo === 'servers')
    assert.equal(sv?.racks.length, 3)
    // vestíbulo + plugin + servidores
    assert.equal(l.bahias.length, 3)
  })

  it('el estado y las luces del rack salen del dato', () => {
    const r = buildLayout(s).bahias.find((b) => b.tipo === 'servers')?.racks ?? []
    const por = (n: string) => r.find((x) => x.name === n)
    assert.equal(por('github')?.estado, 'busy')
    assert.equal(por('github')?.luces, LUCES_RACK)
    assert.equal(por('pg')?.estado, 'idle')
    assert.equal(por('pg')?.luces, 0)
    assert.equal(por('figma')?.estado, 'off')
  })

  it('ninguna bahía se solapa con otra, con o sin plugin', () => {
    const l = buildLayout(s)
    for (let i = 0; i < l.bahias.length; i++) {
      for (let j = i + 1; j < l.bahias.length; j++) {
        const a = l.bahias[i]
        const b = l.bahias[j]
        if (!a || !b) continue
        const separadas =
          a.col1 <= b.col0 || b.col1 <= a.col0 || a.row1 <= b.row0 || b.row1 <= a.row0
        assert.ok(separadas, `${a.id} y ${b.id} se solapan`)
      }
    }
  })

  it('con Show sin plugins ni MCP no hay ni despacho ni sala de servidores', () => {
    const v = aplicarShow(s, {
      agents: true,
      skills: true,
      commands: true,
      plugins: false,
      mcp: false,
    })
    const l = buildLayout(v)
    assert.equal(l.bahias.filter((b) => b.tipo === 'plugin' || b.tipo === 'servers').length, 0)
  })

  it('un plugin sin ninguna pieza dibujable no ocupa una celda', () => {
    const vacio = plugin('solo-mcp', { mcpServers: [gh.id] })
    const l = buildLayout(snapshot({ plugins: [vacio], mcpServers: [gh] }))
    assert.equal(l.bahias.filter((b) => b.tipo === 'plugin').length, 0)
  })

  it('lo tapado va al vestíbulo, marcado con quién lo tapa', () => {
    const tapado = agente('beto', {
      status: 'shadowed',
      shadowedBy: 'agent:claude-code/project/beto',
    })
    const tapadaSkill = skill('s', {
      status: 'shadowed',
      shadowedBy: 'skill:claude-code/project/s',
    })
    const l = buildLayout(snapshot({ agents: [tapado], skills: [tapadaSkill] }))
    const hub = l.bahias.find((b) => b.tipo === 'hub')
    assert.deepEqual(hub?.agentes[0]?.tapada, { name: 'beto', scope: 'project' })
    assert.deepEqual(hub?.lomos[0]?.tapada, { name: 's', scope: 'project' })
  })
})
