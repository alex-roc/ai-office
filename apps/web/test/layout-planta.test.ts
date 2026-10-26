import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIGURA_DE, PERSONAS } from '../src/sala/catalogo-sprites.ts'
import { buildLayout } from '../src/sala/layout.ts'
import type { Agent, Command, Planta, Sala, Skill, Snapshot } from '../src/types.ts'

const agente = (name: string, color: string | null = null): Agent => ({
  id: `agent/${name}`,
  kind: 'agent',
  name,
  description: 'trabajo general',
  status: 'active',
  problems: [],
  source: { path: `~/.claude/agents/${name}.md`, realPath: `/a/${name}.md`, symlink: false },
  tools: null,
  model: null,
  color,
  preloadedSkills: [],
  bodyTokens: 100,
})

const skill = (name: string): Skill => ({
  id: `skill/${name}`,
  kind: 'skill',
  name,
  description: 'una skill',
  status: 'active',
  problems: [],
  source: { path: `~/.claude/skills/${name}`, realPath: `/s/${name}`, symlink: false },
  disabledForModel: false,
  descriptionTokens: 10,
  bodyTokens: 50,
  dir: `/s/${name}`,
})

const comando = (name: string): Command => ({
  id: `command/${name}`,
  kind: 'command',
  name,
  description: 'un comando',
  status: 'active',
  problems: [],
  source: { path: `~/.claude/commands/${name}.md`, realPath: `/c/${name}.md`, symlink: false },
})

const sala = (
  nombre: string,
  agents: string[],
  skills: string[] = [],
  commands: string[] = [],
): Sala => ({
  id: `sala/${nombre}`,
  nombre,
  tipo: 'skill',
  motivo: `Los ${agents.length} citan \`${nombre}\`.`,
  agents,
  skills,
  commands,
})

const snapshotDe = (
  agentes: Agent[],
  skills: Skill[],
  comandos: Command[],
  planta: Planta,
  activity: Snapshot['activity'] = {},
  edges: Snapshot['edges'] = [],
): Snapshot =>
  ({
    catalog: { agents: agentes, skills, commands: comandos, roots: [] },
    edges,
    activity,
    vocabularyGaps: {},
    planta,
    mainThreadId: 'main',
    stats: { mainThreadSkills: 3 } as Snapshot['stats'],
  }) as Snapshot

const vacia = (extra: Partial<Planta> = {}): Planta => ({
  salas: [],
  archivoComun: [],
  deposito: [],
  tablonComun: [],
  tablonHuerfano: [],
  ...extra,
})

const usado = (id: string, uses: number, grade = 'tried') => ({
  [id]: { id, name: id, uses, sessions: 1, projects: 1, lastUsedAt: 1, grade, active: false },
})

describe('geometría de la planta', () => {
  it('da una bahía a cada despacho y una más al vestíbulo', () => {
    const a = agente('ana')
    const b = agente('beto')
    const planta = vacia({ salas: [sala('uno', [a.id]), sala('dos', [b.id])] })
    const l = buildLayout(snapshotDe([a, b], [], [], planta))
    assert.equal(l.bahias.length, 3)
    assert.equal(l.bahias.filter((x) => x.tipo === 'hub').length, 1)
  })

  it('las bahías no se solapan entre sí', () => {
    // Si dos despachos se pisan, sus mamparas se cruzan y la planta deja de leerse como planta.
    const agentes = Array.from({ length: 9 }, (_, i) => agente(`a${i}`))
    const planta = vacia({ salas: agentes.map((a, i) => sala(`s${i}`, [a.id])) })
    const l = buildLayout(snapshotDe(agentes, [], [], planta))
    for (let i = 0; i < l.bahias.length; i++) {
      for (let j = i + 1; j < l.bahias.length; j++) {
        const A = l.bahias[i]
        const B = l.bahias[j]
        if (!A || !B) continue
        const solapa = A.col0 < B.col1 && A.col1 > B.col0 && A.row0 < B.row1 && A.row1 > B.row0
        assert.ok(!solapa, `${A.nombre} se solapa con ${B.nombre}`)
      }
    }
  })

  it('deja pasillo entre un despacho y el siguiente', () => {
    // Es la queja que originó los pasillos: sin suelo vacío por medio, los despachos se tocaban
    // y la planta se leía como una sola nave a rayas. Dos bahías nunca pueden quedar pegadas.
    const agentes = Array.from({ length: 9 }, (_, i) => agente(`a${i}`))
    const planta = vacia({ salas: agentes.map((a, i) => sala(`s${i}`, [a.id])) })
    const l = buildLayout(snapshotDe(agentes, [], [], planta))
    for (let i = 0; i < l.bahias.length; i++) {
      for (let j = i + 1; j < l.bahias.length; j++) {
        const A = l.bahias[i]
        const B = l.bahias[j]
        if (!A || !B) continue
        const pegadasEnCol = A.col1 === B.col0 || B.col1 === A.col0
        const pegadasEnRow = A.row1 === B.row0 || B.row1 === A.row0
        assert.ok(!pegadasEnCol && !pegadasEnRow, `${A.nombre} y ${B.nombre} se tocan`)
      }
    }
  })

  it('ningún despacho queda pegado al muro exterior', () => {
    const agentes = Array.from({ length: 4 }, (_, i) => agente(`a${i}`))
    const planta = vacia({ salas: agentes.map((a, i) => sala(`s${i}`, [a.id])) })
    const l = buildLayout(snapshotDe(agentes, [], [], planta))
    for (const b of l.bahias) {
      assert.ok(b.col0 > 0 && b.row0 > 0, `${b.nombre} arranca en el borde`)
      assert.ok(b.col1 < l.cols && b.row1 < l.filas, `${b.nombre} termina en el borde`)
    }
  })

  it('cada despacho tiene una puerta, y cae dentro de su pared de delante', () => {
    // Un despacho cerrado por los cuatro lados no se lee como despacho: se lee como una caja.
    const a = agente('solo')
    const planta = vacia({ salas: [sala('x', [a.id])] })
    const l = buildLayout(snapshotDe([a], [], [], planta))
    for (const b of l.bahias) {
      assert.ok(b.puerta.col1 > b.puerta.col0, `${b.nombre} sin hueco de puerta`)
      assert.ok(b.puerta.col0 > b.col0, `${b.nombre}: la puerta empieza fuera del despacho`)
      assert.ok(b.puerta.col1 < b.col1, `${b.nombre}: la puerta termina fuera del despacho`)
    }
  })

  it('todo lo que se coloca cae dentro de su propia bahía', () => {
    const agentes = Array.from({ length: 6 }, (_, i) => agente(`a${i}`))
    const skills = ['s1', 's2', 's3'].map(skill)
    const comandos = ['c1', 'c2'].map(comando)
    const planta = vacia({
      salas: [
        sala(
          'grande',
          agentes.map((a) => a.id),
          skills.map((s) => s.id),
          comandos.map((c) => c.id),
        ),
      ],
    })
    const l = buildLayout(snapshotDe(agentes, skills, comandos, planta))
    const b = l.bahias.find((x) => x.nombre === 'grande')
    assert.ok(b)
    for (const s of b.agentes) {
      assert.ok(s.col >= b.col0 && s.col <= b.col1, `agente fuera en col: ${s.col}`)
      assert.ok(s.row >= b.row0 && s.row <= b.row1, `agente fuera en row: ${s.row}`)
    }
    for (const lo of b.lomos) {
      assert.ok(lo.col >= b.col0 && lo.col <= b.col1, `lomo fuera en col: ${lo.col}`)
    }
    for (const t of b.tarjetas) {
      assert.ok(t.row >= b.row0 && t.row <= b.row1, `tarjeta fuera en row: ${t.row}`)
    }
  })

  it('la planta es lo bastante grande para contener todas sus bahías', () => {
    const agentes = Array.from({ length: 12 }, (_, i) => agente(`a${i}`))
    const planta = vacia({ salas: agentes.map((a, i) => sala(`s${i}`, [a.id])) })
    const l = buildLayout(snapshotDe(agentes, [], [], planta))
    for (const b of l.bahias) {
      assert.ok(b.col1 <= l.cols, `${b.nombre} se sale por la derecha: ${b.col1} > ${l.cols}`)
      assert.ok(b.row1 <= l.filas, `${b.nombre} se sale por abajo: ${b.row1} > ${l.filas}`)
    }
  })

  it('el archivo común y el depósito van al vestíbulo, no a un despacho', () => {
    const comun = skill('contexto')
    const olvidada = skill('nadie')
    const planta = vacia({ archivoComun: [comun.id], deposito: [olvidada.id] })
    const l = buildLayout(snapshotDe([], [comun, olvidada], [], planta, usado(comun.id, 5)))
    const hub = l.bahias.find((b) => b.tipo === 'hub')
    assert.ok(hub)
    assert.deepEqual(hub.lomos.map((x) => x.name).sort(), ['contexto', 'nadie'])
    // Y a distinta altura: el que usa media planta arriba, el olvidado abajo. Enfrentarlos es
    // justamente lo que hace visible el problema.
    const alturas = new Set(hub.lomos.map((x) => x.altura))
    assert.equal(alturas.size, 2)
  })

  it('la altura del lomo satura en cuatro: el uso nº 500 no vale más que el nº 3', () => {
    const poco = skill('poco')
    const mucho = skill('mucho')
    const planta = vacia({ deposito: [poco.id, mucho.id] })
    const l = buildLayout(
      snapshotDe([], [poco, mucho], [], planta, {
        ...usado(poco.id, 3, 'certified'),
        ...usado(mucho.id, 500, 'certified'),
      }),
    )
    const hub = l.bahias.find((b) => b.tipo === 'hub')
    const grados = hub?.lomos.map((x) => x.grado) ?? []
    assert.deepEqual(grados, [4, 4])
  })

  it('el lomo toma el color del agente que más la usa, y solo si está demostrado', () => {
    const duenio = agente('duenio', 'green')
    const s = skill('compartida')
    const planta = vacia({ salas: [sala('x', [duenio.id], [s.id])] })
    const l = buildLayout(
      snapshotDe([duenio], [s], [], planta, usado(s.id, 9), [
        {
          from: duenio.id,
          to: s.id,
          kind: 'agent-uses-skill',
          layer: 'proven',
          evidence: [],
          uses: 9,
        },
      ]),
    )
    const lomo = l.bahias.flatMap((b) => b.lomos).find((x) => x.name === 'compartida')
    assert.equal(lomo?.duenio, 'duenio')
    assert.equal(lomo?.colorIndex, 2)
  })

  it('una arista solo DECLARADA no tiñe el lomo', () => {
    // Decir en un prompt que usarás una skill no es haberla usado. Si esto se colara, el
    // archivador enseñaría intenciones y no hechos, que es lo que el producto denuncia.
    const a = agente('promete', 'red')
    const s = skill('prometida')
    const planta = vacia({ salas: [sala('x', [a.id], [s.id])] })
    const l = buildLayout(
      snapshotDe([a], [s], [], planta, usado(s.id, 2), [
        { from: a.id, to: s.id, kind: 'agent-uses-skill', layer: 'declared', evidence: [] },
      ]),
    )
    const lomo = l.bahias.flatMap((b) => b.lomos)[0]
    assert.equal(lomo?.duenio, null)
    assert.equal(lomo?.colorIndex, null)
  })

  it('un agente nunca delegado sale marcado como tal, aunque tenga color', () => {
    const a = agente('nuevo', 'blue')
    const planta = vacia({ salas: [sala('x', [a.id])] })
    const l = buildLayout(snapshotDe([a], [], [], planta))
    const s = l.bahias.flatMap((b) => b.agentes)[0]
    assert.equal(s?.unused, true)
    // El color sigue ahí: son dos datos distintos y no comparten canal.
    assert.equal(s?.colorIndex, 1)
  })

  it('toda figura recibe un sprite que existe de verdad', () => {
    for (const figura of Object.values(FIGURA_DE)) {
      assert.ok(PERSONAS.includes(figura), `sprite inexistente: ${figura}`)
    }
  })

  it('es determinista y no revienta con una planta vacía', () => {
    const uno = buildLayout(snapshotDe([], [], [], vacia()))
    const dos = buildLayout(snapshotDe([], [], [], vacia()))
    assert.deepEqual(uno, dos)
    assert.equal(uno.bahias.length, 1)
  })
})

describe('comandos en la planta', () => {
  it('una tarjeta sale como ejecutada solo si el comando tiene actividad', () => {
    // Antes `used` iba fijo a false y todas las tarjetas salían con la chincheta de "nunca".
    const a = agente('ana')
    const hecho = comando('revisar')
    const nuevo = comando('limpiar')
    const planta = vacia({
      salas: [sala('uno', [a.id], [], [hecho.id, nuevo.id])],
    })
    const l = buildLayout(snapshotDe([a], [], [hecho, nuevo], planta, usado(hecho.id, 4)))
    const tarjetas = l.bahias.flatMap((b) => b.tarjetas)
    assert.equal(tarjetas.find((t) => t.id === hecho.id)?.used, true)
    assert.equal(tarjetas.find((t) => t.id === nuevo.id)?.used, false)
  })
})
