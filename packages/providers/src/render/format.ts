import type { Lang } from '@ai-office/core'

/**
 * Números tal y como los escribe quien usa la herramienta: con separador de miles también en las
 * cifras de cuatro dígitos (`toLocaleString('es')` deja `1234` sin punto, y entonces `1234` y
 * `12.345` conviven en la misma pantalla). en-US por defecto; es-ES con `lang: 'es'`.
 */
const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-ES' }

const formatters = new Map<Lang, Intl.NumberFormat>()

const nf = (lang: Lang): Intl.NumberFormat => {
  let f = formatters.get(lang)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[lang], { useGrouping: 'always' })
    formatters.set(lang, f)
  }
  return f
}

export const formatNumber = (n: number, lang: Lang = 'en'): string => nf(lang).format(n)

/** Decimales con coma o punto según el idioma (p. ej. los segundos que tardó el censo). */
export const formatDecimal = (n: number, digits: number, lang: Lang = 'en'): string =>
  n.toLocaleString(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits })
