import { Texture } from 'pixi.js'
import { MAMPARA_H, TILE, WALL_H } from './iso.ts'
import { LUCES_RACK } from './layout.ts'
import { Lienzo, mezcla, ruido } from './lienzo.ts'
import { P } from './paleta.ts'

/**
 * Texturas procedurales de la sala: suelo, paredes, sombras, lomos de skill y tarjetas de
 * comando. Todo lo que es GEOMETRÍA EXACTA se dibuja aquí, píxel a píxel, en vez de generarse
 * con IA: una baldosa generada nunca casaría con su vecina, y un lomo de skill tiene que poder
 * cambiar de altura y de color según el dato, cosa que un PNG fijo no puede.
 *
 * Lo generado (personas y muebles) vive en `atlas.ts`. La frontera es esa: dato variable y
 * teselado perfecto aquí; volumen orgánico allí.
 */

/**
 * Todas las texturas creadas, para poder cambiarles el filtro de golpe.
 *
 * Al AMPLIAR, `nearest` es obligatorio: es lo que mantiene el píxel duro. Al REDUCIR por debajo
 * de 1 pasa lo contrario — `nearest` va tirando uno de cada dos píxeles y la imagen queda
 * comida y parpadeante, mientras que `linear` promedia y da una miniatura limpia. Como la vista
 * general de la planta necesita alejarse, hacen falta los dos modos y hay que poder cambiarlos.
 */
const registradas = new Set<Texture>()

/**
 * Ámbito de texturas: lo que se crea mientras hay uno abierto (el suelo, las paredes y las
 * mamparas de UN snapshot) se libera de golpe al construir el siguiente. Sin esto cada recarga
 * dejaba en GPU y en `registradas` las texturas del snapshot anterior, para siempre.
 *
 * Lo que va por `cacheada` (lomos, tarjetas, sombras) queda fuera a propósito: se reutiliza
 * entre snapshots y su número está acotado por las combinaciones de grado y color.
 */
let ambito: Texture[] | null = null

/** Empieza a anotar las texturas que se creen a partir de ahora. */
export const abrirAmbito = (): void => {
  ambito = []
}

/** Deja de anotar y devuelve lo anotado, para que su dueño lo libere con `liberar`. */
export const cerrarAmbito = (): Texture[] => {
  const hechas = ambito ?? []
  ambito = null
  return hechas
}

/** Destruye texturas (y su fuente en GPU) y las saca del registro de filtrado. */
export const liberar = (texturas: Texture[]): void => {
  for (const t of texturas) {
    registradas.delete(t)
    t.destroy(true)
  }
}

/** Cambia el filtrado de todo lo dibujado. Se llama solo al cruzar el 1x, no en cada cuadro. */
export const filtrarTodo = (modo: 'nearest' | 'linear'): void => {
  for (const t of registradas) t.source.scaleMode = modo
}

/** Apunta una textura al registro y le deja el filtro de píxel duro por defecto. */
export const registrar = (tex: Texture): Texture => {
  tex.source.scaleMode = 'nearest'
  registradas.add(tex)
  ambito?.push(tex)
  return tex
}

/** Convierte un lienzo de bytes en textura de Pixi, con filtrado NEAREST: sin esto el escalado
 * entero de la cámara emborrona el píxel y se pierde de golpe todo el aspecto de videojuego. */
export const aTextura = (lienzo: Lienzo): Texture => {
  const canvas = document.createElement('canvas')
  canvas.width = lienzo.w
  canvas.height = lienzo.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('sin contexto 2d para construir la textura')
  const img = ctx.createImageData(lienzo.w, lienzo.h)
  img.data.set(lienzo.data)
  ctx.putImageData(img, 0, 0)
  return registrar(Texture.from(canvas))
}

/**
 * Baldosa de parqué. Las lamas corren en diagonal siguiendo uno de los ejes isométricos, que es
 * lo que hace que el suelo se lea como un plano y no como un patrón plano pegado encima.
 */
export const sueloRoble = (variante: number): Lienzo => {
  const l = new Lienzo(TILE.w, TILE.h)
  l.rombo(TILE.w, TILE.h, (x, y) => {
    // La lama corre a lo largo de una diagonal isométrica, que es constante en `y - x/2`.
    // Usarla como índice da lamas RECTAS; mezclar los dos ejes daba un zigzag que leía como
    // un tejido, no como un suelo.
    const diagonal = y - x / 2
    const lama = Math.floor(diagonal / 5)
    const base = lama % 2 === 0 ? P.roble : P.robleMedio
    // Junta: solo la primera fila de cada lama, un tono más oscura y nunca negra.
    if (((diagonal % 5) + 5) % 5 < 1) return mezcla(base, P.nogalOscuro, 0.3)
    const grano = ruido(Math.floor(x / 2), y, variante * 31 + lama)
    return mezcla(base, grano > 0.5 ? P.robleClaro : P.nogal, Math.abs(grano - 0.5) * 0.5)
  })
  return l
}

/**
 * Moqueta de un despacho. El `tono` distingue una bahía de la de al lado: sin eso, nueve
 * despachos sobre el mismo parqué se leen como una sola nave y la planta desaparece.
 *
 * Los tonos son apagados a propósito. El color saturado está reservado a los datos (la ropa de
 * un agente, el tejuelo de un lomo); si el suelo compitiera con ellos, el único canal que de
 * verdad significa algo dejaría de destacar.
 */
const MOQUETAS = [
  P.terracota,
  P.salvia,
  P.pizarra,
  P.mostaza,
  P.ciruela,
  P.cian,
  P.rosa,
  P.robleMedio,
] as const

export const sueloAlfombra = (variante: number, tono = 0): Lienzo => {
  const l = new Lienzo(TILE.w, TILE.h)
  // El vestíbulo (tono -1) va en un neutro cálido: es pasillo, no despacho de nadie.
  const base = tono < 0 ? P.yesoSombra : (MOQUETAS[tono % MOQUETAS.length] ?? P.terracota)
  // Muy desaturada hacia el yeso: el suelo ambienta, no grita.
  const apagada = mezcla(base, P.yesoSombra, 0.52)
  l.rombo(TILE.w, TILE.h, (x, y) => {
    const g = ruido(x, y, variante * 17 + tono * 101)
    return mezcla(apagada, g > 0.5 ? P.sombra : P.luz, 0.06)
  })
  return l
}

/**
 * Pared del fondo, de una pieza.
 *
 * Se genera la pared ENTERA en un solo lienzo en vez de repetir un segmento por baldosa: en
 * isométrico, teselar una pared inclinada deja costuras de un píxel en cada junta que se ven
 * muchísimo al ampliar, y aquí se amplía siempre (la cámara escala por enteros).
 *
 * `lado` -1 es la pared del fondo-derecha (el borde `row = 0`, que cae hacia la derecha) y +1 la
 * del fondo-izquierda (el borde `col = 0`, que sube hacia la derecha). La primera mira hacia
 * abajo-izquierda y por tanto recibe el foco; la segunda queda en sombra. Esa coherencia con la
 * luz de los sprites generados —todos iluminados desde arriba-izquierda— es la mitad de la
 * ilusión de volumen.
 */
export const paredLarga = (segmentos: number, lado: -1 | 1, alto = WALL_H): Lienzo => {
  const ancho = segmentos * (TILE.w / 2)
  const caida = lado === -1 ? segmentos * (TILE.h / 2) : -segmentos * (TILE.h / 2)
  const l = new Lienzo(ancho, alto + Math.abs(caida) + 1)
  const claro = lado === -1 ? P.yeso : P.yesoSombra
  const oscuro = lado === -1 ? P.yesoSombra : P.yesoOscuro
  l.pared(ancho, alto, caida, (x, y) => {
    // Rodapié abajo y moldura arriba: dos franjas que dan escala a la pared.
    if (y > alto - 10) return mezcla(P.nogal, oscuro, 0.2)
    if (y < 6) return mezcla(claro, P.papel, 0.4)
    // Junta vertical cada dos baldosas: da ritmo a una superficie que si no sería una mancha.
    if (x % TILE.w === 0) return mezcla(claro, oscuro, 0.55)
    // Degradado vertical suave en 3 pasos, no continuo: es pixel art, no un gradiente.
    const paso = y < alto * 0.45 ? 0 : y < alto * 0.78 ? 1 : 2
    const base = mezcla(claro, oscuro, paso * 0.42)
    return mezcla(base, P.yesoOscuro, ruido(x, y, lado) * 0.06)
  })
  return l
}

/**
 * Mampara: la separación entre un despacho y el de al lado.
 *
 * A la altura del pecho, nunca del techo. Una pared entera entre despachos taparía en isométrico
 * a quien está detrás y la planta se volvería un laberinto ciego; con mampara se ven los nueve
 * despachos a la vez, que es exactamente lo que se viene a ver. Lleva un pasamanos claro arriba
 * porque ese filete es lo único que hace legible su altura desde arriba.
 *
 * Las dos mamparas de DELANTE se piden aún más bajas (`alto`): son las que taparían a quien está
 * sentado en la primera fila, y su trabajo es solo dibujar el borde del despacho y dejar ver por
 * dónde está la puerta.
 */
export const mampara = (segmentos: number, lado: -1 | 1, alto = MAMPARA_H): Lienzo => {
  const ancho = segmentos * (TILE.w / 2)
  const caida = lado === -1 ? segmentos * (TILE.h / 2) : -segmentos * (TILE.h / 2)
  const l = new Lienzo(ancho, alto + Math.abs(caida) + 1)
  const claro = lado === -1 ? P.yeso : P.yesoSombra
  const oscuro = lado === -1 ? P.yesoSombra : P.yesoOscuro
  l.pared(ancho, alto, caida, (x, y) => {
    if (y < 3) return mezcla(P.roble, P.luz, 0.35)
    if (y < 5) return P.nogal
    if (x % TILE.w === 0) return mezcla(claro, oscuro, 0.5)
    const base = mezcla(claro, oscuro, y > alto * 0.6 ? 0.4 : 0.1)
    return mezcla(base, P.yesoOscuro, ruido(x, y, lado) * 0.05)
  })
  return l
}

/**
 * Balda: la misma banda inclinada que la pared pero de seis píxeles de grosor, con el canto
 * iluminado arriba. Es lo que sostiene los lomos del archivador de skills.
 */
export const balda = (segmentos: number, lado: -1 | 1): Lienzo => {
  const ancho = segmentos * (TILE.w / 2)
  const grosor = 6
  const caida = lado === -1 ? segmentos * (TILE.h / 2) : -segmentos * (TILE.h / 2)
  const l = new Lienzo(ancho, grosor + Math.abs(caida) + 1)
  l.pared(ancho, grosor, caida, (_x, y) =>
    y === 0 ? mezcla(P.roble, P.luz, 0.45) : y < 3 ? P.roble : P.nogalOscuro,
  )
  return l
}

/** Sombra elíptica bajo una figura. Es lo que la despega del suelo; sin ella todo flota. */
export const sombra = (rx: number, ry: number): Lienzo => {
  const l = new Lienzo(rx * 2 + 2, ry * 2 + 2)
  // Dos anillos de alfa en vez de un degradado: mantiene el aspecto de píxel.
  l.elipse(rx + 1, ry + 1, rx, ry, P.sombra, 46)
  l.elipse(rx + 1, ry + 1, Math.round(rx * 0.62), Math.round(ry * 0.62), P.sombra, 62)
  return l
}

/**
 * Lomo de una skill en el archivador. La ALTURA es el grado (1 a 4, saturante) y el COLOR es el
 * agente que más la usa; una skill nunca usada sale en blanco de papel, sin tinta. Esos dos
 * canales son datos, no decoración, y por eso el lomo se genera aquí y no se pinta a mano.
 */
export const lomo = (grado: number, color: number | null, ancho = 7): Lienzo => {
  const alto = 18 + grado * 11
  const l = new Lienzo(ancho, alto)
  const base = color ?? P.papel
  const oscuro = color === null ? P.papelSombra : mezcla(base, P.sombra, 0.45)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      // La cara derecha del lomo queda en sombra: le da grosor sin dibujar una segunda cara.
      const c = x >= ancho - 2 ? oscuro : x === 0 ? mezcla(base, P.luz, 0.25) : base
      l.px(x, y, c)
    }
  }
  // Tejuelo: dos filetes dorados, como en un archivador de verdad. Las nunca usadas no lo tienen:
  // un lomo en blanco es un libro sin título, que es exactamente lo que una skill sin uso es.
  if (color !== null) {
    l.hline(1, 5, ancho - 3, P.mostaza)
    l.hline(1, alto - 8, ancho - 3, P.mostaza)
  }
  l.hline(0, 0, ancho, mezcla(base, P.sombra, 0.25))
  return l
}

/**
 * Rack de un servidor MCP: un armario con cinco bandejas, cada una con su luz. Las luces
 * encendidas (`luces` de 0 a `LUCES_RACK`, de arriba abajo) son el grado de uso; una bandeja apagada es
 * un servidor que no ha atendido nunca nada. El estado "deshabilitado" no se pinta aquí: lo pone
 * la escena con la transparencia del sprite, para que una sola textura sirva a los dos casos.
 */
export const ANCHO_RACK = 22
export const ALTO_RACK = 50
/** Dónde cae la luz de la bandeja `i` (de 0 a 4): lo comparten el dibujo y el test. */
export const luzDeRack = (i: number): { x: number; y: number } => ({ x: 3, y: 8 + i * 8 })

export const rack = (luces: number): Lienzo => {
  const l = new Lienzo(ANCHO_RACK, ALTO_RACK)
  const frente = ANCHO_RACK - 5
  // Cara frontal, cara lateral en sombra y tapa iluminada: tres planos bastan para dar volumen.
  l.rect(0, 3, frente, ALTO_RACK - 3, P.pizarraOscura)
  l.rect(frente, 3, ANCHO_RACK - frente, ALTO_RACK - 3, P.tinta)
  l.rect(0, 0, frente, 3, mezcla(P.pizarra, P.luz, 0.3))
  l.rect(frente, 1, ANCHO_RACK - frente, 2, P.pizarra)
  l.hline(0, 3, frente, P.pizarra)
  l.hline(0, ALTO_RACK - 1, ANCHO_RACK, P.tinta)
  for (let i = 0; i < LUCES_RACK; i++) {
    const { x, y } = luzDeRack(i)
    // Bandeja: un filete oscuro arriba y rejilla de ventilación a la derecha de la luz.
    l.hline(1, y - 3, frente - 2, P.tintaSuave)
    for (let v = 0; v < 3; v++) l.hline(x + 5, y - 1 + v * 2, frente - x - 8, P.tinta)
    const encendida = i < luces
    l.rect(x, y - 1, 2, 2, encendida ? mezcla(P.salvia, P.luz, 0.25) : P.tintaSuave)
    if (encendida) l.px(x - 1, y, mezcla(P.salvia, P.pizarraOscura, 0.5))
  }
  return l
}

/**
 * Tarjeta de comando en el corcho. Va siempre con su chincheta: la chincheta es lo que la hace
 * leerse como "algo clavado ahí y olvidado" en vez de como un botón.
 */
export const tarjeta = (usado: boolean, ancho = 34, alto = 22): Lienzo => {
  const l = new Lienzo(ancho, alto + 3)
  const papel = usado ? P.papel : mezcla(P.papel, P.yesoSombra, 0.5)
  l.rect(0, 2, ancho, alto, papel)
  l.hline(0, 2, ancho, mezcla(papel, P.luz, 0.5))
  l.hline(0, alto + 1, ancho, P.papelSombra)
  l.vline(ancho - 1, 2, alto, P.papelSombra)
  // Renglones simulados: la tarjeta tiene texto, pero a este tamaño el texto real sería ruido.
  for (let i = 0; i < 3; i++) l.hline(4, 8 + i * 4, ancho - 10, mezcla(papel, P.grisPiedra, 0.55))
  // Chincheta: roja si se ejecutó alguna vez, gris si nunca.
  const chincheta = usado ? P.terracota : P.grisClaro
  l.elipse(ancho / 2, 3, 3, 2, chincheta)
  l.px(ancho / 2 - 1, 2, mezcla(chincheta, P.luz, 0.6))
  return l
}

/** Caché de texturas: un lomo de grado 3 en terracota se construye una vez y se reutiliza en
 * las 40 baldas. Sin esto se rasterizarían 40 lienzos en cada redibujado. */
const cache = new Map<string, Texture>()
export const cacheada = (clave: string, construir: () => Lienzo): Texture => {
  const previa = cache.get(clave)
  if (previa) return previa
  // Fuera del ámbito del snapshot: esta textura sobrevive a la recarga que la creó.
  const enCurso = ambito
  ambito = null
  const tex = aTextura(construir())
  ambito = enCurso
  cache.set(clave, tex)
  return tex
}
