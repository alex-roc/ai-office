import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Catalog, Lang } from '@ai-office/core'
import {
  applyCreateFile,
  applyWriteCommand,
  compileFlow,
  etagOf,
  type Flow,
  flowFileName,
  importFlow,
  OfficeError,
  paths,
  planWriteCommand,
} from '@ai-office/providers'

/**
 * Los flujos son la otra mitad del editor de grafo: además de "quién puede usar qué" (aristas
 * estáticas), aquí se edita "quién llama a quién y en qué orden", y el resultado es un slash
 * command de verdad, ejecutable y legible a mano.
 */

export interface FlowResponse {
  flow: Flow
  markdown: string
  path: string
  etag: string
  /** Falso cuando el comando todavía no existe en disco. */
  exists: boolean
}

const commandPath = (name: string): string => join(paths().commands, `${name}.md`)

const readEtag = async (path: string): Promise<{ text: string; etag: string; exists: boolean }> => {
  try {
    const [text, st] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    return { text, etag: etagOf(text, st.mtimeMs, st.size), exists: true }
  } catch {
    return { text: '', etag: '', exists: false }
  }
}

interface FlowTarget {
  /** Nombre con el que se audita y se respalda. */
  name: string
  path: string
  /** Raíces extra que la escritura necesita autorizar (el destino real de un symlink). */
  opts: { extraAllowedRoots: string[] }
}

/**
 * Dónde se guarda un flujo. Si viene de un comando que ya existe se escribe SOBRE ese archivo
 * (`source.realPath`): recompilar el nombre no vale, porque `commands/ns/x.md` se llama `ns:x` y
 * un comando que es symlink no debe reemplazarse por un archivo suelto. Solo un flujo nuevo
 * construye la ruta a partir de su nombre.
 */
const targetOf = (flow: Flow, catalog?: Catalog): FlowTarget => {
  const existing =
    catalog?.commands.find((c) => c.name === flow.name) ??
    catalog?.commands.find((c) => c.name === flowFileName(flow).replace(/\.md$/, ''))
  if (existing) {
    return {
      name: existing.name,
      path: existing.source.realPath,
      opts: { extraAllowedRoots: existing.source.symlink ? [existing.source.realPath] : [] },
    }
  }
  const name = flowFileName(flow).replace(/\.md$/, '')
  return { name, path: commandPath(name), opts: { extraAllowedRoots: [] } }
}

/** Abre un comando existente en el lienzo, recuperando sus pasos. */
export const openFlow = async (
  catalog: Catalog,
  commandId: string,
  lang: Lang = 'en',
): Promise<FlowResponse> => {
  const command = catalog.commands.find((c) => c.id === commandId)
  if (!command) {
    throw new OfficeError('command-not-found', `command ${commandId} does not exist`, {
      kind: 'not-found',
      params: { id: commandId },
    })
  }
  const flow = importFlow(command, catalog.agents, catalog.skills, lang)
  const path = command.source.realPath
  const { etag, exists } = await readEtag(path)
  return { flow, markdown: compileFlow(flow, lang), path, etag, exists }
}

/** Vista previa: qué Markdown saldría de este lienzo, sin tocar nada. */
export const previewFlow = async (
  flow: Flow,
  catalog?: Catalog,
  lang: Lang = 'en',
): Promise<FlowResponse> => {
  const { path } = targetOf(flow, catalog)
  const { etag, exists } = await readEtag(path)
  return { flow, markdown: compileFlow(flow, lang), path, etag, exists }
}

export const planFlow = async (flow: Flow, catalog?: Catalog, lang: Lang = 'en') => {
  const { path } = targetOf(flow, catalog)
  const { text, etag } = await readEtag(path)
  const plan = planWriteCommand(path, text, compileFlow(flow, lang))
  const { before: _b, after: _a, ...rest } = plan
  return { ...rest, etag }
}

export const saveFlow = async (flow: Flow, etag: string, catalog?: Catalog, lang: Lang = 'en') => {
  const { name, path, opts } = targetOf(flow, catalog)
  const markdown = compileFlow(flow, lang)
  const { exists } = await readEtag(path)
  // Un comando nuevo no tiene etag que comparar: se crea, y la creación falla si alguien lo
  // creó mientras tanto, que es la misma protección por otro camino.
  if (exists) return applyWriteCommand(name, path, markdown, etag, opts)
  // Una instalación sin comandos propios no tiene `commands/`, y crear exige que la carpeta
  // exista. Solo se crea la carpeta de comandos de Claude Code, nunca otra.
  if (dirname(path) === paths().commands) await mkdir(paths().commands, { recursive: true })
  return applyCreateFile('command', name, path, markdown)
}
