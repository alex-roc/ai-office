import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  altoPlanta,
  anchoPlanta,
  depthOf,
  origenX,
  TILE,
  toScreen,
  toTile,
} from '../src/sala/iso.ts'

describe('proyección isométrica', () => {
  it('mantiene la relación 2:1 entre los ejes', () => {
    // Avanzar una baldosa en `col` mueve media baldosa a la derecha y un cuarto hacia abajo.
    const a = toScreen(0, 0)
    const b = toScreen(1, 0)
    assert.equal(b.x - a.x, TILE.w / 2)
    assert.equal(b.y - a.y, TILE.h / 2)
  })

  it('avanza en `row` hacia la izquierda y hacia abajo', () => {
    const a = toScreen(0, 0)
    const b = toScreen(0, 1)
    assert.equal(b.x - a.x, -TILE.w / 2)
    assert.equal(b.y - a.y, TILE.h / 2)
  })

  it('toTile es la inversa exacta de toScreen', () => {
    for (const [col, row] of [
      [0, 0],
      [3, 7],
      [23, 15],
      [5.5, 2.25],
    ] as const) {
      const p = toScreen(col, row)
      const t = toTile(p.x, p.y)
      assert.ok(Math.abs(t.col - col) < 1e-9, `col ${t.col} != ${col}`)
      assert.ok(Math.abs(t.row - row) < 1e-9, `row ${t.row} != ${row}`)
    }
  })

  it('el origen desplaza el vértice izquierdo de la planta a x = 0', () => {
    // La planta ya no tiene tamaño fijo: depende de cuántos despachos salgan del reparto, así
    // que el origen es función del alto y no una constante.
    for (const filas of [4, 12, 20]) {
      assert.equal(toScreen(0, filas).x + origenX(filas), 0)
    }
  })

  it('el tamaño de la planta crece con las dos dimensiones', () => {
    assert.equal(anchoPlanta(20, 12), (20 + 12) * (TILE.w / 2))
    assert.equal(altoPlanta(20, 12), (20 + 12) * (TILE.h / 2))
    // Es un rombo 2:1: siempre el doble de ancho que de alto.
    assert.equal(anchoPlanta(9, 7), altoPlanta(9, 7) * 2)
  })

  it('ordena por profundidad: lo del fondo se pinta antes', () => {
    // Una figura en (2,2) está más al fondo que una en (5,5) y debe pintarse primero para que
    // la de delante la tape, no al revés.
    assert.ok(depthOf(2, 2) < depthOf(5, 5))
    // Dos puntos de la misma diagonal empatan, y el sesgo los desempata de forma estable.
    assert.equal(depthOf(3, 4), depthOf(4, 3))
    assert.ok(depthOf(3, 4, 1) > depthOf(4, 3, 0))
    // Una mampara lleva sesgo muy negativo para quedar SIEMPRE detrás de quien está en su bahía.
    assert.ok(depthOf(3, 3, -400) < depthOf(3, 3, 1))
  })
})
