/**
 * Un error esperado: algo que el usuario puede corregir (un color que no existe, un destino
 * ocupado) y no un fallo del programa. Lleva un `code` estable para que la interfaz lo traduzca
 * y un `message` en inglés como respaldo. Sin imports de Node: lo usa también el compilador de
 * flujos, que corre en el navegador (demo estática).
 *
 * `code` es la causa concreta (`invalid-color`, `path-outside-roots`…); el daemon la envía como
 * `reason` y decide él el código HTTP (`invalid-request`, `not-found`).
 */
export class OfficeError extends Error {
  readonly code: string
  readonly params: Record<string, string | number>
  /** `not-found` si lo pedido no existe; `invalid-request` para todo lo demás. */
  readonly kind: 'invalid-request' | 'not-found'

  constructor(
    code: string,
    message: string,
    opts: { params?: Record<string, string | number>; kind?: 'invalid-request' | 'not-found' } = {},
  ) {
    super(message)
    this.name = 'OfficeError'
    this.code = code
    this.params = opts.params ?? {}
    this.kind = opts.kind ?? 'invalid-request'
  }
}
