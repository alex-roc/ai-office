import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Catalog } from '@ai-office/core'
import {
  applyCreateFile,
  applyWriteCommand,
  compileFlow,
  etagOf,
  type Flow,
  flowFileName,
  importFlow,
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

/** Abre un comando existente en el lienzo, recuperando sus pasos. */
export const openFlow = async (catalog: Catalog, commandId: string): Promise<FlowResponse> => {
  const command = catalog.commands.find((c) => c.id === commandId)
  if (!command) throw new Error(`no existe el comando ${commandId}`)
  const flow = importFlow(command, catalog.agents, catalog.skills)
  const path = command.source.realPath
  const { etag, exists } = await readEtag(path)
  return { flow, markdown: compileFlow(flow), path, etag, exists }
}

/** Vista previa: qué Markdown saldría de este lienzo, sin tocar nada. */
export const previewFlow = async (flow: Flow): Promise<FlowResponse> => {
  const path = commandPath(flowFileName(flow).replace(/\.md$/, ''))
  const { etag, exists } = await readEtag(path)
  return { flow, markdown: compileFlow(flow), path, etag, exists }
}

export const planFlow = async (flow: Flow) => {
  const path = commandPath(flowFileName(flow).replace(/\.md$/, ''))
  const { text, etag } = await readEtag(path)
  const plan = planWriteCommand(path, text, compileFlow(flow))
  const { before: _b, after: _a, ...rest } = plan
  return { ...rest, etag }
}

export const saveFlow = async (flow: Flow, etag: string) => {
  const name = flowFileName(flow).replace(/\.md$/, '')
  const path = commandPath(name)
  const markdown = compileFlow(flow)
  const { exists } = await readEtag(path)
  // Un comando nuevo no tiene etag que comparar: se crea, y la creación falla si alguien lo
  // creó mientras tanto, que es la misma protección por otro camino.
  return exists
    ? applyWriteCommand(name, path, markdown, etag)
    : applyCreateFile('command', name, path, markdown)
}
