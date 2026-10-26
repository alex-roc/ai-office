import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  agruparProyectos,
  ambitoActivo,
  ambitoDe,
  esSoloLectura,
  etiquetaAmbito,
  grupoDeAmbito,
  hayProyecto,
  nombreDePlugin,
  nombreDeProyecto,
  parcheDeAmbito,
  pluginDe,
  quienTapa,
  valorDeAmbito,
} from '../src/alcance.ts'
import { medidoTexto } from '../src/derivados.ts'
import type { KnownProject } from '../src/types.ts'
import { agente, piezasDePlugin, plugin, skill, snapshot } from './fixtures-alcance.ts'

describe('etiquetas de ámbito', () => {
  it('usuario, proyecto, plugin con su nombre, en los dos idiomas', () => {
    assert.equal(etiquetaAmbito({ scope: 'user' }, 'en'), 'user')
    assert.equal(etiquetaAmbito({ scope: 'project' }, 'es'), 'proyecto')
    assert.equal(
      etiquetaAmbito({ scope: 'plugin', plugin: 'release-kit@acme' }, 'en'),
      'plugin release-kit',
    )
    assert.equal(etiquetaAmbito({ scope: 'local' }, 'en'), 'local')
  })

  it('sin `scope` (un daemon antiguo) es del usuario', () => {
    assert.equal(ambitoDe({}), 'user')
    assert.equal(etiquetaAmbito({}, 'en'), 'user')
  })

  it('el nombre de un plugin sale de su clave', () => {
    assert.equal(nombreDePlugin('a@b'), 'a')
    assert.equal(nombreDePlugin('suelto'), 'suelto')
  })

  it('los cubos del filtro: local es del proyecto y managed no es de ninguno', () => {
    assert.equal(grupoDeAmbito('user'), 'user')
    assert.equal(grupoDeAmbito('project'), 'project')
    assert.equal(grupoDeAmbito('local'), 'project')
    assert.equal(grupoDeAmbito('plugin'), 'plugin')
    assert.equal(grupoDeAmbito('managed'), null)
  })
})

describe('entidades de plugin y tapadas', () => {
  it('una de plugin es de solo lectura y encuentra a su plugin', () => {
    const { s } = piezasDePlugin('x')
    const p = plugin('x')
    const snap = snapshot({ skills: [s], plugins: [p] })
    assert.equal(esSoloLectura(s), true)
    assert.equal(esSoloLectura(skill('suya')), false)
    assert.equal(pluginDe(snap, s)?.id, p.id)
  })

  it('quién tapa sale del id, con su nombre y su ámbito', () => {
    const t = agente('a', {
      status: 'shadowed',
      shadowedBy: 'agent:claude-code/project/frontend-designer',
    })
    assert.deepEqual(quienTapa(t), { name: 'frontend-designer', scope: 'project' })
    assert.equal(quienTapa(agente('b')), undefined)
  })
})

describe('el ámbito de trabajo', () => {
  it('sin `scope` es el de usuario; con proyecto, hay proyecto', () => {
    assert.deepEqual(ambitoActivo(snapshot({})), { kind: 'user' })
    assert.equal(hayProyecto(snapshot({})), false)
    const s = { ...snapshot({}), scope: { kind: 'project' as const, path: '/a/acme-web' } }
    assert.equal(hayProyecto(s), true)
    assert.equal(nombreDeProyecto(ambitoActivo(s)), 'acme-web')
    assert.equal(nombreDeProyecto({ kind: 'user' }), null)
  })

  it('el valor de la opción y el parche de la configuración son inversos', () => {
    assert.equal(valorDeAmbito({ kind: 'user' }), 'user')
    assert.deepEqual(parcheDeAmbito('user'), { scope: 'user' })
    const v = valorDeAmbito({ kind: 'project', path: '/a/b:c' })
    assert.deepEqual(parcheDeAmbito(v), { scope: 'project', project: '/a/b:c' })
  })

  it('los proyectos con .claude van primero, y por sesiones', () => {
    const p = (name: string, sessions: number, hasClaudeDir: boolean): KnownProject => ({
      path: `/p/${name}`,
      name,
      exists: true,
      hasClaudeDir,
      sessions,
    })
    const g = agruparProyectos([
      p('b', 5, false),
      p('a', 2, true),
      p('c', 9, true),
      p('d', 9, false),
    ])
    assert.deepEqual(
      g.conClaude.map((x) => x.name),
      ['c', 'a'],
    )
    assert.deepEqual(
      g.sinClaude.map((x) => x.name),
      ['d', 'b'],
    )
  })
})

describe('sobre qué se mide', () => {
  it('sin el campo es todo el historial; en un proyecto dice cuántas sesiones', () => {
    assert.equal(medidoTexto(snapshot({})), 'all projects')
    const s = {
      ...snapshot({}),
      measuredOver: { kind: 'project' as const, path: '/p', sessions: 24 },
    }
    assert.equal(medidoTexto(s), 'this project · 24 sessions')
  })
})
