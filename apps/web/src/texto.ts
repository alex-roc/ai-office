/** Textos y formatos compartidos por toda la interfaz. Puro: sin React ni DOM, se prueba en Node. */

import { type Clave, getLang, type Lang, tieneClave, tr } from './i18n/index.ts'
import type { DetalleCodigo, Sala } from './types.ts'

/** Cómo se llama en pantalla el hilo principal: tú, hablando con Claude Code sin subagente. */
export const nombreHilo = (lang: Lang = getLang()): string => tr(lang, 'main.thread')

export const gradoEtiqueta = (grado: string | undefined, lang: Lang = getLang()): string => {
  const g = grado ?? 'unused'
  return g === 'unused' || g === 'tried' || g === 'practicing' || g === 'certified'
    ? tr(lang, `grade.${g}`)
    : g
}

const DIA = 86400000

/**
 * Fecha relativa en el idioma de la interfaz ("3 days ago", "hace 3 días"). Los días hablan de
 * hoy y ayer; a partir de ahí, siempre con número: "1 month ago" y no "last month".
 */
export const relDate = (
  ts: number | null | undefined,
  ahora = Date.now(),
  lang: Lang = getLang(),
): string => {
  if (!ts) return tr(lang, 'time.never')
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  const siempre = new Intl.RelativeTimeFormat(lang, { numeric: 'always' })
  const days = Math.floor((ahora - ts) / DIA)
  if (days <= 0) return rtf.format(0, 'day')
  if (days === 1) return rtf.format(-1, 'day')
  if (days < 30) return siempre.format(-days, 'day')
  if (days < 365) return siempre.format(-Math.max(1, Math.round(days / 30)), 'month')
  return siempre.format(-Math.max(1, Math.round(days / 365)), 'year')
}

/** Acorta la carpeta personal a `~` en macOS (`/Users/x`), Linux (`/home/x`) y Windows (`C:\Users\x`). */
export const shortPath = (p: string): string =>
  p.replace(/^(?:\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:[\\/]+Users[\\/]+[^\\/]+)/, '~')

/** Minúsculas y sin acentos: para comparar lo que teclea el usuario con lo que hay en el catálogo. */
export const normalizar = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

/** Lo que el daemon llama a un despacho que no comparte nada: el nombre se traduce en pantalla. */
const NOMBRES_SUELTO = new Set(['unlinked', 'sin vínculos'])

/** El nombre de un despacho tal como se rotula: el rasgo real, salvo el "suelto", que se traduce. */
export const nombreSala = (
  sala: { nombre: string; tipo: string },
  lang: Lang = getLang(),
): string =>
  NOMBRES_SUELTO.has(sala.nombre) || sala.tipo === 'suelto' || sala.tipo === 'loose'
    ? tr(lang, 'room.unlinked')
    : sala.nombre

/**
 * La frase de la placa de un despacho, redactada aquí a partir de `razon` (datos) para que salga
 * en el idioma de la interfaz. Sin `razon` (un daemon más antiguo) se usa el `motivo` ya escrito.
 */
export const razonTexto = (
  sala: Pick<Sala, 'razon' | 'motivo'>,
  lang: Lang = getLang(),
): string => {
  const r = sala.razon
  if (!r) return sala.motivo
  const { cuantos, total } = r
  if (r.tipo === 'loose')
    return tr(lang, total <= 1 ? 'room.reason.loose.one' : 'room.reason.loose.many')
  const base = r.tipo === 'skill' ? 'room.reason.skill' : 'room.reason.command'
  const forma = total <= 1 ? 'one' : cuantos >= total ? 'all' : 'some'
  return tr(lang, `${base}.${forma}`, { name: r.nombre, cuantos, total })
}

/**
 * Un aviso o problema que el daemon manda con `code` (`warn.*`, `problem.*`): se traduce por ese
 * código y, si la interfaz no lo conoce (un daemon más nuevo), queda el `message` en inglés.
 */
export const detalleTexto = (
  prefijo: 'warn' | 'problem',
  d: DetalleCodigo | undefined,
  respaldo: string,
  lang: Lang = getLang(),
): string => {
  const clave = d ? `${prefijo}.${d.code}` : ''
  return d && tieneClave(clave) ? tr(lang, clave as Clave, d.params) : (d?.message ?? respaldo)
}
