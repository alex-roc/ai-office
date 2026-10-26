import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { paths } from './paths.ts'

/**
 * Contraste entre el vocabulario de una description y lo que el usuario escribe de verdad.
 *
 * IMPORTANTE — alcance de esta medida. La hipótesis de partida era que la cobertura de
 * vocabulario predice el uso de una skill. Se probó contra el historial real (40 skills,
 * 7.007 prompts) y NO es cierto: la correlación de Spearman con el uso real es 0,21-0,29
 * según la variante, peor que un baseline tonto (la longitud de la description, 0,47).
 * Ver docs/METRICAS.md.
 *
 * Por eso aquí no se expone ningún ratio con pinta de predictor. Lo que sí es un hecho
 * comprobable, y lo único que se muestra al usuario, es la lista de términos de la
 * description que nunca ha escrito: material para reescribirla, no un pronóstico.
 */

const STOPWORDS = new Set([
  'para',
  'como',
  'este',
  'esta',
  'esto',
  'estos',
  'estas',
  'cuando',
  'donde',
  'sobre',
  'desde',
  'hasta',
  'entre',
  'porque',
  'pero',
  'sino',
  'también',
  'tambien',
  'solo',
  'sólo',
  'todo',
  'toda',
  'todos',
  'todas',
  'otro',
  'otra',
  'otros',
  'otras',
  'cada',
  'algún',
  'algun',
  'alguna',
  'usar',
  'usa',
  'usalo',
  'actívalo',
  'activalo',
  'úsalo',
  'uselo',
  'skill',
  'claude',
  'code',
  'with',
  'that',
  'this',
  'from',
  'have',
  'when',
  'where',
  'what',
  'which',
  'your',
  'their',
  'about',
  'into',
  'they',
  'them',
  'then',
  'than',
  'some',
  'more',
  'very',
  'will',
  'would',
  'should',
  'could',
  'been',
  'being',
  'does',
  'done',
  'also',
  'only',
  'just',
  'like',
  'over',
  'after',
  'before',
  'while',
  'these',
  'those',
  'there',
  'here',
  'such',
  'because',
  'however',
])

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9_-]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))

/** Vocabulario de todo lo que el usuario ha tecleado, desde ~/.claude/history.jsonl. */
export const loadUserVocabulary = async (
  path = `${paths().home}/history.jsonl`,
): Promise<{ vocab: Set<string>; prompts: number }> => {
  const vocab = new Set<string>()
  let prompts = 0
  try {
    const rl = createInterface({
      input: createReadStream(path, { encoding: 'utf8' }),
      crlfDelay: Number.POSITIVE_INFINITY,
    })
    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as { display?: unknown }
        if (typeof obj.display !== 'string') continue
        prompts += 1
        for (const w of tokenize(obj.display)) vocab.add(w)
      } catch {
        /* línea corrupta o a medio escribir: se ignora */
      }
    }
  } catch {
    /* sin historial: la cobertura queda indefinida y se dice, no se inventa */
  }
  return { vocab, prompts }
}

export interface VocabularyGap {
  /** Términos de la description que el usuario no ha escrito nunca. */
  missing: string[]
  /** Términos que sí aparecen en su historial. */
  present: string[]
  total: number
}

/**
 * Términos de la description ausentes del historial del usuario.
 * Es un hecho ("nunca has escrito estas palabras"), no una predicción de uso.
 */
export const vocabularyGap = (description: string, vocab: Set<string>): VocabularyGap => {
  const terms = [...new Set(tokenize(description))]
  const present = terms.filter((t) => vocab.has(t))
  const missing = terms.filter((t) => !vocab.has(t))
  return { missing, present, total: terms.length }
}
