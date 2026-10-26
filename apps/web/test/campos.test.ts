import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type CitasDeAgente,
  cambiosDeAsignacion,
  citasDeAgente,
  entidadDeRuta,
  mencionesGestionadas,
  opcionesDeHerramientas,
  ordenarMarcadas,
  quienUsa,
  reconciliarCitas,
  soloEnProsa,
  validarNombre,
} from '../src/campos.ts'
import type { Agent, Edge, Snapshot } from '../src/types.ts'

describe('validarNombre', () => {
  it('acepta minúsculas, dígitos y guiones', () => {
    assert.equal(validarNombre('code-reviewer-2', []), null)
    assert.equal(validarNombre('a', []), null)
    assert.equal(validarNombre('9lives', []), null)
  })
  it('distingue vacío, formato y existente', () => {
    assert.equal(validarNombre('', []), 'empty')
    assert.equal(validarNombre('-malo', []), 'format')
    assert.equal(validarNombre('Mayus', []), 'format')
    assert.equal(validarNombre('con espacio', []), 'format')
    assert.equal(validarNombre('x'.repeat(65), []), 'format')
    assert.equal(validarNombre('x'.repeat(64), []), null)
    assert.equal(validarNombre('ya-esta', ['otro', 'ya-esta']), 'exists')
  })
  it('el formato se comprueba antes que la existencia', () => {
    assert.equal(validarNombre('Mal', ['Mal']), 'format')
  })
})

describe('herramientas', () => {
  it('suma lo que el agente ya tiene y no es habitual, sin duplicar', () => {
    const o = opcionesDeHerramientas(['Read', 'mcp__github__search'])
    assert.ok(o.includes('Bash') && o.includes('Agent') && o.includes('Task'))
    assert.equal(o.filter((h) => h === 'Read').length, 1)
    assert.equal(o[o.length - 1], 'mcp__github__search')
    assert.deepEqual(opcionesDeHerramientas(null), opcionesDeHerramientas([]))
  })
  it('las marcadas conservan el orden previo y añaden lo nuevo en el orden de la lista', () => {
    const orden = ['Read', 'Write', 'Edit', 'Bash']
    assert.deepEqual(ordenarMarcadas(['Bash', 'Read'], new Set(['Read', 'Bash', 'Edit']), orden), [
      'Bash',
      'Read',
      'Edit',
    ])
    assert.deepEqual(ordenarMarcadas(['Bash', 'Read'], new Set(['Read']), orden), ['Read'])
  })
})

const GESTIONADA = `Intro a mano.

<!-- ai-office:skills:inicio -->
- **uno** — \`~/.claude/skills/uno/SKILL.md\`
- **dos** — \`~/.claude/skills/dos/SKILL.md\`
<!-- ai-office:skills:fin -->

Cita a mano: tres.`

const agente = (name: string, body?: string): Agent =>
  ({
    id: `agent:claude-code/user/${name}`,
    kind: 'agent',
    name,
    description: '',
    ...(body === undefined ? {} : { body }),
  }) as unknown as Agent

const decl = (agentName: string, skill: string): Edge => ({
  from: `agent:claude-code/user/${agentName}`,
  to: `skill:claude-code/user/${skill}`,
  kind: 'agent-uses-skill',
  layer: 'declared',
  evidence: [],
})

describe('mencionesGestionadas', () => {
  it('lee solo la sección gestionada', () => {
    assert.deepEqual(mencionesGestionadas(GESTIONADA), ['uno', 'dos'])
  })
  it('sin sección o sin cierre, nada', () => {
    assert.deepEqual(mencionesGestionadas('nada'), [])
    assert.deepEqual(mencionesGestionadas('<!-- ai-office:skills:inicio -->\n- **x**'), [])
  })
})

describe('citasDeAgente', () => {
  it('separa gestionadas de declaradas cuando hay cuerpo', () => {
    const a = agente('rev', GESTIONADA)
    const c = citasDeAgente(a, [decl('rev', 'uno'), decl('rev', 'dos'), decl('rev', 'tres')])
    assert.deepEqual(c.gestionadas, ['uno', 'dos'])
    assert.deepEqual(c.declaradas, ['uno', 'dos', 'tres'])
    assert.equal(soloEnProsa(c, 'tres'), true)
    assert.equal(soloEnProsa(c, 'uno'), false)
  })
  it('sin cuerpo (daemon antiguo) lo declarado cuenta como gestionado', () => {
    const c = citasDeAgente(agente('rev'), [decl('rev', 'uno'), decl('otro', 'x')])
    assert.deepEqual(c.gestionadas, ['uno'])
  })
})

const citas = (id: string, gestionadas: string[], declaradas = gestionadas): CitasDeAgente => ({
  id,
  name: id,
  gestionadas,
  declaradas,
})

describe('reconciliarCitas', () => {
  it('conserva el orden, quita lo desmarcado y añade lo nuevo al final', () => {
    const c = citas('a', ['uno', 'dos'])
    assert.deepEqual(
      reconciliarCitas(c, new Set(['dos', 'uno', 'cuatro']), ['uno', 'dos', 'tres', 'cuatro']),
      ['uno', 'dos', 'cuatro'],
    )
    assert.deepEqual(reconciliarCitas(c, new Set(['dos']), ['uno', 'dos']), ['dos'])
  })
  it('lo citado solo en prosa no se copia a la sección', () => {
    const c = citas('a', ['uno'], ['uno', 'tres'])
    assert.deepEqual(reconciliarCitas(c, new Set(['uno', 'tres', 'dos']), ['uno', 'dos', 'tres']), [
      'uno',
      'dos',
    ])
  })
})

describe('cambiosDeAsignacion', () => {
  const agentes = [
    citas('a', ['x']),
    citas('b', []),
    citas('c', ['y', 'sk']),
    citas('d', [], ['sk']), // la cita solo a mano
  ]
  it('añade la skill al final de la lista COMPLETA de cada agente que la gana', () => {
    const r = cambiosDeAsignacion('sk', new Set(['a', 'b', 'c', 'd']), agentes)
    assert.deepEqual(r, [
      { agentId: 'a', agentName: 'a', value: ['x', 'sk'] },
      { agentId: 'b', agentName: 'b', value: ['sk'] },
    ])
  })
  it('quita solo esa skill y deja las demás en su sitio', () => {
    // Solo `c` la tenía y ya no está marcada: pierde `sk` y conserva `y`.
    const r = cambiosDeAsignacion('sk', new Set(), [agentes[0], agentes[2]] as CitasDeAgente[])
    assert.deepEqual(r, [{ agentId: 'c', agentName: 'c', value: ['y'] }])
  })
  it('lo que ya está como se pide no genera cambios; lo escrito a mano no se quita', () => {
    assert.deepEqual(cambiosDeAsignacion('sk', new Set(['c', 'd']), agentes), [])
    assert.deepEqual(cambiosDeAsignacion('sk', new Set(['c']), [citas('d', [], ['sk'])]), [])
  })
  it('quitar la última deja la lista vacía (la mutación retira la sección)', () => {
    const r = cambiosDeAsignacion('sk', new Set(), [citas('c', ['sk'])])
    assert.deepEqual(r[0]?.value, [])
  })
})

describe('quienUsa y entidadDeRuta', () => {
  const snap = {
    catalog: {
      agents: [{ id: 'a1', source: { path: '/p/a1.md', realPath: '/real/a1.md' } }],
      skills: [{ id: 'sk', source: { path: '/p/sk', realPath: '/real/sk/SKILL.md' } }],
      commands: [{ id: 'c1', source: { path: '/p/c1.md', realPath: '/real/c1.md' } }],
    },
    edges: [
      { from: 'c1', to: 'sk', kind: 'command-invokes-skill', layer: 'declared', evidence: [] },
      { from: 'a1', to: 'sk', kind: 'agent-uses-skill', layer: 'declared', evidence: [] },
      { from: 'a1', to: 'sk', kind: 'agent-uses-skill', layer: 'proven', evidence: [], uses: 3 },
      { from: 'main', to: 'sk', kind: 'agent-uses-skill', layer: 'proven', evidence: [], uses: 9 },
      { from: 'a1', to: 'otra', kind: 'agent-uses-skill', layer: 'proven', evidence: [] },
    ],
  } as unknown as Snapshot
  it('ordena probadas (más usadas primero), declaradas y comandos', () => {
    const u = quienUsa(snap, 'sk')
    assert.deepEqual(
      u.map((x) => `${x.capa}:${x.from}`),
      ['proven:main', 'proven:a1', 'declared:a1', 'command:c1'],
    )
  })
  it('encuentra la entidad por ruta real o visible', () => {
    assert.equal(entidadDeRuta(snap, '/real/a1.md')?.id, 'a1')
    assert.equal(entidadDeRuta(snap, '/p/sk')?.id, 'sk')
    assert.equal(entidadDeRuta(snap, '/transcript.jsonl'), undefined)
  })
})
