import { createHash } from 'node:crypto'

/**
 * Identidad del contenido para control de concurrencia optimista.
 *
 * Vive aparte de `frontmatter.ts` a propósito: es lo único de ese módulo que necesita Node, y
 * sin ello el parseo de frontmatter (y con él el compilador de flujos) también corre en el
 * navegador, que es donde lo usa la demo estática de la página del proyecto.
 */
export const etagOf = (text: string, mtimeMs: number, size: number): string =>
  `${createHash('sha256').update(text).digest('hex').slice(0, 16)}:${Math.trunc(mtimeMs)}:${size}`
