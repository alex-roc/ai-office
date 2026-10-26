import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  direccionInicial,
  type FilaLedger,
  filasLedger,
  filtrarFilas,
  ordenarFilas,
  porProyecto,
  semanal,
  trazoSpark,
} from '../src/ledger.ts'
import type { Snapshot } from '../src/types.ts'

const fila = (p: Partial<FilaLedger> & { name: string }): FilaLedger => ({
  id: p.name,
  kind: 'skill',
  grade: 'unused',
  uses: 0,
  sessions: 0,
  projects: 0,
  lastUsedAt: null,
  weekly: null,
  descTokens: null,
  retired: false,
  cited: null,
  proven: null,
  calls: null,
  scope: 'user',
  origen: null,
  enabled: true,
  shadowedBy: null,
  tools: null,
  ...p,
})

const filas = [
  fila({ name: 'beta', uses: 5, grade: 'practicing', lastUsedAt: 100, weekly: [0, 1, 4] }),
  fila({ name: 'alfa', uses: 5, grade: 'certified', lastUsedAt: 300, weekly: [1, 1, 1] }),
  fila({ name: 'gamma', uses: 0 }),
  fila({
    name: 'Ágil',
    kind: 'agent',
    uses: 2,
    grade: 'tried',
    lastUsedAt: 200,
    cited: 3,
    proven: 1,
  }),
  fila({ name: 'ejecuta', kind: 'command', uses: 7, calls: ['a', 'b'] }),
]

describe('filtrarFilas', () => {
  const base = { tipo: 'all' as const, soloSinUsar: false, busqueda: '' }
  it('sin filtros deja todo', () => {
    assert.equal(filtrarFilas(filas, base).length, 5)
  })
  it('por tipo', () => {
    assert.deepEqual(
      filtrarFilas(filas, { ...base, tipo: 'agent' }).map((f) => f.name),
      ['Ágil'],
    )
    assert.equal(filtrarFilas(filas, { ...base, tipo: 'skill' }).length, 3)
  })
  it('solo sin usar', () => {
    assert.deepEqual(
      filtrarFilas(filas, { ...base, soloSinUsar: true }).map((f) => f.name),
      ['gamma'],
    )
  })
  it('búsqueda sin acentos ni mayúsculas, y se combina con lo demás', () => {
    assert.deepEqual(
      filtrarFilas(filas, { ...base, busqueda: ' agil ' }).map((f) => f.name),
      ['Ágil'],
    )
    assert.equal(filtrarFilas(filas, { ...base, tipo: 'command', busqueda: 'alf' }).length, 0)
  })
})

describe('ordenarFilas', () => {
  const nombres = (f: FilaLedger[]) => f.map((x) => x.name)
  it('por cifra, con el nombre como desempate estable', () => {
    assert.deepEqual(nombres(ordenarFilas(filas, 'uses', 'desc')), [
      'ejecuta',
      'alfa',
      'beta',
      'Ágil',
      'gamma',
    ])
    assert.deepEqual(nombres(ordenarFilas(filas, 'uses', 'asc')).slice(0, 2), ['gamma', 'Ágil'])
  })
  it('por grado, de certified a unused', () => {
    assert.deepEqual(nombres(ordenarFilas(filas, 'grade', 'desc')).slice(0, 3), [
      'alfa',
      'beta',
      'Ágil',
    ])
  })
  it('lo que no tiene el dato va siempre al final, en cualquier sentido', () => {
    for (const dir of ['asc', 'desc'] as const) {
      const r = ordenarFilas(filas, 'last', dir)
      assert.deepEqual(nombres(r).slice(-2).sort(), ['ejecuta', 'gamma'])
    }
    // El coste solo existe en skills: agentes y comandos al final.
    const c = ordenarFilas(
      [
        fila({ name: 'a', descTokens: 10 }),
        fila({ name: 'b', kind: 'agent' }),
        fila({ name: 'c', descTokens: 30 }),
      ],
      'cost',
      'desc',
    )
    assert.deepEqual(nombres(c), ['c', 'a', 'b'])
  })
  it('la tendencia ordena por el total de las semanas', () => {
    const r = ordenarFilas(filas, 'trend', 'desc')
    assert.deepEqual(nombres(r).slice(0, 2), ['beta', 'alfa'])
  })
  it('por nombre ignora mayúsculas y no muta la entrada', () => {
    const copia = [...filas]
    const r = ordenarFilas(filas, 'name', 'asc')
    assert.deepEqual(filas, copia)
    assert.deepEqual(nombres(r).slice(0, 2), ['Ágil', 'alfa'])
  })
  it('dirección inicial: texto ascendente, cifras descendentes', () => {
    assert.equal(direccionInicial('name'), 'asc')
    assert.equal(direccionInicial('uses'), 'desc')
  })
})

describe('trazoSpark', () => {
  it('reparte x a intervalos iguales e invierte y (el máximo arriba)', () => {
    const { linea, ultimo } = trazoSpark([0, 5, 10], 100, 20, 0)
    assert.equal(linea, 'M0 20 L50 10 L100 0')
    assert.deepEqual(ultimo, { x: 100, y: 0 })
  })
  it('respeta el margen', () => {
    const { linea } = trazoSpark([0, 10], 100, 20, 2)
    assert.equal(linea, 'M2 18 L98 2')
  })
  it('todo ceros: línea plana en la base, no una escala inventada', () => {
    assert.equal(trazoSpark([0, 0, 0], 100, 20, 0).linea, 'M0 20 L50 20 L100 20')
  })
  it('un solo valor es un punto centrado; sin valores, nada', () => {
    assert.equal(trazoSpark([3], 100, 20, 0).linea, 'M50 0')
    assert.deepEqual(trazoSpark([], 100, 20), { linea: '', ultimo: null })
  })
})

describe('filasLedger', () => {
  const snap = {
    catalog: {
      agents: [
        { id: 'a1', kind: 'agent', name: 'uno' },
        { id: 'a2', kind: 'agent', name: 'archivado', archived: true },
      ],
      skills: [
        { id: 'sk', kind: 'skill', name: 'sk', descriptionTokens: 42, disabledForModel: true },
      ],
      commands: [{ id: 'c1', kind: 'command', name: 'ejecuta' }],
      roots: [],
    },
    edges: [
      { from: 'a1', to: 'sk', kind: 'agent-uses-skill', layer: 'declared', evidence: [] },
      { from: 'a1', to: 'sk2', kind: 'agent-uses-skill', layer: 'preloaded', evidence: [] },
      { from: 'a1', to: 'sk', kind: 'agent-uses-skill', layer: 'proven', evidence: [] },
      { from: 'c1', to: 'a1', kind: 'command-invokes-agent', layer: 'declared', evidence: [] },
    ],
    activity: {
      a1: { uses: 4, sessions: 2, projects: 1, lastUsedAt: 9, grade: 'tried', weekly: [0, 4] },
    },
  } as unknown as Snapshot
  it('una fila por entidad viva, con lo que corresponde a cada tipo', () => {
    const f = filasLedger(snap)
    assert.deepEqual(
      f.map((x) => x.name),
      ['uno', 'sk', 'ejecuta'],
    )
    const [agente, skill, comando] = f as [FilaLedger, FilaLedger, FilaLedger]
    assert.deepEqual([agente.cited, agente.proven, agente.uses, agente.grade], [2, 1, 4, 'tried'])
    assert.deepEqual(
      [skill.descTokens, skill.retired, skill.grade, skill.weekly],
      [42, true, 'unused', null],
    )
    assert.deepEqual(comando.calls, ['a1'])
  })
})

describe('lecturas defensivas', () => {
  it('semanal y porProyecto toleran su ausencia', () => {
    assert.equal(semanal(undefined), null)
    assert.deepEqual(porProyecto(undefined), [])
    assert.deepEqual(porProyecto({ byProject: { '~/b': 1, '~/a': 3 } } as never), [
      ['~/a', 3],
      ['~/b', 1],
    ])
  })
})
