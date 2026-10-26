import { OfficeError } from './errors.ts'

/**
 * Gestión de "secciones" delimitadas dentro del cuerpo de un Markdown.
 *
 * ai-office necesita escribir cosas en el cuerpo de un `.md` (por ejemplo, la lista de skills
 * mencionadas que crea el editor de grafo) sin pisar jamás la prosa que el usuario escribió a
 * mano. La solución es un bloque acotado por comentarios HTML, invisibles al renderizar el
 * Markdown, que solo nosotros tocamos:
 *
 *   <!-- ai-office:skills:inicio -->
 *   ...contenido gestionado...
 *   <!-- ai-office:skills:fin -->
 *
 * Todo lo que quede fuera de esos marcadores es intocable. Buscamos los marcadores con
 * `indexOf` (nunca con una regex construida a partir del nombre o del contenido) para que
 * caracteres especiales de regex en el contenido de la sección no puedan romper nada.
 */

const markersOf = (name: string): { start: string; end: string } => ({
  start: `<!-- ai-office:${name}:inicio -->`,
  end: `<!-- ai-office:${name}:fin -->`,
})

/** Contenido de la sección `name`, o `null` si no existe o está mal formada (sin cierre). */
export const readSection = (body: string, name: string): string | null => {
  const { start, end } = markersOf(name)
  const startIdx = body.indexOf(start)
  if (startIdx === -1) return null
  const contentStart = startIdx + start.length
  const endIdx = body.indexOf(end, contentStart)
  if (endIdx === -1) return null
  let inner = body.slice(contentStart, endIdx)
  // El bloque siempre envuelve el contenido en un salto de línea a cada lado; se retiran
  // exactamente esos, nunca más, para no comerse líneas en blanco que el propio contenido tenga.
  if (inner.startsWith('\n')) inner = inner.slice(1)
  if (inner.endsWith('\n')) inner = inner.slice(0, -1)
  return inner
}

/**
 * Sustituye la sección en su sitio si ya existe, o la añade al final con una línea en blanco
 * de separación si no existe. Escribir el mismo contenido dos veces es un no-op textual
 * (idempotente): el resultado es idéntico byte a byte.
 */
export const upsertSection = (body: string, name: string, content: string): string => {
  const { start, end } = markersOf(name)
  const block = `${start}\n${content}\n${end}`

  const startIdx = body.indexOf(start)
  if (startIdx !== -1) {
    const endIdx = body.indexOf(end, startIdx + start.length)
    if (endIdx === -1)
      throw new OfficeError(
        'section-unclosed',
        `section "${name}": start marker found but no end marker`,
        { params: { section: name } },
      )
    return body.slice(0, startIdx) + block + body.slice(endIdx + end.length)
  }

  if (body.length === 0) return `${block}\n`
  // Se recorta el final del cuerpo antes de añadir el separador canónico (una línea en blanco):
  // así, sin importar cuántos saltos de línea sueltos hubiera al final, el resultado es
  // determinista y `removeSection` puede deshacerlo exactamente.
  const trimmed = body.replace(/\n+$/, '')
  const sep = trimmed.length === 0 ? '' : '\n\n'
  return `${trimmed}${sep}${block}\n`
}

/**
 * Quita la sección (marcadores incluidos) y el separador que la rodeaba, sin dejar líneas en
 * blanco de más. Si la sección no existe, devuelve el cuerpo tal cual.
 */
export const removeSection = (body: string, name: string): string => {
  const { start, end } = markersOf(name)
  const startIdx = body.indexOf(start)
  if (startIdx === -1) return body
  const endIdx = body.indexOf(end, startIdx + start.length)
  if (endIdx === -1) {
    throw new OfficeError(
      'section-unclosed',
      `section "${name}": start marker found but no end marker`,
      { params: { section: name } },
    )
  }

  const head = body.slice(0, startIdx).replace(/\n+$/, '')
  const tail = body.slice(endIdx + end.length).replace(/^\n+/, '')

  if (head === '' && tail === '') return ''
  if (head === '') return tail
  if (tail === '') return `${head}\n`
  return `${head}\n\n${tail}`
}
