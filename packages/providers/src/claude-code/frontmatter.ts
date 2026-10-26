import type { EntityProblem } from '@ai-office/core'
import { parseDocument } from 'yaml'
import { OfficeError } from './errors.ts'

/**
 * Lectura y escritura de archivos Markdown con frontmatter YAML, preservando el original.
 *
 * Estos archivos los edita el usuario a mano: comentarios, orden de claves y estilo de
 * comillas son suyos y no se tocan. Por eso se usa `parseDocument` (que conserva el árbol
 * de sintaxis) y no una reserialización ingenua, y por eso el cuerpo se guarda como bytes.
 */

export interface ParsedDoc {
  /** Frontmatter como objeto plano, para leer. */
  data: Record<string, unknown>
  /** Texto del cuerpo, sin el frontmatter ni sus delimitadores. */
  body: string
  /** Texto YAML crudo del frontmatter. */
  rawFrontmatter: string
  /** Offset en el texto donde empieza el cuerpo. */
  bodyOffset: number
  /** Línea 1-indexada donde empieza el cuerpo, para poder citar evidencia. */
  bodyStartLine: number
  hasFrontmatter: boolean
  problems: EntityProblem[]
}

const DELIM = /^---[ \t]*\r?\n/

export const parseMarkdownDoc = (text: string): ParsedDoc => {
  const problems: EntityProblem[] = []
  if (!DELIM.test(text)) {
    return {
      data: {},
      body: text,
      rawFrontmatter: '',
      bodyOffset: 0,
      bodyStartLine: 1,
      hasFrontmatter: false,
      problems: [{ code: 'no-frontmatter', message: 'no frontmatter' }],
    }
  }
  const openLen = text.match(DELIM)![0].length
  // El cierre es la primera línea que sea exactamente `---` tras la apertura.
  const closeRe = /^---[ \t]*(\r?\n|$)/m
  const rest = text.slice(openLen)
  const closeMatch = closeRe.exec(rest)
  if (!closeMatch) {
    return {
      data: {},
      body: text,
      rawFrontmatter: '',
      bodyOffset: 0,
      bodyStartLine: 1,
      hasFrontmatter: false,
      problems: [{ code: 'unclosed-frontmatter', message: 'unclosed frontmatter' }],
    }
  }
  const rawFrontmatter = rest.slice(0, closeMatch.index)
  const bodyOffset = openLen + closeMatch.index + closeMatch[0].length
  const body = text.slice(bodyOffset)

  let data: Record<string, unknown> = {}
  try {
    const doc = parseDocument(rawFrontmatter)
    if (doc.errors.length > 0) {
      const detail = doc.errors[0]?.message ?? 'error'
      problems.push({ code: 'yaml-error', message: `YAML: ${detail}`, params: { detail } })
    }
    const json = doc.toJS()
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      data = json as Record<string, unknown>
    } else if (json !== null) {
      problems.push({ code: 'frontmatter-not-object', message: 'the frontmatter is not an object' })
    }
  } catch (err) {
    const detail = (err as Error).message
    problems.push({
      code: 'yaml-unreadable',
      message: `unreadable YAML: ${detail}`,
      params: { detail },
    })
  }

  const bodyStartLine = text.slice(0, bodyOffset).split('\n').length

  return { data, body, rawFrontmatter, bodyOffset, bodyStartLine, hasFrontmatter: true, problems }
}

/**
 * Reescribe claves del frontmatter conservando todo lo demás byte a byte.
 * Un valor `undefined` borra la clave. El cuerpo nunca se toca.
 */
export const setFrontmatterFields = (
  text: string,
  changes: Record<string, unknown>,
): { text: string; changed: boolean } => {
  const parsed = parseMarkdownDoc(text)
  if (!parsed.hasFrontmatter)
    throw new OfficeError('no-frontmatter', 'cannot edit: the file has no frontmatter')

  const doc = parseDocument(parsed.rawFrontmatter)
  let changed = false
  for (const [key, value] of Object.entries(changes)) {
    const current = doc.get(key)
    const same = JSON.stringify(current ?? null) === JSON.stringify(value ?? null)
    if (same) continue
    if (value === undefined) doc.delete(key)
    else doc.set(key, value)
    changed = true
  }
  if (!changed) return { text, changed: false }

  // lineWidth 0: sin plegado automático. Las descriptions son párrafos largos y plegarlas
  // las volvería ilegibles en un diff de git.
  const yamlOut = doc.toString({ lineWidth: 0 })
  const head = text.slice(0, text.match(DELIM)![0].length)
  const out = `${head}${yamlOut}---\n${parsed.body}`
  return { text: out, changed: true }
}

/** Estimación de tokens suficientemente buena para un presupuesto de contexto (~4 chars/token). */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4)
