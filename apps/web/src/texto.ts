/** Textos y formatos compartidos por toda la interfaz. Puro: sin React ni DOM, se prueba en Node. */

/** "1 uso" / "3 usos": el plural en un solo sitio, para que no vuelva a salir "1 usos". */
export const plural = (n: number, uno: string, varios: string): string =>
  `${n} ${n === 1 ? uno : varios}`

/** Cómo se llama en pantalla el hilo principal: tú, hablando con Claude Code sin subagente. */
export const NOMBRE_HILO = 'hilo principal (tú)'

export const GRADE_LABEL: Record<string, string> = {
  unused: 'sin estrenar',
  tried: 'estrenada',
  practicing: 'en práctica',
  certified: 'acreditada',
}

export const gradoEtiqueta = (grado: string | undefined): string =>
  GRADE_LABEL[grado ?? 'unused'] ?? grado ?? 'sin estrenar'

const DIA = 86400000

export const relDate = (ts: number | null | undefined, ahora = Date.now()): string => {
  if (!ts) return 'nunca'
  const days = Math.floor((ahora - ts) / DIA)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  if (days < 365) {
    const meses = Math.max(1, Math.round(days / 30))
    return `hace ${plural(meses, 'mes', 'meses')}`
  }
  const anios = Math.max(1, Math.round(days / 365))
  return `hace ${plural(anios, 'año', 'años')}`
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
