import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { agentesArchivados, claveDeConjunto, sinArchivados } from '../src/derivados.ts'
import type { Agent, Snapshot } from '../src/types.ts'

const agente = (name: string, archived = false): Agent =>
  ({
    id: `agent/${name}`,
    kind: 'agent',
    name,
    description: '',
    status: 'active',
    problems: [],
    source: { path: '', realPath: '', symlink: false },
    tools: null,
    model: null,
    color: null,
    preloadedSkills: [],
    bodyTokens: 0,
    ...(archived ? { archived: true } : {}),
  }) as Agent

const snap = (agents: Agent[], salas: Snapshot['planta']['salas']): Snapshot =>
  ({
    catalog: { agents, skills: [], commands: [], roots: [] },
    edges: [],
    activity: {},
    vocabularyGaps: {},
    planta: { salas, archivoComun: [], deposito: [], tablonComun: [], tablonHuerfano: [] },
    mainThreadId: 'main',
    stats: {} as Snapshot['stats'],
  }) as Snapshot

const sala = (id: string, agents: string[]) => ({
  id,
  nombre: id,
  tipo: 'skill' as const,
  motivo: '',
  agents,
  skills: [],
  commands: [],
})

describe('agentes archivados', () => {
  it('se separan de lo que se dibuja y siguen disponibles para restaurarlos', () => {
    const s = snap([agente('a'), agente('b', true)], [sala('x', ['agent/a', 'agent/b'])])
    assert.deepEqual(
      agentesArchivados(s).map((a) => a.name),
      ['b'],
    )
    const v = sinArchivados(s)
    assert.deepEqual(
      v.catalog.agents.map((a) => a.name),
      ['a'],
    )
    assert.deepEqual(v.planta.salas[0]?.agents, ['agent/a'])
  })

  it('un despacho que solo tenía archivados desaparece con ellos', () => {
    const s = snap(
      [agente('a'), agente('b', true)],
      [sala('x', ['agent/a']), sala('y', ['agent/b'])],
    )
    assert.deepEqual(
      sinArchivados(s).planta.salas.map((x) => x.id),
      ['x'],
    )
  })

  it('sin archivados devuelve el mismo objeto (no invalida los memo)', () => {
    const s = snap([agente('a')], [sala('x', ['agent/a'])])
    assert.equal(sinArchivados(s), s)
  })
})

describe('claveDeConjunto', () => {
  it('no cambia con los números de uso, sí cuando aparece o desaparece algo', () => {
    const a = snap([agente('a')], [sala('x', ['agent/a'])])
    const b = { ...a, activity: { 'agent/a': {} as never } }
    assert.equal(claveDeConjunto(a), claveDeConjunto(b))
    const c = snap([agente('a'), agente('z')], [sala('x', ['agent/a', 'agent/z'])])
    assert.notEqual(claveDeConjunto(a), claveDeConjunto(c))
  })
})
