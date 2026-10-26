/**
 * Proyección isométrica 2:1 (dimétrica).
 *
 * Toda la planta vive en coordenadas de BALDOSA (`col`, `row`), enteras o fraccionarias, y solo
 * se convierte a píxeles aquí. Esa separación es lo que permite que el layout razone en "qué
 * despacho está al lado de cuál" sin saber nada de la cámara ni del zoom.
 *
 * La relación 2:1 no es estética: es la que hace que una diagonal de baldosa avance exactamente
 * 2 píxeles en horizontal por cada 1 en vertical, así que el borde del rombo cae siempre en
 * píxeles enteros y no aparece el "escalonado sucio" que delata a un isométrico mal medido.
 */

/** Ancho y alto del rombo de suelo, en píxeles de arte (antes del escalado entero de la cámara). */
export const TILE = { w: 64, h: 32 } as const

/** Altura de la pared exterior de la planta. */
export const WALL_H = 150

/**
 * Altura de las mamparas que separan un despacho de otro.
 *
 * A la altura del pecho, no del techo: en isométrico una pared entera entre despachos taparía a
 * quien está detrás y la planta se convertiría en un laberinto ciego. Con mampara se ven las
 * nueve salas a la vez, que es justo lo que se viene a ver.
 */
export const MAMPARA_H = 34

/**
 * Altura de las dos mamparas de DELANTE de un despacho, las que dan al pasillo.
 *
 * Un zócalo, poco más. Son las únicas que en isométrico quedan por delante de la gente, así que
 * a altura de pecho taparían de cintura para abajo a quien se siente en la primera fila. Su
 * trabajo no es cerrar: es dibujar el borde y enseñar dónde está la puerta.
 */
export const MAMPARA_BAJA = 13

export interface Tile {
  col: number
  row: number
}

/**
 * Baldosa → pantalla, SIN desplazar. El origen (0,0) cae en el vértice superior del rombo, así
 * que `isoX` es negativo en la mitad izquierda de la planta; quien dibuja aplica `origenX` una
 * sola vez al contenedor del mundo. Antes esto era una constante y la planta no podía cambiar
 * de tamaño; ahora depende del número de despachos, así que no puede serlo.
 */
export const toScreen = (col: number, row: number): { x: number; y: number } => ({
  x: (col - row) * (TILE.w / 2),
  y: (col + row) * (TILE.h / 2),
})

/** Desplazamiento que lleva el vértice izquierdo del rombo a x = 0. */
export const origenX = (filas: number): number => filas * (TILE.w / 2)

/** Pantalla → baldosa (sin el desplazamiento de origen, igual que `toScreen`). */
export const toTile = (x: number, y: number): Tile => ({
  col: (x / (TILE.w / 2) + y / (TILE.h / 2)) / 2,
  row: (y / (TILE.h / 2) - x / (TILE.w / 2)) / 2,
})

/** Tamaño del rombo completo del suelo, en píxeles. */
export const anchoPlanta = (cols: number, filas: number): number => (cols + filas) * (TILE.w / 2)
export const altoPlanta = (cols: number, filas: number): number => (cols + filas) * (TILE.h / 2)

/**
 * Orden de pintado. En isométrico lo que está "más al fondo" tiene menor `col+row`; pintar en
 * ese orden hace que una figura quede correctamente TAPADA por la mampara que tiene delante. Se
 * multiplica para dejar hueco a desempates (`bias`) sin usar decimales, que en `zIndex` de Pixi
 * ordenan peor.
 */
export const depthOf = (col: number, row: number, bias = 0): number =>
  Math.round((col + row) * 1000) + bias
