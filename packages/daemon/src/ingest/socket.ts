import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { dirname } from 'node:path'
import { type NormalizedEvent, normalizeHookEvent } from './normalize.ts'
import type { DedupeCache } from './spool.ts'

/**
 * Servidor Unix socket que recibe los eventos de `ai-office-hook.mjs`. Cada conexión trae
 * exactamente una línea NDJSON (el relay conecta, escribe, cierra) así que no hace falta
 * reensamblar mensajes entre conexiones distintas.
 */

// Cota defensiva: el relay ya recorta a bien menos de esto, pero un cliente roto (o futuro) no
// debe poder hacer crecer la memoria del daemon sin límite.
const MAX_LINE_BYTES = 1_000_000

export interface IngestSocketHandle {
  close: () => Promise<void>
}

/** Si el archivo del socket existe pero nadie escucha, es de un daemon anterior que murió mal. */
const clearStaleSocket = (socketPath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!existsSync(socketPath)) return resolve()
    const probe = createConnection(socketPath)
    probe.once('connect', () => {
      probe.destroy()
      reject(new Error(`another process is already listening on ${socketPath}`))
    })
    probe.once('error', () => {
      unlinkSync(socketPath)
      resolve()
    })
  })

const handleConnection = (
  socket: Socket,
  onEvent: (event: NormalizedEvent) => void,
  dedupe?: DedupeCache,
): void => {
  const chunks: Buffer[] = []
  let total = 0
  let overflowed = false

  socket.on('data', (chunk: Buffer) => {
    total += chunk.length
    if (total > MAX_LINE_BYTES) {
      overflowed = true
      socket.destroy()
      return
    }
    chunks.push(chunk)
  })
  socket.on('error', () => {
    // Un cliente que corta la conexión a medias no es un evento que valga la pena registrar.
  })
  socket.on('end', () => {
    if (overflowed) return
    const line = Buffer.concat(chunks).toString('utf8').trim()
    if (!line) return
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      return // línea corrupta: se ignora, no tumba el servidor
    }
    const event = normalizeHookEvent(raw)
    if (!event) return
    dedupe?.seen({
      sessionId: event.sessionId,
      type: event.type,
      toolUseId: event.toolUseId,
      ts: event.ts,
    })
    onEvent(event)
  })
}

/**
 * Arranca el servidor de ingesta. `dedupe`, si se pasa, es el mismo caché que usa `watchSpool`:
 * así un evento que llega primero por el socket no se vuelve a emitir si el relay también alcanzó
 * a dejarlo en el spool.
 */
export const startIngestSocket = (
  socketPath: string,
  onEvent: (event: NormalizedEvent) => void,
  dedupe?: DedupeCache,
): Promise<IngestSocketHandle> =>
  new Promise((resolve, reject) => {
    mkdirSync(dirname(socketPath), { recursive: true })
    clearStaleSocket(socketPath)
      .then(() => {
        const server: Server = createServer((socket) => handleConnection(socket, onEvent, dedupe))
        server.once('error', reject)
        server.listen(socketPath, () => {
          // Solo el usuario dueño del proceso puede hablarle a este socket.
          chmodSync(socketPath, 0o600)
          resolve({
            close: () =>
              new Promise<void>((res) => {
                server.close(() => res())
              }),
          })
        })
      })
      .catch(reject)
  })
