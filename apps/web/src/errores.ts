/**
 * Errores de red traducidos. Un `Failed to fetch` o un `Unexpected token '<'` no le dicen nada a
 * quien acaba de abrir la interfaz: aquí cada fallo conocido se convierte en qué pasa y qué hacer.
 */

export type ClaseError = 'red' | 'auth' | 'conflicto' | 'json' | 'http'

export class ApiError extends Error {
  readonly clase: ClaseError
  readonly status: number
  /** Solo en un conflicto de etag: la versión que hay ahora en disco. */
  readonly currentEtag?: string

  constructor(clase: ClaseError, mensaje: string, status = 0, currentEtag?: string) {
    super(mensaje)
    this.name = 'ApiError'
    this.clase = clase
    this.status = status
    this.currentEtag = currentEtag
  }
}

export const MSG_RED =
  'No se puede hablar con el daemon de ai-office. ¿Está arrancado? Ejecuta `ai-office` (o `pnpm dev` en el repo) en una terminal y abre el enlace que imprime.'

export const MSG_AUTH =
  'El daemon rechazó el token. Cambia en cada arranque: copia el enlace nuevo que imprime `ai-office` (acaba en #t=…) y pégalo en esta pestaña.'

export const MSG_CONFLICTO =
  'El archivo cambió en disco mientras lo estabas editando. Revisa el cambio y vuelve a guardarlo: así no se pisa lo que escribió otra herramienta.'

/** Un 502/503/504 es el proxy de Vite (o el daemon a medio arrancar) diciendo que no hay nadie detrás. */
export const esDaemonCaido = (status: number): boolean =>
  status === 502 || status === 503 || status === 504

/** Cualquier cosa lanzada → mensaje en español. Idempotente sobre los `ApiError` ya traducidos. */
export const mensajeDeError = (e: unknown): string => {
  if (e instanceof ApiError) return e.message
  if (e instanceof SyntaxError) {
    return 'El servidor respondió algo que no es JSON. Suele ser el servidor de desarrollo sin daemon detrás: arranca `pnpm dev` y recarga.'
  }
  if (e instanceof TypeError) return MSG_RED
  if (e instanceof Error) return e.message
  return String(e)
}

/** ¿Merece un reintento automático (el daemon puede volver) o hace falta que el usuario haga algo? */
export const esRecuperable = (e: unknown): boolean =>
  e instanceof ApiError ? e.clase === 'red' : e instanceof TypeError
