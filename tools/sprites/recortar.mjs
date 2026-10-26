#!/usr/bin/env node
/**
 * Recorta una hoja de sprites generada en sus piezas sueltas.
 *
 * El generador devuelve una rejilla (4x2 personajes, 4x3 muebles) sobre fondo transparente. En
 * vez de cortar por coordenadas fijas —que fallarían en cuanto el modelo desplazara una figura
 * un par de píxeles— se detectan las FRANJAS VACÍAS: se proyecta el alfa sobre el eje Y para
 * encontrar las filas, y dentro de cada fila sobre el eje X para encontrar las columnas. El
 * recorte resultante es ajustado al píxel, así que cada sprite trae su propio tamaño real y no
 * arrastra márgenes que luego descuadran el anclaje a la baldosa.
 *
 * Uso: node tools/sprites/recortar.mjs <hoja.png> <dir-destino> <nombre1,nombre2,...>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { PNG } from 'pngjs'

/** Un píxel cuenta como "tinta" a partir de este alfa: por debajo suele ser basura de borde. */
const UMBRAL_ALFA = 24
/** Una franja vacía separa piezas solo si mide al menos esto: evita partir un personaje por el
 * hueco entre el brazo y el cuerpo. */
const HUECO_MINIMO = 6

const tinta = (png, x, y) => png.data[(png.width * y + x) * 4 + 3] >= UMBRAL_ALFA

/** Agrupa los índices ocupados en tramos contiguos, tolerando huecos menores que HUECO_MINIMO. */
const tramos = (ocupado) => {
  const out = []
  let inicio = -1
  let vacios = 0
  for (let i = 0; i < ocupado.length; i++) {
    if (ocupado[i]) {
      if (inicio < 0) inicio = i
      vacios = 0
    } else if (inicio >= 0) {
      vacios++
      if (vacios >= HUECO_MINIMO) {
        out.push([inicio, i - vacios])
        inicio = -1
        vacios = 0
      }
    }
  }
  if (inicio >= 0) out.push([inicio, ocupado.length - 1])
  return out
}

const recortar = (png, x0, y0, x1, y1) => {
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (png.width * (y0 + y) + (x0 + x)) * 4
      const dst = (w * y + x) * 4
      out.data[dst] = png.data[src]
      out.data[dst + 1] = png.data[src + 1]
      out.data[dst + 2] = png.data[src + 2]
      out.data[dst + 3] = png.data[src + 3]
    }
  }
  return out
}

/**
 * Reduce una pieza por un factor no entero usando la MODA del bloque de origen, no la media.
 *
 * Una media (que es lo que hace cualquier redimensionado normal) inventa colores intermedios y
 * emborrona el filo: justo lo que mata el aspecto de pixel art. La moda elige el color que más
 * se repite en el bloque, así que los bordes siguen siendo duros y la paleta se mantiene cerrada.
 *
 * El bloque sale transparente si menos de la mitad de sus píxeles tenían tinta, que es lo que
 * conserva la silueta sin dejar flecos semitransparentes alrededor.
 */
const reducir = (png, factor) => {
  const w = Math.max(1, Math.round(png.width / factor))
  const h = Math.max(1, Math.round(png.height / factor))
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * png.width) / w)
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * png.width) / w))
      const sy0 = Math.floor((y * png.height) / h)
      const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * png.height) / h))
      const cuenta = new Map()
      let opacos = 0
      let total = 0
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          total++
          const i = (png.width * sy + sx) * 4
          if (png.data[i + 3] < UMBRAL_ALFA) continue
          opacos++
          const clave = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2]
          cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
        }
      }
      const dst = (w * y + x) * 4
      if (opacos * 2 < total) {
        out.data[dst + 3] = 0
        continue
      }
      let mejor = 0
      let mejorN = -1
      for (const [clave, n] of cuenta) {
        if (n > mejorN) {
          mejorN = n
          mejor = clave
        }
      }
      out.data[dst] = (mejor >> 16) & 0xff
      out.data[dst + 1] = (mejor >> 8) & 0xff
      out.data[dst + 2] = mejor & 0xff
      out.data[dst + 3] = 255
    }
  }
  return out
}

const argv = process.argv.slice(2)
// `--alto N` fija la altura en pixeles de la pieza MAS ALTA de la hoja; todas las demas se
// reducen con ESE MISMO factor, no cada una a su altura. Escalar cada pieza por separado
// destruiria las proporciones relativas, que es justo lo que hace que una silla parezca una
// silla al lado de una persona.
let altoObjetivo = 0
const iAlto = argv.indexOf('--alto')
if (iAlto >= 0) {
  altoObjetivo = Number(argv[iAlto + 1])
  argv.splice(iAlto, 2)
}
const [hoja, destino, nombresCrudos] = argv
if (!hoja || !destino || !nombresCrudos) {
  console.error('uso: recortar.mjs <hoja.png> <dir-destino> <nombre1,nombre2,...>')
  process.exit(1)
}
const nombres = nombresCrudos
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const png = PNG.sync.read(readFileSync(hoja))
mkdirSync(destino, { recursive: true })

// Filas: proyección del alfa sobre el eje Y.
const filasOcupadas = new Array(png.height).fill(false)
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    if (tinta(png, x, y)) {
      filasOcupadas[y] = true
      break
    }
  }
}

const piezas = []
for (const [y0, y1] of tramos(filasOcupadas)) {
  // Columnas: la misma proyección, pero restringida a esta franja horizontal.
  const cols = new Array(png.width).fill(false)
  for (let x = 0; x < png.width; x++) {
    for (let y = y0; y <= y1; y++) {
      if (tinta(png, x, y)) {
        cols[x] = true
        break
      }
    }
  }
  for (const [x0, x1] of tramos(cols)) {
    // Reajuste vertical fino: dentro de su columna, la pieza puede no ocupar toda la franja.
    let ty0 = y1
    let ty1 = y0
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (tinta(png, x, y)) {
          if (y < ty0) ty0 = y
          if (y > ty1) ty1 = y
          break
        }
      }
    }
    piezas.push([x0, ty0, x1, ty1])
  }
}

if (piezas.length !== nombres.length) {
  console.error(
    `${basename(hoja)}: se detectaron ${piezas.length} piezas pero se dieron ${nombres.length} nombres.`,
  )
  console.error(piezas.map((p, i) => `  ${i}: ${p.join(',')}`).join('\n'))
  process.exit(2)
}

const altoMaximo = Math.max(...piezas.map(([, y0, , y1]) => y1 - y0 + 1))
const factor = altoObjetivo > 0 ? altoMaximo / altoObjetivo : 1

const manifiesto = {}
piezas.forEach(([x0, y0, x1, y1], i) => {
  const nombre = nombres[i]
  const recorte = recortar(png, x0, y0, x1, y1)
  const pieza = factor > 1 ? reducir(recorte, factor) : recorte
  writeFileSync(join(destino, `${nombre}.png`), PNG.sync.write(pieza))
  manifiesto[nombre] = { w: pieza.width, h: pieza.height }
})
console.log(
  JSON.stringify(
    { hoja: basename(hoja), factor: Number(factor.toFixed(3)), piezas: manifiesto },
    null,
    2,
  ),
)
