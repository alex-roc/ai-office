import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { paths } from './paths.ts'

/**
 * Lo que el usuario ha tecleado, desde ~/.claude/history.jsonl.
 *
 * Es la única fuente que sabe si un slash command se ha ejecutado alguna vez: los comandos
 * no dejan rastro como llamada a herramienta en los transcripts, se expanden a prompt.
 */

export interface HistoryEntry {
  display: string
  timestamp: number
  project: string | null
}

export interface HistoryScan {
  entries: number
  /** Comando (sin la barra) -> veces tecleado y última vez. */
  commandUse: Map<string, { count: number; lastUsedAt: number }>
  /** Vocabulario de todo lo escrito, para el contraste de descriptions. */
  vocab: Set<string>
}

const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9_-]+/)
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w))

export const scanHistory = async (path = `${paths().home}/history.jsonl`): Promise<HistoryScan> => {
  const scan: HistoryScan = { entries: 0, commandUse: new Map(), vocab: new Set() }
  try {
    const rl = createInterface({
      input: createReadStream(path, { encoding: 'utf8' }),
      crlfDelay: Number.POSITIVE_INFINITY,
    })
    for await (const line of rl) {
      if (!line.trim()) continue
      let obj: { display?: unknown; timestamp?: unknown }
      try {
        obj = JSON.parse(line)
      } catch {
        continue
      }
      if (typeof obj.display !== 'string') continue
      scan.entries += 1
      const ts = typeof obj.timestamp === 'number' ? obj.timestamp : 0
      for (const w of tokenize(obj.display)) scan.vocab.add(w)

      // Un comando tecleado abre el prompt: `/nombre` o `/plugin:nombre`, con o sin argumentos.
      // Se excluyen las rutas absolutas pegadas al principio (`/Users/...`), que no son comandos.
      const head = obj.display.trim().split(/\s/)[0] ?? ''
      const m = /^\/([a-z0-9][\w:-]*)$/i.exec(head)
      if (!m?.[1]) continue
      const name = m[1]
      const cur = scan.commandUse.get(name) ?? { count: 0, lastUsedAt: 0 }
      cur.count += 1
      if (ts > cur.lastUsedAt) cur.lastUsedAt = ts
      scan.commandUse.set(name, cur)
    }
  } catch {
    /* sin historial: el producto funciona igual, solo sin esta señal */
  }
  return scan
}
