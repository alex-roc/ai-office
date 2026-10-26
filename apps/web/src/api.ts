import { ApiError, esDaemonCaido, MSG_AUTH, MSG_CONFLICTO, MSG_RED } from './errores.ts'
import type { Snapshot } from './types.ts'

/**
 * ÚNICO módulo que toca la red: `apiGet`/`apiPost` para HTTP y `abrirSocketVivo` para el
 * WebSocket. `flows.ts`, `mutations.ts` y `live.ts` solo llaman a estas funciones.
 *
 * Es deliberado: un "modo demo estático" (`import.meta.env.VITE_DEMO`, sin daemon) tendrá que
 * sustituir exactamente estos tres puntos y nada más. Si se añade un `fetch` suelto en otro
 * archivo, el modo demo se rompe en silencio justo ahí.
 *
 * El token llega en el fragmento de la URL (`#t=...`), que no viaja al servidor ni queda en los
 * logs, y se guarda solo en memoria de la pestaña.
 *
 * Se relee en cada uso y se escucha `hashchange` a propósito: el daemon genera un token nuevo en
 * cada arranque, y pegar el enlace nuevo en una pestaña ya abierta solo cambia el hash sin
 * recargar. Capturar el token una sola vez dejaba la interfaz muerta con 401 sin explicación.
 * Quien depende del token (el snapshot, el WebSocket) se suscribe con `subscribeToken`.
 */

const guardar = (clave: string, valor: string): void => {
  try {
    sessionStorage.setItem(clave, valor)
  } catch {
    /* almacenamiento bloqueado: el token vive solo en memoria */
  }
}

const leer = (clave: string): string | null => {
  try {
    return sessionStorage.getItem(clave)
  } catch {
    return null
  }
}

const readTokenFromHash = (): string | null => {
  const fromHash = /[#&]t=([^&]+)/.exec(window.location.hash)?.[1]
  if (!fromHash) return null
  guardar('ai-office-token', fromHash)
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return fromHash
}

let token = readTokenFromHash() ?? leer('ai-office-token') ?? ''
const oyentes = new Set<() => void>()

window.addEventListener('hashchange', () => {
  const nuevo = readTokenFromHash()
  if (!nuevo || nuevo === token) return
  token = nuevo
  for (const f of oyentes) f()
})

export const getToken = (): string => token

/** Avisa cuando el token cambia (se pegó un enlace nuevo). Devuelve la función para darse de baja. */
export const subscribeToken = (f: () => void): (() => void) => {
  oyentes.add(f)
  return () => {
    oyentes.delete(f)
  }
}

const headers = (conCuerpo: boolean): HeadersInit => ({
  authorization: `Bearer ${token}`,
  'x-ai-office': '1',
  ...(conCuerpo ? { 'content-type': 'application/json' } : {}),
})

/** Una petición HTTP al daemon, con todos los fallos ya traducidos a `ApiError`. */
const pedir = async <T>(url: string, init: RequestInit): Promise<T> => {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError('red', MSG_RED)
  }
  const text = await res.text()
  if (res.status === 401) throw new ApiError('auth', MSG_AUTH, 401)
  if (esDaemonCaido(res.status)) throw new ApiError('red', MSG_RED, res.status)
  if (!res.ok) {
    let mensaje = `El servidor respondió ${res.status}`
    let currentEtag: string | undefined
    let esJson = false
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string; currentEtag?: string }
      mensaje = parsed.error ?? parsed.message ?? mensaje
      currentEtag = parsed.currentEtag
      esJson = true
    } catch {
      /* respuesta no JSON: se usa el mensaje genérico */
    }
    // El daemon siempre contesta sus errores con JSON. Un 5xx SIN cuerpo JSON no es del daemon:
    // es el proxy de Vite sin nadie detrás (devuelve un 500 vacío al rechazarse la conexión).
    if (res.status >= 500 && !esJson) throw new ApiError('red', MSG_RED, res.status)
    if (res.status === 409) throw new ApiError('conflicto', MSG_CONFLICTO, 409, currentEtag)
    throw new ApiError('http', mensaje, res.status)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError(
      'json',
      'El servidor respondió algo que no es JSON. Suele ser el servidor de desarrollo sin daemon detrás: arranca `pnpm dev` y recarga.',
      res.status,
    )
  }
}

export const apiGet = <T>(url: string): Promise<T> => pedir<T>(url, { headers: headers(false) })

export const apiPost = <T>(url: string, body?: unknown): Promise<T> =>
  pedir<T>(url, {
    method: 'POST',
    headers: headers(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  })

export const fetchSnapshot = (): Promise<Snapshot> => apiGet<Snapshot>('/api/snapshot')

export const refreshSnapshot = (): Promise<Snapshot> => apiPost<Snapshot>('/api/refresh')

/** Abre el WebSocket de eventos en vivo. El token NO va aquí: se manda en el primer frame. */
export const abrirSocketVivo = (): WebSocket => {
  const esquema = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return new WebSocket(`${esquema}://${window.location.host}/api/live`)
}
