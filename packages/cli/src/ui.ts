/** Formato de terminal. Sin dependencias: son ocho secuencias ANSI. */
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined

const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)

export const bold = wrap('1')
export const dim = wrap('2')
export const red = wrap('31')
export const green = wrap('32')
export const yellow = wrap('33')
export const blue = wrap('34')
export const cyan = wrap('36')

/** Barra de proporción, para que un porcentaje se vea además de leerse. */
export const bar = (ratio: number, width = 24): string => {
  const filled = Math.round(Math.max(0, Math.min(1, ratio)) * width)
  return `${'\u2588'.repeat(filled)}${dim('\u2591'.repeat(width - filled))}`
}

export const pct = (ratio: number): string => `${Math.round(ratio * 100)}%`

export const relDate = (ts: number | null): string => {
  if (!ts) return 'nunca'
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`
  return `hace ${Math.floor(days / 365)} años`
}
