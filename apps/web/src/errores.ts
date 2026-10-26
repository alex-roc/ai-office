/**
 * Errores de red traducidos. Un `Failed to fetch` o un `Unexpected token '<'` no le dicen nada a
 * quien acaba de abrir la interfaz: aquí cada fallo conocido se convierte en qué pasa y qué hacer.
 *
 * Un `ApiError` recuerda la clave de su mensaje: se vuelve a traducir al mostrarlo, así que un
 * error que sigue en pantalla cambia de idioma junto con el conmutador.
 */

import { type Clave, type Params, t, tieneClave } from './i18n/index.ts'

export type ClaseError = 'red' | 'auth' | 'conflicto' | 'json' | 'http'

/** Los `code` con los que el daemon acompaña a su `error`. */
const CODIGOS: Record<string, { clave: Clave; conDetalle: boolean }> = {
  unauthorized: { clave: 'err.auth', conDetalle: false },
  conflict: { clave: 'err.conflict', conDetalle: false },
  'demo-readonly': { clave: 'demo.error', conDetalle: false },
  'forbidden-host': { clave: 'err.code.forbidden-host', conDetalle: false },
  'forbidden-origin': { clave: 'err.code.forbidden-origin', conDetalle: false },
  'missing-header': { clave: 'err.code.missing-header', conDetalle: false },
  'not-found': { clave: 'err.code.not-found', conDetalle: true },
  'invalid-request': { clave: 'err.code.invalid-request', conDetalle: true },
  internal: { clave: 'err.code.internal', conDetalle: true },
}

export class ApiError extends Error {
  readonly clase: ClaseError
  readonly status: number
  /** Solo en un conflicto de etag: la versión que hay ahora en disco. */
  readonly currentEtag?: string
  /** Clave del catálogo del mensaje, si lo hay: permite traducirlo de nuevo al cambiar de idioma. */
  readonly clave?: Clave
  readonly params?: Params
  /** Texto que el daemon añadió al `code`, ya sin traducir (un detalle de validación, por ejemplo). */
  readonly detalle?: string

  constructor(
    clase: ClaseError,
    mensaje: string,
    status = 0,
    currentEtag?: string,
    extra: { clave?: Clave; params?: Params; detalle?: string } = {},
  ) {
    super(mensaje)
    this.name = 'ApiError'
    this.clase = clase
    this.status = status
    this.currentEtag = currentEtag
    this.clave = extra.clave
    this.params = extra.params
    this.detalle = extra.detalle
  }
}

/** Un `ApiError` cuyo mensaje sale del catálogo, en el idioma actual. */
export const apiError = (
  clase: ClaseError,
  clave: Clave,
  status = 0,
  currentEtag?: string,
  params?: Params,
  detalle?: string,
): ApiError =>
  new ApiError(clase, t(clave, params), status, currentEtag, { clave, params, detalle })

/**
 * El error del daemon `{ error, code, reason?, params? }`. Se traduce por `reason` (la causa
 * concreta, con sus parámetros) y, si no hay o no se conoce, por `code`; sin ninguno conocido
 * queda `error`, que el daemon escribe en inglés.
 */
export const errorDeCodigo = (
  code: string | undefined,
  texto: string,
  status: number,
  currentEtag?: string,
  reason?: string,
  params?: Params,
): ApiError => {
  const clase: ClaseError =
    code === 'unauthorized' ? 'auth' : code === 'conflict' ? 'conflicto' : 'http'
  const claveReason = reason ? `err.reason.${reason}` : ''
  if (tieneClave(claveReason)) return apiError(clase, claveReason, status, currentEtag, params)
  const conocido = code ? CODIGOS[code] : undefined
  if (!conocido) return new ApiError(clase, texto, status, currentEtag)
  return apiError(
    clase,
    conocido.clave,
    status,
    currentEtag,
    undefined,
    conocido.conDetalle ? texto : undefined,
  )
}

/** Un 502/503/504 es el proxy de Vite (o el daemon a medio arrancar) diciendo que no hay nadie detrás. */
export const esDaemonCaido = (status: number): boolean =>
  status === 502 || status === 503 || status === 504

/** Cualquier cosa lanzada → mensaje en el idioma actual. Idempotente sobre los `ApiError`. */
export const mensajeDeError = (e: unknown): string => {
  if (e instanceof ApiError) {
    if (!e.clave) return e.message
    const base = t(e.clave, e.params)
    return e.detalle && e.detalle !== base ? `${base} (${e.detalle})` : base
  }
  if (e instanceof SyntaxError) return t('err.json')
  if (e instanceof TypeError) return t('err.red')
  if (e instanceof Error) return e.message
  return String(e)
}

/** ¿Merece un reintento automático (el daemon puede volver) o hace falta que el usuario haga algo? */
export const esRecuperable = (e: unknown): boolean =>
  e instanceof ApiError ? e.clase === 'red' : e instanceof TypeError
