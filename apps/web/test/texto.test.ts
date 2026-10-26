import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError, esRecuperable, MSG_RED, mensajeDeError } from '../src/errores.ts'
import { esperaTras } from '../src/reconexion.ts'
import { gradoEtiqueta, normalizar, plural, relDate, shortPath } from '../src/texto.ts'

describe('plural', () => {
  it('usa el singular solo con 1', () => {
    assert.equal(plural(1, 'uso', 'usos'), '1 uso')
    assert.equal(plural(0, 'uso', 'usos'), '0 usos')
    assert.equal(plural(5, 'sesión', 'sesiones'), '5 sesiones')
  })
})

describe('relDate', () => {
  const ahora = Date.UTC(2026, 5, 1)
  const hace = (dias: number) => ahora - dias * 86400000
  it('no dice "1 meses" ni "1 años"', () => {
    assert.equal(relDate(hace(35), ahora), 'hace 1 mes')
    assert.equal(relDate(hace(75), ahora), 'hace 3 meses')
    assert.equal(relDate(hace(380), ahora), 'hace 1 año')
    assert.equal(relDate(hace(800), ahora), 'hace 2 años')
  })
  it('distingue hoy, ayer y nunca', () => {
    assert.equal(relDate(hace(0), ahora), 'hoy')
    assert.equal(relDate(hace(1), ahora), 'ayer')
    assert.equal(relDate(null, ahora), 'nunca')
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
  it('traduce los cuatro grados y no deja inglés crudo', () => {
    assert.equal(gradoEtiqueta('certified'), 'acreditada')
    assert.equal(gradoEtiqueta('practicing'), 'en práctica')
    assert.equal(gradoEtiqueta(undefined), 'sin estrenar')
  })
})

describe('normalizar', () => {
  it('quita acentos y mayúsculas', () => {
    assert.equal(normalizar('Política'), 'politica')
  })
})

describe('errores', () => {
  it('traduce un fallo de red', () => {
    assert.equal(mensajeDeError(new TypeError('Failed to fetch')), MSG_RED)
  })
  it('traduce un JSON ilegible', () => {
    assert.match(mensajeDeError(new SyntaxError("Unexpected token '<'")), /no es JSON/)
  })
  it('respeta un ApiError ya traducido y solo reintenta los de red', () => {
    const e = new ApiError('auth', 'token', 401)
    assert.equal(mensajeDeError(e), 'token')
    assert.equal(esRecuperable(e), false)
    assert.equal(esRecuperable(new ApiError('red', 'x')), true)
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
