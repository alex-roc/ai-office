import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  moverPaso,
  normalizarFases,
  separarDelGrupo,
  tamanoDeGrupo,
  unirConAnterior,
  vaConAnterior,
} from '../src/fases.ts'

const paso = (agent: string, phase?: number) => ({ agent, phase })
const resumen = (steps: { agent: string; phase?: number }[]) =>
  steps.map((s) => `${s.agent}${s.phase}`).join(' ')

describe('normalizarFases', () => {
  it('renumera a 1..n sin huecos conservando los grupos', () => {
    const r = normalizarFases([paso('a', 3), paso('b', 3), paso('c', 7)])
    assert.equal(resumen(r), 'a1 b1 c2')
  })

  it('un paso sin fase cuenta como su posición, igual que el compilador', () => {
    assert.equal(resumen(normalizarFases([paso('a'), paso('b'), paso('c')])), 'a1 b2 c3')
  })

  it('ordena por fase aunque lleguen desordenadas', () => {
    assert.equal(resumen(normalizarFases([paso('a', 2), paso('b', 1)])), 'b1 a2')
  })
})

describe('moverPaso', () => {
  it('dentro de un grupo intercambia sin deshacer el "a la vez"', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 1), paso('c', 2)])
    assert.equal(resumen(moverPaso(base, 0, 1)), 'b1 a1 c2')
  })

  it('un paso suelto salta el grupo entero vecino', () => {
    const base = normalizarFases([paso('x', 1), paso('a', 2), paso('b', 2)])
    assert.equal(resumen(moverPaso(base, 0, 1)), 'a1 b1 x2')
    assert.equal(resumen(moverPaso(moverPaso(base, 0, 1), 2, -1)), 'x1 a2 b2')
  })

  it('en el borde de un grupo, hacia fuera, primero lo saca del grupo sin cambiar el orden', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 1), paso('c', 2)])
    // b es el último del grupo {a, b}: bajar lo separa pero no lo adelanta a c.
    assert.equal(resumen(moverPaso(base, 1, 1)), 'a1 b2 c3')
    // a es el primero del grupo: subir lo deja solo y por delante.
    assert.equal(resumen(moverPaso(base, 0, -1)), 'a1 b2 c3')
  })

  it('no pierde ni duplica pasos, y nunca deja huecos', () => {
    let lista = normalizarFases([
      paso('a', 1),
      paso('b', 1),
      paso('c', 2),
      paso('d', 3),
      paso('e', 3),
    ])
    for (const [i, d] of [
      [4, -1],
      [0, 1],
      [2, 1],
      [3, -1],
      [1, 1],
      [0, -1],
    ] as const) {
      lista = moverPaso(lista, i, d)
      assert.deepEqual(lista.map((s) => s.agent).sort(), ['a', 'b', 'c', 'd', 'e'])
      const fases = [...new Set(lista.map((s) => s.phase))]
      assert.deepEqual(
        fases,
        fases.map((_, k) => k + 1),
      )
    }
  })

  it('en los extremos de la lista no hace nada (si va solo)', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 2)])
    assert.equal(resumen(moverPaso(base, 0, -1)), 'a1 b2')
    assert.equal(resumen(moverPaso(base, 1, 1)), 'a1 b2')
  })
})

describe('unir y separar', () => {
  it('unir pone al paso a la vez que el anterior', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 2), paso('c', 3)])
    const r = unirConAnterior(base, 1)
    assert.equal(resumen(r), 'a1 b1 c2')
    assert.equal(vaConAnterior(r, 1), true)
  })

  it('unir un paso que encabezaba un grupo deja a los demás en su fase, sin huecos', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 2), paso('c', 2)])
    assert.equal(resumen(unirConAnterior(base, 1)), 'a1 b1 c2')
  })

  it('separar empieza una fase nueva en ese paso; los siguientes del grupo lo acompañan', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 1), paso('c', 1), paso('d', 2)])
    assert.equal(resumen(separarDelGrupo(base, 1)), 'a1 b2 c2 d3')
    assert.equal(resumen(separarDelGrupo(base, 2)), 'a1 b1 c2 d3')
  })

  it('separar un paso que no va con el anterior no cambia nada', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 2)])
    assert.equal(resumen(separarDelGrupo(base, 1)), 'a1 b2')
  })

  it('unir y separar son inversas', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 2), paso('c', 3)])
    assert.deepEqual(separarDelGrupo(unirConAnterior(base, 1), 1), base)
  })

  it('tamanoDeGrupo cuenta los pasos de la misma fase', () => {
    const base = normalizarFases([paso('a', 1), paso('b', 1), paso('c', 2)])
    assert.equal(tamanoDeGrupo(base, 0), 2)
    assert.equal(tamanoDeGrupo(base, 2), 1)
  })
})
