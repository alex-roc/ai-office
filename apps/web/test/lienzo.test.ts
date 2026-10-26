import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TILE } from '../src/sala/iso.ts'
import { Lienzo, mezcla, ruido } from '../src/sala/lienzo.ts'

/** Cuántos píxeles del lienzo tienen tinta. */
const opacos = (l: Lienzo): number => {
  let n = 0
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) if (l.alphaAt(x, y) > 0) n++
  return n
}

describe('lienzo de píxeles', () => {
  it('no revienta al pintar fuera de los bordes', () => {
    const l = new Lienzo(4, 4)
    l.px(-5, 2, 0xffffff).px(99, 2, 0xffffff).px(2, -1, 0xffffff)
    assert.equal(opacos(l), 0)
  })

  it('el rombo de suelo cubre al menos el área del rombo geométrico', () => {
    // Este es el test que faltaba cuando el suelo salió agujereado: con la fórmula mala el rombo
    // ocupaba la mitad de ancho y este número caía a ~544 en vez de 1088.
    //
    // Cubre algo MÁS que el rombo ideal (1024 px) a propósito: en una baldosa isométrica de
    // píxel las dos filas centrales van las dos a ancho completo, de modo que las baldosas
    // engranan en lugar de dejar una costura de medio píxel en la junta. Ese sobrante es el
    // ancho de una baldosa, ni uno más.
    const l = new Lienzo(TILE.w, TILE.h)
    l.rombo(TILE.w, TILE.h, () => 0xffffff)
    const ideal = (TILE.w * TILE.h) / 2
    const cubierto = opacos(l)
    assert.ok(cubierto >= ideal, `el rombo cubre ${cubierto} px, menos que el ideal ${ideal}`)
    assert.ok(
      cubierto <= ideal + TILE.w,
      `el rombo cubre ${cubierto} px, se sale más de una fila del ideal ${ideal}`,
    )
  })

  it('la fila más ancha del rombo mide exactamente el ancho de la baldosa', () => {
    const l = new Lienzo(TILE.w, TILE.h)
    l.rombo(TILE.w, TILE.h, () => 0xffffff)
    let masAncha = 0
    for (let y = 0; y < l.h; y++) {
      let n = 0
      for (let x = 0; x < l.w; x++) if (l.alphaAt(x, y) > 0) n++
      masAncha = Math.max(masAncha, n)
    }
    // Si no llega al ancho completo, las baldosas vecinas no se tocan y el suelo tiene costuras.
    assert.equal(masAncha, TILE.w)
  })

  it('una pared con caída negativa no pierde píxeles por arriba', () => {
    // La pared del fondo-izquierda sube hacia la derecha (caída negativa). Sin el desplazamiento
    // que compensa, la mitad de la banda se dibujaría en coordenadas negativas y se perdería.
    const ancho = 64
    const grosor = 10
    const caida = -32
    const l = new Lienzo(ancho, grosor + Math.abs(caida) + 1)
    l.pared(ancho, grosor, caida, () => 0xffffff)
    assert.equal(opacos(l), ancho * grosor)
  })

  it('la pared con caída positiva cubre lo mismo', () => {
    const l = new Lienzo(64, 10 + 32 + 1)
    l.pared(64, 10, 32, () => 0xffffff)
    assert.equal(opacos(l), 64 * 10)
  })

  it('el ruido es determinista y cae dentro de [0,1)', () => {
    assert.equal(ruido(3, 9, 1), ruido(3, 9, 1))
    assert.notEqual(ruido(3, 9, 1), ruido(3, 9, 2))
    for (let i = 0; i < 200; i++) {
      const v = ruido(i, i * 7, 3)
      assert.ok(v >= 0 && v < 1, `ruido fuera de rango: ${v}`)
    }
  })

  it('mezcla interpola por canal sin desbordar', () => {
    assert.equal(mezcla(0x000000, 0xffffff, 0), 0x000000)
    assert.equal(mezcla(0x000000, 0xffffff, 1), 0xffffff)
    const medio = mezcla(0x000000, 0xffffff, 0.5)
    assert.ok(((medio >> 16) & 0xff) >= 126 && ((medio >> 16) & 0xff) <= 128)
  })
})
