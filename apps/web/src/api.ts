import { abrirSocketDemo, DEMO, demoPost, demoSnapshot } from './demo.ts'
import { ApiError, apiError, errorDeCodigo, esDaemonCaido } from './errores.ts'
import { t } from './i18n/index.ts'
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

/**
 * Un fallo de `demoPost` → `ApiError`. El compilador de flujos del navegador lanza `OfficeError`
 * (con `code` y `params`, sin imports de Node): se traduce igual que un error del daemon.
 */
const errorDeDemo = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err
  const e = err as {
    message?: string
    code?: unknown
    kind?: string
    params?: Record<string, string | number>
  }
  if (typeof e.code === 'string') {
    return errorDeCodigo(
      e.kind ?? 'invalid-request',
      e.message ?? '',
      400,
      undefined,
      e.code,
      e.params,
    )
  }
  return new ApiError('http', e.message || t('demo.error'), 403)
}

const headers = (conCuerpo: boolean): HeadersInit => ({
  authorization: `Bearer ${token}`,
  'x-ai-office': '1',
  ...(conCuerpo ? { 'content-type': 'application/json' } : {}),
})

/** Una petición HTTP al daemon, con todos los fallos ya traducidos a `ApiError`. */
const pedir = async <T>(url: string, init: RequestInit): Promise<T> => {
  if (DEMO) {
    // Sin daemon: el snapshot es el de la instalación ficticia y escribir no está permitido.
    if (url === '/api/snapshot' || url === '/api/refresh') return (await demoSnapshot()) as T
    try {
      const cuerpo = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
      return (await demoPost(url, cuerpo)) as T
    } catch (err) {
      throw errorDeDemo(err)
    }
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw apiError('red', 'err.red')
  }
  const text = await res.text()
  if (res.status === 401) throw apiError('auth', 'err.auth', 401)
  if (esDaemonCaido(res.status)) throw apiError('red', 'err.red', res.status)
  if (!res.ok) {
    let mensaje: string | undefined
    let code: string | undefined
    let reason: string | undefined
    let params: Record<string, string | number> | undefined
    let currentEtag: string | undefined
    let esJson = false
    try {
      const parsed = JSON.parse(text) as {
        error?: string
        message?: string
        code?: string
        reason?: string
        params?: Record<string, string | number>
        currentEtag?: string
      }
      mensaje = parsed.error ?? parsed.message
      code = parsed.code
      reason = parsed.reason
      params = parsed.params
      currentEtag = parsed.currentEtag
      esJson = true
    } catch {
      /* respuesta no JSON: se usa el mensaje genérico */
    }
    // El daemon siempre contesta sus errores con JSON. Un 5xx SIN cuerpo JSON no es del daemon:
    // es el proxy de Vite sin nadie detrás (devuelve un 500 vacío al rechazarse la conexión).
    if (res.status >= 500 && !esJson) throw apiError('red', 'err.red', res.status)
    if (res.status === 409) throw apiError('conflicto', 'err.conflict', 409, currentEtag)
    // Con `code` se traduce por código; sin él (o desconocido) queda el texto del daemon, y si
    // tampoco hay texto, el estado HTTP.
    if (!code && !mensaje)
      throw apiError('http', 'err.http', res.status, undefined, { status: res.status })
    throw errorDeCodigo(code, mensaje ?? '', res.status, currentEtag, reason, params)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw apiError('json', 'err.json', res.status)
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
  if (DEMO) return abrirSocketDemo()
  const esquema = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return new WebSocket(`${esquema}://${window.location.host}/api/live`)
}
