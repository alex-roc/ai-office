import { useSyncExternalStore } from 'react'
import { getLang, type Lang, subscribeLang, t } from './index.ts'

/** El idioma actual, suscrito: el componente se vuelve a pintar al cambiarlo, sin recargar. */
export const useLang = (): Lang => useSyncExternalStore(subscribeLang, getLang)

/**
 * `t` ligado a la suscripción. Se llama en cada componente que pinta texto, también en los
 * `memo`: la suscripción es interna, así que cambiar de idioma los re-renderiza aunque sus props
 * no hayan cambiado.
 */
export const useT = (): typeof t => {
  useLang()
  return t
}
