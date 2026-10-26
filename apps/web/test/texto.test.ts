import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError, errorDeCodigo, esRecuperable, mensajeDeError } from '../src/errores.ts'
import { tr } from '../src/i18n/index.ts'
import { esperaTras } from '../src/reconexion.ts'
import { detalleTexto, gradoEtiqueta, normalizar, relDate, shortPath } from '../src/texto.ts'

describe('relDate', () => {
  const ahora = Date.UTC(2026, 5, 1)
  const hace = (dias: number) => ahora - dias * 86400000
  it('en español no dice "1 meses" ni "1 años"', () => {
    assert.equal(relDate(hace(35), ahora, 'es'), 'hace 1 mes')
    assert.equal(relDate(hace(75), ahora, 'es'), 'hace 3 meses')
    assert.equal(relDate(hace(380), ahora, 'es'), 'hace 1 año')
    assert.equal(relDate(hace(800), ahora, 'es'), 'hace 2 años')
    assert.equal(relDate(hace(3), ahora, 'es'), 'hace 3 días')
  })
  it('en inglés no dice "1 months" ni "1 years"', () => {
    assert.equal(relDate(hace(35), ahora, 'en'), '1 month ago')
    assert.equal(relDate(hace(75), ahora, 'en'), '3 months ago')
    assert.equal(relDate(hace(380), ahora, 'en'), '1 year ago')
    assert.equal(relDate(hace(800), ahora, 'en'), '2 years ago')
    assert.equal(relDate(hace(3), ahora, 'en'), '3 days ago')
  })
  it('distingue hoy, ayer y nunca', () => {
    assert.equal(relDate(hace(0), ahora, 'es'), 'hoy')
    assert.equal(relDate(hace(1), ahora, 'es'), 'ayer')
    assert.equal(relDate(null, ahora, 'es'), 'nunca')
    assert.equal(relDate(hace(0), ahora, 'en'), 'today')
    assert.equal(relDate(hace(1), ahora, 'en'), 'yesterday')
    assert.equal(relDate(null, ahora, 'en'), 'never')
  })
})

describe('shortPath', () => {
  it('reconoce macOS, Linux y Windows', () => {
    assert.equal(shortPath('/Users/ana/.claude/agents/a.md'), '~/.claude/agents/a.md')
    assert.equal(shortPath('/home/ana/.claude/agents/a.md'), '~/.claude/agents/a.md')
    assert.equal(shortPath('C:\\Users\\ana\\.claude\\agents\\a.md'), '~\\.claude\\agents\\a.md')
    assert.equal(shortPath('C:/Users/ana/.claude'), '~/.claude')
  })
  it('deja en paz lo que no es una carpeta personal', () => {
    assert.equal(shortPath('/etc/claude/a.md'), '/etc/claude/a.md')
  })
})

describe('gradoEtiqueta', () => {
  it('traduce los cuatro grados y no deja inglés crudo en español', () => {
    assert.equal(gradoEtiqueta('certified', 'es'), 'acreditada')
    assert.equal(gradoEtiqueta('practicing', 'es'), 'en práctica')
    assert.equal(gradoEtiqueta('tried', 'es'), 'estrenada')
    assert.equal(gradoEtiqueta(undefined, 'es'), 'sin estrenar')
  })
  it('en inglés usa los cuatro grados', () => {
    assert.equal(gradoEtiqueta('certified', 'en'), 'certified')
    assert.equal(gradoEtiqueta('tried', 'en'), 'tried')
    assert.equal(gradoEtiqueta(undefined, 'en'), 'unused')
  })
})

describe('normalizar', () => {
  it('quita acentos y mayúsculas', () => {
    assert.equal(normalizar('Política'), 'politica')
  })
})

describe('errores', () => {
  // Los tests corren con el idioma por defecto: inglés.
  it('traduce un fallo de red', () => {
    assert.equal(mensajeDeError(new TypeError('Failed to fetch')), tr('en', 'err.red'))
  })
  it('traduce un JSON ilegible', () => {
    assert.match(mensajeDeError(new SyntaxError("Unexpected token '<'")), /isn't JSON/)
  })
  it('respeta un ApiError sin clave y solo reintenta los de red', () => {
    const e = new ApiError('auth', 'token', 401)
    assert.equal(mensajeDeError(e), 'token')
    assert.equal(esRecuperable(e), false)
    assert.equal(esRecuperable(new ApiError('red', 'x')), true)
  })
  it('traduce por code y conserva el texto del daemon si el code no se conoce', () => {
    assert.match(
      mensajeDeError(errorDeCodigo('forbidden-origin', 'x', 403)),
      /origin that is not allowed/,
    )
    assert.equal(mensajeDeError(errorDeCodigo('demo-readonly', 'x', 403)), tr('en', 'demo.error'))
    assert.equal(
      mensajeDeError(errorDeCodigo('algo-nuevo', 'texto del daemon', 400)),
      'texto del daemon',
    )
    assert.equal(mensajeDeError(errorDeCodigo(undefined, 'sin code', 400)), 'sin code')
  })
  it('añade el detalle del daemon solo en los codes que lo piden', () => {
    const e = errorDeCodigo('invalid-request', 'falta el campo x', 400)
    assert.match(mensajeDeError(e), /\(falta el campo x\)$/)
    assert.doesNotMatch(mensajeDeError(errorDeCodigo('forbidden-host', 'detalle', 403)), /detalle/)
  })
  it('traduce por reason antes que por code, con sus parámetros', () => {
    const e = errorDeCodigo(
      'invalid-request',
      'invalid color: "x"',
      400,
      undefined,
      'invalid-color',
      {
        color: 'x',
      },
    )
    assert.equal(mensajeDeError(e), 'Invalid color: "x".')
    const desconocida = errorDeCodigo('invalid-request', 'texto', 400, undefined, 'nueva-causa')
    assert.match(mensajeDeError(desconocida), /\(texto\)$/)
  })
  it('un conflicto con code conflict es de clase conflicto', () => {
    assert.equal(errorDeCodigo('conflict', 'x', 409, 'abc').clase, 'conflicto')
    assert.equal(errorDeCodigo('unauthorized', 'x', 401).clase, 'auth')
  })
})

describe('esperaTras', () => {
  it('crece de forma exponencial y se detiene en el tope', () => {
    assert.equal(esperaTras(1), 1000)
    assert.equal(esperaTras(2), 2000)
    assert.equal(esperaTras(3), 4000)
    assert.equal(esperaTras(20), 30000)
  })
})

describe('detalleTexto', () => {
  it('traduce por code y conserva el message si el code no se conoce', () => {
    const d = { code: 'broken-citation', message: 'broken citation: "x"', params: { skill: 'x' } }
    assert.equal(
      detalleTexto('warn', d, 'w', 'en'),
      'Broken citation: "x" does not exist in the skills catalog.',
    )
    assert.match(detalleTexto('warn', d, 'w', 'es'), /^Cita rota: "x"/)
    assert.equal(detalleTexto('warn', { code: 'nuevo', message: 'm' }, 'w', 'en'), 'm')
  })
  it('sin detalles (daemon antiguo) cae al texto plano', () => {
    assert.equal(detalleTexto('problem', undefined, 'no frontmatter', 'es'), 'no frontmatter')
  })
})
