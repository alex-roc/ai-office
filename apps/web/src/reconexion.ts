/** Reconexión: 1 s, 2 s, 4 s… con tope. Un daemon caído no debe recibir un golpe por segundo. */
export const ESPERA_MIN = 1000
export const ESPERA_MAX = 30000

export const esperaTras = (fallos: number): number =>
  Math.min(ESPERA_MAX, ESPERA_MIN * 2 ** Math.max(0, fallos - 1))
