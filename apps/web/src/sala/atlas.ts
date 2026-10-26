import { Assets, Texture } from 'pixi.js'
import { MUEBLES, type NombreSprite, PERSONAS } from './catalogo-sprites.ts'
import { registrar } from './texturas.ts'

export {
  FIGURA_DE,
  MUEBLES,
  type Mueble,
  type NombreSprite,
  PERSONAS,
  type Persona,
} from './catalogo-sprites.ts'

/**
 * Atlas de sprites generados: las personas y los muebles.
 *
 * Se sirven como PNG sueltos desde `public/sprites/` en vez de como un atlas empaquetado porque
 * son veinte piezas: el ahorro de un atlas real (una sola llamada de dibujo) no compensa tener
 * que regenerar un empaquetado cada vez que se retoca un sprite. Su procedencia está en
 * `assets/README.md`.
 */

export interface Atlas {
  /** La figura a todo color: un agente que ya ha trabajado. */
  color: Record<string, Texture>
  /**
   * La misma figura desaturada: un agente que nunca se ha delegado. No está "triste" ni
   * "muerto" — está literalmente SIN COLOREAR, que es el estado real de su archivo (ninguno de
   * los 19 tiene `color:`). Se hornea al cargar en vez de resolverse con un filtro porque un
   * filtro por sprite cuesta una pasada de GPU por figura y aquí hay decenas.
   */
  gris: Record<string, Texture>
}

/** Desatura y aclara ligeramente una textura ya cargada, devolviendo otra independiente. */
const desaturar = (tex: Texture): Texture => {
  const src = tex.source.resource as CanvasImageSource & { width: number; height: number }
  const canvas = document.createElement('canvas')
  canvas.width = tex.width
  canvas.height = tex.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return tex
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    // Luma perceptual (Rec. 601): una media aritmética dejaría los verdes demasiado claros y
    // los azules demasiado oscuros, y la figura perdería la lectura de su silueta.
    const y = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0)
    // Un 12% del color original sobrevive: lo justo para que no parezca una mancha plana.
    const gris = y * 0.72 + 52
    d[i] = gris * 0.88 + (d[i] ?? 0) * 0.12
    d[i + 1] = gris * 0.88 + (d[i + 1] ?? 0) * 0.12
    d[i + 2] = gris * 0.9 + (d[i + 2] ?? 0) * 0.1
  }
  ctx.putImageData(img, 0, 0)
  return registrar(Texture.from(canvas))
}

let cargado: Atlas | null = null

/** Carga (una sola vez) las veinte piezas y hornea sus versiones en gris. */
export const cargarAtlas = async (): Promise<Atlas> => {
  if (cargado) return cargado
  const nombres: NombreSprite[] = [...PERSONAS, ...MUEBLES]
  const texturas = await Promise.all(
    nombres.map(async (n) => {
      const tex = registrar((await Assets.load(`sprites/${n}.png`)) as Texture)
      return [n, tex] as const
    }),
  )
  const color: Record<string, Texture> = {}
  const gris: Record<string, Texture> = {}
  for (const [n, tex] of texturas) {
    color[n] = tex
    gris[n] = desaturar(tex)
  }
  cargado = { color, gris }
  return cargado
}
