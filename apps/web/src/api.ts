import type { Snapshot } from './types.ts'

/**
 * El token llega en el fragmento de la URL (`#t=...`), que no viaja al servidor ni queda en los
 * logs, y se guarda solo en memoria de la pestaña.
 *
 * Se relee en cada uso y se escucha `hashchange` a propósito: el daemon genera un token nuevo en
 * cada arranque, y pegar el enlace nuevo en una pestaña ya abierta solo cambia el hash sin
 * recargar. Capturar el token una sola vez dejaba la interfaz muerta con 401 sin explicación.
 */
const readTokenFromHash = (): string | null => {
  const fromHash = /[#&]t=([^&]+)/.exec(window.location.hash)?.[1]
  if (!fromHash) return null
  sessionStorage.setItem('ai-office-token', fromHash)
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return fromHash
}

let token = readTokenFromHash() ?? sessionStorage.getItem('ai-office-token') ?? ''

window.addEventListener('hashchange', () => {
  const nuevo = readTokenFromHash()
  if (nuevo) token = nuevo
})

export const getToken = (): string => token

const headers = (): HeadersInit => ({
  authorization: `Bearer ${token}`,
  'x-ai-office': '1',
})

const SIN_TOKEN =
  'Token no válido. Arranca `ai-office` y abre el enlace que imprime, con su #t=… al final.'

export const fetchSnapshot = async (): Promise<Snapshot> => {
  const res = await fetch('/api/snapshot', { headers: headers() })
  if (res.status === 401) throw new Error(SIN_TOKEN)
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`)
  return (await res.json()) as Snapshot
}

export const refreshSnapshot = async (): Promise<Snapshot> => {
  const res = await fetch('/api/refresh', { method: 'POST', headers: headers() })
  if (res.status === 401) throw new Error(SIN_TOKEN)
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`)
  return (await res.json()) as Snapshot
}
