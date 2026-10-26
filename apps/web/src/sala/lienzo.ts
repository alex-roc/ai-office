/**
 * Un lienzo de píxeles crudo: RGBA en un `Uint8ClampedArray`, sin canvas ni Graphics de por medio.
 *
 * Por qué no usar `Graphics` de Pixi para el suelo y las paredes: un rombo dibujado como polígono
 * vectorial se rasteriza con antialias, y al escalarlo con NEAREST (que es lo que hace que esto
 * parezca un juego y no una infografía) esos bordes suavizados se convierten en un halo sucio de
 * medio píxel. Aquí cada píxel se decide a mano, así que el borde del rombo es exacto y las
 * baldosas casan sin costura.
 *
 * Es además testeable sin WebGL: un lienzo es un array, y se puede afirmar sobre píxeles
 * concretos en un test de Node.
 */

export class Lienzo {
  readonly w: number
  readonly h: number
  readonly data: Uint8ClampedArray

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.data = new Uint8ClampedArray(w * h * 4)
  }

  /** Pinta un píxel. Fuera de rango no es un error: simplifica muchísimo a quien dibuja formas
   * que se salen por un borde, y es lo que hace cualquier rasterizador. */
  px(x: number, y: number, color: number, alpha = 255): this {
    const xi = x | 0
    const yi = y | 0
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return this
    const i = (yi * this.w + xi) * 4
    this.data[i] = (color >> 16) & 0xff
    this.data[i + 1] = (color >> 8) & 0xff
    this.data[i + 2] = color & 0xff
    this.data[i + 3] = alpha
    return this
  }

  /** Lee el alfa de un píxel: lo usa el recorte de sprites generados. */
  alphaAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0
    return this.data[(y * this.w + x) * 4 + 3] ?? 0
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 255): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, color, alpha)
    return this
  }

  /** Línea horizontal: el primitivo más usado al dibujar isométrico por barrido. */
  hline(x: number, y: number, w: number, color: number, alpha = 255): this {
    for (let i = 0; i < w; i++) this.px(x + i, y, color, alpha)
    return this
  }

  vline(x: number, y: number, h: number, color: number, alpha = 255): this {
    for (let j = 0; j < h; j++) this.px(x, y + j, color, alpha)
    return this
  }

  /**
   * El rombo de suelo canónico 2:1. En la fila `y` el ancho es `4*(y+1)` en la mitad superior y
   * su espejo en la inferior: con eso el rombo de 64x32 termina justo en los cuatro vértices y
   * encaja con sus vecinos sin solapar ni dejar hueco.
   *
   * `shade(x, y)` permite vetear la madera o granular la alfombra sin exponer el buffer.
   */
  rombo(w: number, h: number, shade: (x: number, y: number) => number): this {
    const mitad = h / 2
    for (let y = 0; y < h; y++) {
      const paso = y < mitad ? y : h - 1 - y
      // En un rombo 2:1 cada fila ensancha 2*w/h pixeles (4 en uno de 64x32), no w/h: con la
      // mitad del ancho las baldosas no se tocan y el suelo sale agujereado.
      const ancho = ((paso + 1) * 2 * w) / h
      const x0 = Math.round((w - ancho) / 2)
      for (let i = 0; i < Math.round(ancho); i++) this.px(x0 + i, y, shade(x0 + i, y))
    }
    return this
  }

  /**
   * Paralelogramo de pared: una banda de ancho `w` y grosor `h` cuyo borde superior cae `skew`
   * píxeles en total de izquierda a derecha (o sube, si `skew` es negativo). Es la cara vertical
   * de la sala vista en isométrico, y también sirve para una balda.
   *
   * Con `skew` negativo la banda empezaría en coordenadas negativas, así que se desplaza hacia
   * abajo lo justo para que quepa entera: quien la coloca solo tiene que saber que el lienzo
   * mide `h + |skew|` de alto.
   */
  pared(w: number, h: number, skew: number, shade: (x: number, y: number) => number): this {
    const offset = skew < 0 ? -skew : 0
    for (let x = 0; x < w; x++) {
      const top = Math.round((skew * x) / w) + offset
      for (let y = 0; y < h; y++) this.px(x, top + y, shade(x, y))
    }
    return this
  }

  /** Elipse rellena, para las sombras proyectadas bajo cada figura. */
  elipse(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 255): this {
    for (let y = -ry; y <= ry; y++) {
      const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))))
      this.hline(cx - dx, cy + y, dx * 2 + 1, color, alpha)
    }
    return this
  }

  /** Los datos listos para `Texture.from`. */
  toImageData(): { data: Uint8ClampedArray; width: number; height: number } {
    return { data: this.data, width: this.w, height: this.h }
  }
}

/**
 * Ruido determinista por píxel, en [0,1). Es lo que da grano a la madera y a la alfombra sin
 * que dos baldosas vecinas se vean calcadas — y al ser función pura de (x,y,semilla), la sala
 * se ve idéntica en cada recarga.
 */
export const ruido = (x: number, y: number, seed = 0): number => {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** Mezcla dos colores enteros. `t=0` da `a`, `t=1` da `b`. Sirve para construir las rampas de
 * 3 pasos de la paleta sin escribirlas a mano una por una. */
export const mezcla = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  return (
    ((ar + (br - ar) * t) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0)
  )
}
