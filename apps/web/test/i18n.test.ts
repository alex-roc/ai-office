import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { en } from '../src/i18n/en.ts'
import { es } from '../src/i18n/es.ts'
import {
  CLAVE_LANG,
  elegirLang,
  fmtNum,
  getLang,
  setLang,
  subscribeLang,
  t,
  tr,
} from '../src/i18n/index.ts'
import { nombreSala, razonTexto } from '../src/texto.ts'
import type { RazonSala } from '../src/types.ts'

describe('catálogos', () => {
  it('es tiene exactamente las mismas claves que en', () => {
    assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort())
  })
  it('ninguna traducción está vacía y los marcadores {x} coinciden', () => {
    const marcas = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      assert.ok(en[k].length > 0 && es[k].length > 0, `${k} vacía`)
      assert.deepEqual(marcas(es[k]), marcas(en[k]), `${k}: marcadores distintos`)
    }
  })
  it('toda clave plural tiene sus dos variantes, en los dos idiomas', () => {
    for (const cat of [en, es] as Record<string, string>[]) {
      for (const k of Object.keys(cat)) {
        if (k.endsWith('_one')) assert.ok(cat[k.replace(/_one$/, '_other')], `${k}: falta _other`)
        if (k.endsWith('_other')) assert.ok(cat[k.replace(/_other$/, '_one')], `${k}: falta _one`)
      }
    }
  })
  it('el inglés no contiene acentos ni eñes (salvo símbolos tipográficos)', () => {
    for (const [k, v] of Object.entries(en)) assert.doesNotMatch(v, /[áéíóúñ¿¡]/i, k)
  })
})

describe('tr', () => {
  it('interpola parámetros', () => {
    assert.equal(tr('en', 'toast.flowSaved', { name: 'x' }), 'Saved the command /x.')
    assert.equal(tr('es', 'toast.flowSaved', { name: 'x' }), 'Guardado el comando /x.')
  })
  it('pluraliza en inglés', () => {
    assert.equal(tr('en', 'count.uses', { n: 1 }), '1 use')
    assert.equal(tr('en', 'count.uses', { n: 0 }), '0 uses')
    assert.equal(tr('en', 'count.uses', { n: 5 }), '5 uses')
    assert.equal(tr('en', 'count.skills', { n: 1 }), '1 skill')
  })
  it('pluraliza en español', () => {
    assert.equal(tr('es', 'count.uses', { n: 1 }), '1 uso')
    assert.equal(tr('es', 'count.uses', { n: 0 }), '0 usos')
    assert.equal(tr('es', 'count.delegations', { n: 2 }), '2 delegaciones')
    assert.equal(tr('es', 'count.delegations', { n: 1 }), '1 delegación')
  })
  it('da formato numérico según el idioma', () => {
    assert.equal(fmtNum(1234567, 'en'), '1,234,567')
    assert.equal(fmtNum(1234567, 'es'), '1.234.567')
    assert.equal(tr('en', 'detail.def.tokens', { n: 12345 }), '~12,345 tokens')
  })
})

describe('elegirLang', () => {
  it('por defecto es inglés, sin mirar nada más', () => {
    assert.equal(elegirLang(null, null), 'en')
    assert.equal(elegirLang('', null), 'en')
    assert.equal(elegirLang('?x=1', 'fr'), 'en')
  })
  it('lo guardado manda sobre el defecto', () => {
    assert.equal(elegirLang('', 'es'), 'es')
    assert.equal(elegirLang(null, 'en'), 'en')
  })
  it('?lang= manda sobre lo guardado', () => {
    assert.equal(elegirLang('?lang=es', 'en'), 'es')
    assert.equal(elegirLang('?lang=en', 'es'), 'en')
    assert.equal(elegirLang('?foo=1&lang=es', null), 'es')
  })
  it('un ?lang= inválido se ignora', () => {
    assert.equal(elegirLang('?lang=fr', 'es'), 'es')
    assert.equal(elegirLang('?lang=', null), 'en')
  })
})

describe('setLang', () => {
  it('cambia el idioma de t(), avisa a los suscritos y lo guarda', () => {
    const guardado = new Map<string, string>()
    const previo = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => null, setItem: (k: string, v: string) => guardado.set(k, v) },
    })
    let avisos = 0
    const baja = subscribeLang(() => avisos++)
    try {
      assert.equal(getLang(), 'en')
      setLang('es')
      assert.equal(getLang(), 'es')
      assert.equal(t('time.never'), 'nunca')
      assert.equal(guardado.get(CLAVE_LANG), 'es')
      setLang('es')
      assert.equal(avisos, 1, 'repetir el mismo idioma no avisa')
    } finally {
      setLang('en')
      baja()
      if (previo) Object.defineProperty(globalThis, 'localStorage', previo)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
    assert.equal(t('time.never'), 'never')
  })
})

describe('razonTexto', () => {
  const sala = (razon?: RazonSala, motivo = 'Texto antiguo.') => ({ razon, motivo })
  const casos: [RazonSala, string, string][] = [
    [
      { tipo: 'skill', nombre: 'x', cuantos: 1, total: 1 },
      'Cites `x` in its prompt, and shares it with no one.',
      'Cita `x` en su prompt y no la comparte con nadie.',
    ],
    [
      { tipo: 'skill', nombre: 'x', cuantos: 3, total: 3 },
      'All 3 cite `x` in their prompt.',
      'Los 3 citan `x` en su prompt.',
    ],
    [
      { tipo: 'skill', nombre: 'x', cuantos: 2, total: 3 },
      '2 of the 3 cite `x` in their prompt.',
      '2 de los 3 citan `x` en su prompt.',
    ],
    [
      { tipo: 'command', nombre: 'x', cuantos: 1, total: 1 },
      'Called by /x, and by no other command.',
      'Lo convoca /x y ningún otro comando.',
    ],
    [
      { tipo: 'command', nombre: 'x', cuantos: 2, total: 3 },
      '2 of the 3 are called by /x.',
      '2 de los 3 son convocados por /x.',
    ],
    [
      { tipo: 'command', nombre: 'x', cuantos: 3, total: 3 },
      'All 3 are called by /x.',
      'Los 3 son convocados por /x.',
    ],
    [
      { tipo: 'loose', nombre: '', cuantos: 1, total: 1 },
      'Its prompt cites no skill and no command calls it.',
      'Su prompt no cita ninguna skill y ningún comando lo convoca.',
    ],
    [
      { tipo: 'loose', nombre: '', cuantos: 0, total: 4 },
      'They share no skill and no command.',
      'No comparten ninguna skill ni ningún comando.',
    ],
  ]
  for (const [razon, ingles, espanol] of casos) {
    it(`${razon.tipo} ${razon.cuantos}/${razon.total}`, () => {
      assert.equal(razonTexto(sala(razon), 'en'), ingles)
      assert.equal(razonTexto(sala(razon), 'es'), espanol)
    })
  }
  it('sin razon usa el motivo que mandó el daemon', () => {
    assert.equal(razonTexto(sala(undefined, 'Los 2 citan `y`.'), 'en'), 'Los 2 citan `y`.')
  })
})

describe('nombreSala', () => {
  it('traduce el nombre de la sala suelta y deja el resto', () => {
    assert.equal(nombreSala({ nombre: 'unlinked', tipo: 'loose' }, 'es'), 'sin vínculos')
    assert.equal(nombreSala({ nombre: 'sin vínculos', tipo: 'suelto' }, 'en'), 'unlinked')
    assert.equal(nombreSala({ nombre: 'unlinked', tipo: 'suelto' }, 'en'), 'unlinked')
    assert.equal(nombreSala({ nombre: 'style-guide', tipo: 'skill' }, 'es'), 'style-guide')
  })
})
