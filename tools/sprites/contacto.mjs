#!/usr/bin/env node
/**
 * Hoja de contacto: junta todos los sprites de un directorio en una sola imagen, ampliada con
 * vecino más cercano, para poder revisar a ojo que el recorte y la reducción no han roto nada.
 * Es una herramienta de revisión, no entra en el paquete.
 *
 * Uso: node tools/sprites/contacto.mjs <dir> <salida.png> [escala]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const [dir, salida, escalaCruda] = process.argv.slice(2)
const escala = Number(escalaCruda ?? 4)
const archivos = readdirSync(dir)
  .filter((f) => f.endsWith('.png'))
  .sort()
const piezas = archivos.map((f) => ({ nombre: f, png: PNG.sync.read(readFileSync(join(dir, f))) }))

const MARGEN = 4
const anchoCelda = Math.max(...piezas.map((p) => p.png.width)) + MARGEN * 2
const altoCelda = Math.max(...piezas.map((p) => p.png.height)) + MARGEN * 2
const cols = Math.min(8, piezas.length)
const filas = Math.ceil(piezas.length / cols)

const out = new PNG({ width: anchoCelda * cols * escala, height: altoCelda * filas * escala })
// Fondo a cuadros: delata cualquier fleco semitransparente que haya sobrevivido al recorte.
for (let y = 0; y < out.height; y++) {
  for (let x = 0; x < out.width; x++) {
    const i = (out.width * y + x) * 4
    const c = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 210 : 235
    out.data[i] = c
    out.data[i + 1] = c
    out.data[i + 2] = c
    out.data[i + 3] = 255
  }
}

piezas.forEach(({ png }, n) => {
  const cx = (n % cols) * anchoCelda + MARGEN
  // Alineadas por la BASE, no por el centro: así se ve de un vistazo si una figura quedó más
  // alta o más baja que las demás, que es el fallo típico de una hoja generada.
  const cy = Math.floor(n / cols) * altoCelda + (altoCelda - png.height - MARGEN)
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const s = (png.width * y + x) * 4
      if (png.data[s + 3] < 24) continue
      for (let ey = 0; ey < escala; ey++) {
        for (let ex = 0; ex < escala; ex++) {
          const dx = (cx + x) * escala + ex
          const dy = (cy + y) * escala + ey
          const d = (out.width * dy + dx) * 4
          out.data[d] = png.data[s]
          out.data[d + 1] = png.data[s + 1]
          out.data[d + 2] = png.data[s + 2]
          out.data[d + 3] = 255
        }
      }
    }
  }
})
writeFileSync(salida, PNG.sync.write(out))
console.log(`${salida}: ${piezas.length} piezas, ${out.width}x${out.height}`)
