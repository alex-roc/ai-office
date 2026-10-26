import { en } from './en.ts'
import { es } from './es.ts'

/**
 * Internacionalización propia y ligera: dos catálogos planos, `t(clave, params)` y nada más.
 *
 * Inglés primero: es el idioma por defecto y NO se autodetecta por `navigator`. El español es el
 * segundo idioma y se elige a propósito (`?lang=es` en la URL, que pone el CLI, o el conmutador
 * de la cabecera, que se recuerda en `localStorage`).
 *
 * Puro hasta donde se puede: sin React ni DOM obligatorios, así se prueba en Node. El hook que
 * suscribe a un componente vive aparte, en `react.ts`.
 */

export type Lang = 'en' | 'es'
export const LANGS: readonly Lang[] = ['en', 'es']
export const LANG_POR_DEFECTO: Lang = 'en'
export const CLAVE_LANG = 'ai-office-lang'

export type Params = Record<string, string | number>

/** `foo_one` / `foo_other` cuentan como la clave `foo`: quien llama no ve el sufijo. */
type SinSufijo<K> = K extends `${infer B}_${'one' | 'other'}` ? B : K
export type Clave = SinSufijo<keyof typeof en>

const catalogos: Record<Lang, Record<string, string>> = { en, es }

/** ¿Existe esta clave en el catálogo (con o sin variantes de plural)? Para claves que llegan en datos. */
export const tieneClave = (clave: string): clave is Clave => clave in en || `${clave}_other` in en

export const esLang = (v: unknown): v is Lang => v === 'en' || v === 'es'

/**
 * Qué idioma usar: `?lang=` de la URL manda, luego lo guardado, y si no, inglés. Los dos orígenes
 * se pasan ya leídos para poder probarlo sin navegador.
 */
export const elegirLang = (search: string | null, guardado: string | null): Lang => {
  const deUrl = new URLSearchParams(search ?? '').get('lang')
  if (esLang(deUrl)) return deUrl
  if (esLang(guardado)) return guardado
  return LANG_POR_DEFECTO
}

const leerGuardado = (): string | null => {
  try {
    return globalThis.localStorage?.getItem(CLAVE_LANG) ?? null
  } catch {
    return null
  }
}

const guardar = (l: Lang): void => {
  try {
    globalThis.localStorage?.setItem(CLAVE_LANG, l)
  } catch {
    /* almacenamiento bloqueado: el idioma vale solo para esta carga */
  }
}

/** Mantiene `<html lang>` y el `?lang=` de la URL (si lo había) acordes con el idioma actual. */
const sincronizarPagina = (l: Lang): void => {
  if (typeof document !== 'undefined') document.documentElement.lang = l
  const loc = globalThis.location
  if (!loc || !new URLSearchParams(loc.search).has('lang')) return
  const params = new URLSearchParams(loc.search)
  params.set('lang', l)
  try {
    history.replaceState(null, '', `${loc.pathname}?${params}${loc.hash}`)
  } catch {
    /* sin history: no pasa nada */
  }
}

let actual: Lang = elegirLang(globalThis.location?.search ?? null, leerGuardado())
if (typeof document !== 'undefined') document.documentElement.lang = actual
const oyentes = new Set<() => void>()

export const getLang = (): Lang => actual

export const setLang = (l: Lang): void => {
  if (l === actual) return
  actual = l
  guardar(l)
  sincronizarPagina(l)
  for (const f of oyentes) f()
}

export const subscribeLang = (f: () => void): (() => void) => {
  oyentes.add(f)
  return () => {
    oyentes.delete(f)
  }
}

const formatos = new Map<Lang, Intl.NumberFormat>()
export const fmtNum = (n: number, lang: Lang = actual): string => {
  let f = formatos.get(lang)
  if (!f) {
    f = new Intl.NumberFormat(lang)
    formatos.set(lang, f)
  }
  return f.format(n)
}

/** Traduce `clave` a `lang`. Con `params.n` numérico elige la variante `_one` / `_other`. */
export const tr = (lang: Lang, clave: Clave, params?: Params): string => {
  const cat = catalogos[lang]
  let texto: string | undefined
  if (typeof params?.n === 'number') {
    const categoria = new Intl.PluralRules(lang).select(params.n)
    texto = cat[`${clave}_${categoria}`] ?? cat[`${clave}_other`]
  }
  texto ??= cat[clave] ?? catalogos.en[clave] ?? clave
  if (!params) return texto
  return texto.replace(/\{(\w+)\}/g, (marca, nombre: string) => {
    const v = params[nombre]
    if (v === undefined) return marca
    return typeof v === 'number' ? fmtNum(v, lang) : v
  })
}

/** Traduce al idioma ACTUAL. Los componentes usan `useT()` (en `react.ts`) para re-renderizar. */
export const t = (clave: Clave, params?: Params): string => tr(actual, clave, params)
