import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  watch,
} from 'node:fs'
import { join } from 'node:path'
import { type NormalizedEvent, normalizeHookEvent } from './normalize.ts'

/**
 * El spool es la red de seguridad de `ai-office-hook.mjs`: si el socket está caído, el hook
 * escribe ahí y nosotros lo reproducimos al arrancar (y mientras corremos, por si el daemon
 * arranca después que Claude Code). Se reproduce con `replayed: true` para que la interfaz no
 * anime de golpe cientos de eventos viejos como si acabaran de pasar.
 */

const SPOOL_FILE_RE = /\.ndjson$/
/** Un spool en proceso de lectura: ya no lo escribe el relay. */
const DRAINING_SUFFIX = '.draining'
/** Marca que deja el relay cuando el spool llegó a su tope (ver `ai-office-hook.mjs`). */
const SPOOL_FULL_MARKER = '.lleno'
/** Cada cuánto se revisa el spool aunque `fs.watch` no avise de nada. */
const POLL_MS = 1000
/** Un `.draining` más viejo que esto es de un daemon que murió a medias: se recoge. */
const ORPHAN_AFTER_MS = 60_000

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
    files = readdirSync(spoolDir).sort()
  } catch {
    return // el directorio aún no existe: no hay nada que drenar
  }

  for (const file of files) {
    let full = join(spoolDir, file)
    if (SPOOL_FILE_RE.test(file)) {
      // Se renombra ANTES de leer: el relay sigue añadiendo líneas a `AAAA-MM-DD.ndjson`, y leer y
      // luego borrar perdía las que llegaban entre una cosa y otra. Tras el `rename` el relay
      // crea un archivo nuevo, que recoge el siguiente drenaje.
      const claimed = `${full}${DRAINING_SUFFIX}`
      try {
        renameSync(full, claimed)
      } catch {
        continue // otro drenaje se lo llevó antes
      }
      full = claimed
    } else if (file.endsWith(DRAINING_SUFFIX)) {
      try {
        if (Date.now() - statSync(full).mtimeMs < ORPHAN_AFTER_MS) continue // lo está leyendo otro
      } catch {
        continue
      }
    } else {
      continue
    }
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
  // El spool ya no está lleno: el relay vuelve a poder anotar si algún día se llena otra vez.
  try {
    unlinkSync(join(spoolDir, SPOOL_FULL_MARKER))
  } catch {
    // normalmente no existe
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
  // `fs.watch` no es fiable: en macOS descarta lo que ocurre en los primeros milisegundos tras
  // crearse (un hook que escribe justo al arrancar el daemon) y no avisa nunca de un evento
  // perdido. Un `readdir` cada segundo es barato y garantiza que el spool acaba vaciándose.
  const poll = setInterval(() => drainSpool(spoolDir, onEvent, dedupe), POLL_MS)
  poll.unref()
  return {
    close: () => {
      if (pending) clearTimeout(pending)
      clearInterval(poll)
      watcher.close()
    },
  }
}
