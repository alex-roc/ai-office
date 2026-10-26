import { mkdirSync, readdirSync, readFileSync, unlinkSync, watch } from 'node:fs'
import { join } from 'node:path'
import { type NormalizedEvent, normalizeHookEvent } from './normalize.ts'

/**
 * El spool es la red de seguridad de `ai-office-hook.mjs`: si el socket está caído, el hook
 * escribe ahí y nosotros lo reproducimos al arrancar (y mientras corremos, por si el daemon
 * arranca después que Claude Code). Se reproduce con `replayed: true` para que la interfaz no
 * anime de golpe cientos de eventos viejos como si acabaran de pasar.
 */

const SPOOL_FILE_RE = /\.ndjson$/

/**
 * Detecta duplicados entre lo que ya llegó por el socket y lo que trae el spool: ambos caminos
 * pueden solaparse (un hook puede intentar el socket, fallar por un pelo, y escribir al spool
 * justo cuando el socket ya se había recuperado). LRU acotado: no es un registro para siempre.
 */
export interface DedupeCache {
  /** Registra el evento y devuelve `true` si ya se había visto (duplicado). */
  seen: (key: DedupeKey) => boolean
}

export interface DedupeKey {
  sessionId: string
  type: string
  toolUseId?: string
  ts: number
}

const keyOf = (k: DedupeKey): string => `${k.sessionId}|${k.type}|${k.toolUseId ?? ''}|${k.ts}`

export const createDedupeCache = (limit = 5000): DedupeCache => {
  const seenKeys = new Map<string, true>()
  return {
    seen: (k) => {
      const key = keyOf(k)
      if (seenKeys.has(key)) {
        // Refresca su posición: es lo más reciente visto, no lo primero a expulsar.
        seenKeys.delete(key)
        seenKeys.set(key, true)
        return true
      }
      seenKeys.set(key, true)
      if (seenKeys.size > limit) {
        const oldest = seenKeys.keys().next().value
        if (oldest !== undefined) seenKeys.delete(oldest)
      }
      return false
    },
  }
}

/** Ingiere y borra los `.ndjson` pendientes. Idempotente: si el directorio no existe, no hace nada. */
export const drainSpool = (
  spoolDir: string,
  onEvent: (event: NormalizedEvent) => void,
  dedupe?: DedupeCache,
): void => {
  let files: string[]
  try {
    files = readdirSync(spoolDir)
      .filter((f) => SPOOL_FILE_RE.test(f))
      .sort()
  } catch {
    return // el directorio aún no existe: no hay nada que drenar
  }

  for (const file of files) {
    const full = join(spoolDir, file)
    let text: string
    try {
      text = readFileSync(full, 'utf8')
    } catch {
      continue // pudo borrarse entre el readdir y el read; no es un error nuestro
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let raw: unknown
      try {
        raw = JSON.parse(line)
      } catch {
        continue // línea corrupta (p. ej. una escritura a medias): se descarta, no se rompe el resto
      }
      const event = normalizeHookEvent(raw)
      if (!event) continue
      if (
        dedupe?.seen({
          sessionId: event.sessionId,
          type: event.type,
          toolUseId: event.toolUseId,
          ts: event.ts,
        })
      ) {
        continue
      }
      onEvent({ ...event, replayed: true })
    }
    try {
      unlinkSync(full)
    } catch {
      // si ya no está, mejor: el objetivo era que desapareciera
    }
  }
}

export interface SpoolWatcherHandle {
  close: () => void
}

/**
 * Arranca drenando lo que ya hubiera, y luego vigila el directorio por si el relay sigue
 * escribiendo ahí (socket caído o daemon recién arrancado). El watcher se debe: varias escrituras
 * seguidas del relay no deben disparar una lectura por cada una.
 */
export const watchSpool = (
  spoolDir: string,
  onEvent: (event: NormalizedEvent) => void,
  dedupe?: DedupeCache,
): SpoolWatcherHandle => {
  mkdirSync(spoolDir, { recursive: true })
  drainSpool(spoolDir, onEvent, dedupe)

  let pending: NodeJS.Timeout | null = null
  const scheduleDrain = () => {
    if (pending) return
    pending = setTimeout(() => {
      pending = null
      drainSpool(spoolDir, onEvent, dedupe)
    }, 200)
    pending.unref?.()
  }

  const watcher = watch(spoolDir, { persistent: false }, () => scheduleDrain())
  return {
    close: () => {
      if (pending) clearTimeout(pending)
      watcher.close()
    },
  }
}
