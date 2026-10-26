import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { agruparEnSalas, catalogoMinimo } from '../src/graph/salas.ts'
import type { Edge } from '../src/graph/types.ts'
import type { Agent, Command, Skill, Source } from '../src/model/entity.ts'

const fuente = (path: string): Source => ({
  path,
  realPath: path,
  mtimeMs: 0,
  size: 0,
  symlink: false,
  projections: [],
  readOnly: false,
})

const agente = (name: string): Agent => ({
  id: `agent/${name}`,
  kind: 'agent',
  name,
  scope: 'user',
  provider: 'claude-code',
  description: '',
  source: fuente(`~/.claude/agents/${name}.md`),
  status: 'active',
  problems: [],
  bodyStartLine: 1,
  tools: null,
  model: null,
  color: null,
  preloadedSkills: [],
  body: '',
  bodyTokens: 0,
})

const skill = (name: string): Skill => ({
  id: `skill/${name}`,
  kind: 'skill',
  name,
  scope: 'user',
  provider: 'claude-code',
  description: '',
  source: fuente(`~/.agents/skills/${name}/SKILL.md`),
  status: 'active',
  problems: [],
  bodyStartLine: 1,
  allowedTools: null,
  disabledForModel: false,
  metadata: null,
  dir: `~/.agents/skills/${name}`,
  body: '',
  descriptionTokens: 0,
  bodyTokens: 0,
})

const comando = (name: string): Command => ({
  id: `command/${name}`,
  kind: 'command',
  name,
  scope: 'user',
  provider: 'claude-code',
  description: '',
  source: fuente(`~/.claude/commands/${name}.md`),
  status: 'active',
  problems: [],
  bodyStartLine: 1,
  argumentHint: null,
  body: '',
})

const usa = (a: string, s: string): Edge => ({
  from: `agent/${a}`,
  to: `skill/${s}`,
  kind: 'agent-uses-skill',
  layer: 'declared',
  evidence: [],
})
const convoca = (c: string, a: string): Edge => ({
  from: `command/${c}`,
  to: `agent/${a}`,
  kind: 'command-invokes-agent',
  layer: 'declared',
  evidence: [],
})

describe('reparto de la planta en salas', () => {
  it('junta a quienes comparten una skill poco común y separa a quienes no', () => {
    const agentes = ['ana', 'beto', 'caro', 'dani'].map(agente)
    const skills = ['contable', 'mapas'].map(skill)
    const planta = agruparEnSalas(catalogoMinimo(agentes, skills, []), [
      usa('ana', 'contable'),
      usa('beto', 'contable'),
      usa('caro', 'mapas'),
      usa('dani', 'mapas'),
    ])
    assert.equal(planta.salas.length, 2)
    for (const s of planta.salas) assert.equal(s.agents.length, 2)
    const nombres = planta.salas.map((s) => s.nombre).sort()
    assert.deepEqual(nombres, ['contable', 'mapas'])
  })

  it('cada agente cae en una sala y en una sola', () => {
    const agentes = ['a', 'b', 'c', 'd', 'e'].map(agente)
    const planta = agruparEnSalas(catalogoMinimo(agentes, [skill('x')], []), [
      usa('a', 'x'),
      usa('b', 'x'),
    ])
    const todos = planta.salas.flatMap((s) => s.agents)
    assert.equal(todos.length, agentes.length)
    assert.equal(new Set(todos).size, agentes.length)
  })

  it('una skill que cita media plantilla va al archivo común, no a un despacho', () => {
    // Es el caso que hundía el primer reparto: sin este descuento, las cuatro skills de contexto
    // que cita medio equipo fundían a nueve agentes en un solo despacho gigante.
    const agentes = ['a', 'b', 'c', 'd', 'e', 'f'].map(agente)
    const skills = [skill('contexto'), skill('rara')]
    const edges = agentes.map((x) => usa(x.name, 'contexto'))
    edges.push(usa('a', 'rara'), usa('b', 'rara'))
    const planta = agruparEnSalas(catalogoMinimo(agentes, skills, []), edges)
    assert.ok(planta.archivoComun.includes('skill/contexto'))
    const conRara = planta.salas.find((s) => s.skills.includes('skill/rara'))
    assert.ok(conRara, '`rara` debería vivir en el despacho de quienes la citan')
    assert.deepEqual(conRara.agents.sort(), ['agent/a', 'agent/b'])
  })

  it('una skill que no cita nadie va al depósito, que NO es el archivo común', () => {
    const planta = agruparEnSalas(catalogoMinimo([agente('a')], [skill('olvidada')], []), [])
    assert.deepEqual(planta.deposito, ['skill/olvidada'])
    assert.deepEqual(planta.archivoComun, [])
  })

  it('un comando reparte su convocatoria: si cruza salas, al tablón del pasillo', () => {
    const agentes = ['a', 'b', 'c', 'd'].map(agente)
    const skills = ['uno', 'dos'].map(skill)
    const planta = agruparEnSalas(
      catalogoMinimo(agentes, skills, [comando('propio'), comando('cruzado')]),
      [
        usa('a', 'uno'),
        usa('b', 'uno'),
        usa('c', 'dos'),
        usa('d', 'dos'),
        // `propio` convoca solo a una sala; `cruzado` reparte a la mitad de cada una.
        convoca('propio', 'a'),
        convoca('propio', 'b'),
        convoca('cruzado', 'a'),
        convoca('cruzado', 'c'),
      ],
    )
    assert.deepEqual(planta.tablonComun, ['command/cruzado'])
    const dueña = planta.salas.find((s) => s.commands.includes('command/propio'))
    assert.ok(dueña)
    assert.deepEqual(dueña.agents.sort(), ['agent/a', 'agent/b'])
  })

  it('un comando que no nombra a ningún agente queda huérfano', () => {
    const planta = agruparEnSalas(catalogoMinimo([agente('a')], [], [comando('suelto')]), [])
    assert.deepEqual(planta.tablonHuerfano, ['command/suelto'])
    assert.deepEqual(planta.tablonComun, [])
  })

  it('un agente sin skills citadas ni comandos acaba en una sala "suelto" que lo explica', () => {
    const planta = agruparEnSalas(catalogoMinimo([agente('huerfano')], [], []), [])
    assert.equal(planta.salas.length, 1)
    assert.equal(planta.salas[0]?.tipo, 'suelto')
    assert.match(planta.salas[0]?.motivo ?? '', /no cita ninguna skill/)
  })

  it('el motivo de la placa se redacta en singular cuando la sala es de una persona', () => {
    const planta = agruparEnSalas(catalogoMinimo([agente('solo')], [skill('suya')], []), [
      usa('solo', 'suya'),
    ])
    // "1 de sus 1 agentes citan…" restaría credibilidad a todo lo demás que afirma la interfaz.
    assert.doesNotMatch(planta.salas[0]?.motivo ?? '', /1 de/)
    assert.match(planta.salas[0]?.motivo ?? '', /no la comparte con nadie/)
  })

  it('toda sala se nombra con una skill o un comando que existen de verdad', () => {
    const agentes = ['a', 'b'].map(agente)
    const skills = [skill('real')]
    const planta = agruparEnSalas(catalogoMinimo(agentes, skills, []), [
      usa('a', 'real'),
      usa('b', 'real'),
    ])
    for (const s of planta.salas) {
      if (s.tipo === 'suelto') continue
      const limpio = s.nombre.replace(/^\//, '')
      const existe = skills.some((x) => x.name === limpio) || s.tipo === 'command'
      assert.ok(existe, `nombre inventado: ${s.nombre}`)
    }
  })

  it('es determinista: el mismo catálogo da siempre la misma planta', () => {
    const agentes = ['a', 'b', 'c'].map(agente)
    const skills = ['x', 'y'].map(skill)
    const edges = [usa('a', 'x'), usa('b', 'x'), usa('c', 'y')]
    const uno = agruparEnSalas(catalogoMinimo(agentes, skills, []), edges)
    const dos = agruparEnSalas(catalogoMinimo(agentes, skills, []), edges)
    assert.deepEqual(uno, dos)
  })

  it('un catálogo vacío no revienta', () => {
    const planta = agruparEnSalas(catalogoMinimo([], [], []), [])
    assert.deepEqual(planta.salas, [])
    assert.deepEqual(planta.archivoComun, [])
  })
})
