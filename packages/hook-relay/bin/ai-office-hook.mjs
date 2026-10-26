#!/usr/bin/env node
// Proceso que Claude Code lanza en CADA hook: decenas de veces por turno del usuario.
//
// Reglas de oro, en este orden de importancia:
//   1. Nunca escribe a stdout ni stderr: un hook que imprime contamina el contexto de Claude.
//   2. Nunca sale con código distinto de 0: un hook que falla ensucia la UI del usuario.
//   3. Nunca se queda colgado: hay timeouts en cada punto que puede bloquear.
// Por eso es JavaScript plano sin dependencias de terceros ni del monorepo: cero riesgo de que
// una versión de una librería, o de nuestro propio código, le rompa la sesión a alguien.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Los "warnings" de Node (deprecaciones, etc.) van a stderr por defecto: los apagamos.
process.on('warning', () => {})

const HOME = homedir()
// Mismo orden que `claudeHome()` de packages/providers (este archivo no puede importarlo: es
// autónomo a propósito): CLAUDE_HOME (la nuestra, para pruebas) > CLAUDE_CONFIG_DIR (la oficial
// de Claude Code) > ~/.claude. Si el daemon mira un directorio y el relay escribe en otro, los
// eventos no llegan nunca y no hay ningún error que lo diga.
const CLAUDE_DIR = process.env.CLAUDE_HOME || process.env.CLAUDE_CONFIG_DIR || join(HOME, '.claude')
const OURS_DIR = join(CLAUDE_DIR, 'ai-office')
const SOCKET_PATH = join(OURS_DIR, 'run', 'ingest.sock')
const SPOOL_DIR = join(OURS_DIR, 'spool')
const LOG_PATH = join(OURS_DIR, 'logs', 'hook-relay.log')

const STDIN_LIMIT_BYTES = 256 * 1024
// Ajustable solo para pruebas: con la máquina saturada 40 ms no bastan y el evento cae al spool.
const SOCKET_TIMEOUT_MS = Number(process.env.AI_OFFICE_SOCKET_TIMEOUT_MS) || 40
// Cinturón de seguridad: si algo se cuelga (stdin que nunca cierra, etc.) igual salimos con 0
// antes de que Claude Code note que el hook no responde.
const WATCHDOG_MS = 2000
const LOG_MAX_BYTES = 1024 * 1024
// Tope del spool: si el daemon lleva días apagado el relay no puede llenar el disco. Al llegar se
// descarta lo NUEVO (lo viejo ya está a salvo) y se anota una vez.
const SPOOL_MAX_BYTES = 5 * 1024 * 1024
const SPOOL_FULL_MARKER = '.lleno'

// Registrar actividad es opcional: userConfig `telemetry` del plugin. Claude Code lo expone a los
// hooks como CLAUDE_PLUGIN_OPTION_TELEMETRY; AI_OFFICE_TELEMETRY=0 sirve fuera del plugin.
const isOff = (value) =>
  value !== undefined && ['0', 'false', 'no', 'off'].includes(String(value).trim().toLowerCase())
const TELEMETRY_OFF =
  isOff(process.env.AI_OFFICE_TELEMETRY) || isOff(process.env.CLAUDE_PLUGIN_OPTION_TELEMETRY)
const PREVIEW_CHARS = 1024
const SHORT_FIELD_CHARS = 200

// Salida garantizada: pase lo que pase, código 0 y nada por stdout/stderr.
const finish = () => process.exit(0)

/** Log propio, nunca a stderr. Trunca si crece demasiado: no es un archivo para auditar a fondo. */
const logError = (context, err) => {
  try {
    mkdirSync(join(OURS_DIR, 'logs'), { recursive: true })
    if (existsSync(LOG_PATH) && statSync(LOG_PATH).size > LOG_MAX_BYTES) {
      renameSync(LOG_PATH, `${LOG_PATH}.old`)
    }
    const line = `${new Date().toISOString()} ${context}: ${err?.stack ? err.stack : String(err)}\n`
    appendFileSync(LOG_PATH, line)
  } catch {
    // Si ni el log funciona, no hay nada más que hacer: seguimos hacia la salida.
  }
}

// Cualquier excepción no atrapada (o promesa rechazada) es una salida limpia, no un crash visible.
process.on('uncaughtException', (err) => {
  logError('uncaughtException', err)
  finish()
})
process.on('unhandledRejection', (err) => {
  logError('unhandledRejection', err)
  finish()
})

const watchdog = setTimeout(() => {
  logError('watchdog', new Error('el hook no terminó a tiempo'))
  finish()
}, WATCHDOG_MS)
watchdog.unref?.()

/** YYYY-MM-DD en hora local: es el mismo día que ve el usuario en su terminal. */
const spoolFileName = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}.ndjson`
}

/** Bytes que ocupan los `.ndjson` pendientes del spool. */
const spoolBytes = () => {
  let total = 0
  for (const f of readdirSync(SPOOL_DIR)) {
    if (!f.endsWith('.ndjson')) continue
    try {
      total += statSync(join(SPOOL_DIR, f)).size
    } catch {
      // se drenó entre el listado y el stat: no cuenta
    }
  }
  return total
}

const toSpool = (line) => {
  try {
    mkdirSync(SPOOL_DIR, { recursive: true })
    if (spoolBytes() + Buffer.byteLength(line) > SPOOL_MAX_BYTES) {
      const marker = join(SPOOL_DIR, SPOOL_FULL_MARKER)
      if (!existsSync(marker)) {
        writeFileSync(marker, `${new Date().toISOString()}\n`)
        logError('spool', new Error('spool lleno (5 MB): se descartan los eventos nuevos'))
      }
      return finish()
    }
    appendFileSync(join(SPOOL_DIR, spoolFileName(new Date())), line)
  } catch (err) {
    logError('spool', err)
  }
  finish()
}

/** Representación corta de un valor grande, para no llevar el payload completo al daemon. */
const previewOf = (value) => {
  let str
  try {
    str = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    str = ''
  }
  str = str ?? ''
  return { preview: str.slice(0, PREVIEW_CHARS), bytes: Buffer.byteLength(str, 'utf8') }
}

// Herramientas cuyo `tool_input` es CONTENIDO del usuario (el texto que escribe un archivo, el
// comando de shell, que puede llevar un token). Del relay no sale nada de eso: ni a la
// interfaz ni al spool, que es un archivo que queda en disco días. Solo nombres y tamaños.
const CONTENT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'])

/**
 * Recorta `tool_input`: solo se queda con {preview, bytes} más un puñado de campos que son
 * pequeños y semánticos (identifican QUÉ pasó, no con qué datos), y que el daemon necesita enteros
 * para clasificar el evento (p. ej. distinguir una invocación de skill de una llamada normal).
 * Con las herramientas de contenido solo {bytes} y, si lo hay, el nombre del archivo.
 */
const reduceToolInput = (toolName, toolInput) => {
  if (toolInput === undefined || toolInput === null || typeof toolInput !== 'object')
    return undefined
  if (CONTENT_TOOLS.has(toolName)) {
    const out = { bytes: previewOf(toolInput).bytes }
    if (typeof toolInput.file_path === 'string')
      out.file_path = toolInput.file_path.slice(0, SHORT_FIELD_CHARS)
    return out
  }
  const out = previewOf(toolInput)
  if (typeof toolInput.skill === 'string') out.skill = toolInput.skill
  if (typeof toolInput.subagent_type === 'string') out.subagent_type = toolInput.subagent_type
  if (typeof toolInput.description === 'string') out.description = toolInput.description
  if (typeof toolInput.command === 'string')
    out.command = toolInput.command.slice(0, SHORT_FIELD_CHARS)
  if (typeof toolInput.file_path === 'string')
    out.file_path = toolInput.file_path.slice(0, SHORT_FIELD_CHARS)
  return out
}

const reduceToolOutput = (toolName, toolOutput) => {
  if (toolOutput === undefined || toolOutput === null) return undefined
  const out = previewOf(toolOutput)
  // La salida de un comando o de una edición es contenido: solo cuánto pesó.
  if (CONTENT_TOOLS.has(toolName)) return { bytes: out.bytes }
  return out
}

/** Solo estos campos viajan enteros: son pequeños y son exactamente lo que normaliza el daemon. */
const passthroughKeys = [
  'hook_event_name',
  'session_id',
  'transcript_path',
  'cwd',
  'tool_name',
  'tool_use_id',
  'agent_id',
  'agent_type',
  'permission_mode',
]

const buildPayload = (raw) => {
  const out = { ts: Date.now() }
  const isObject = raw !== null && typeof raw === 'object'
  for (const key of passthroughKeys) {
    if (isObject && Object.hasOwn(raw, key)) out[key] = raw[key]
  }
  const toolInput = reduceToolInput(raw?.tool_name, raw?.tool_input)
  if (toolInput !== undefined) out.tool_input = toolInput
  const toolOutput = reduceToolOutput(raw?.tool_name, raw?.tool_output)
  if (toolOutput !== undefined) out.tool_output = toolOutput
  return out
}

const sendOverSocket = (line) => {
  let done = false
  const finishOnce = (ok) => {
    if (done) return
    done = true
    if (!ok) return toSpool(line)
    finish()
  }

  let socket
  try {
    socket = createConnection(SOCKET_PATH)
  } catch (err) {
    logError('connect', err)
    return finishOnce(false)
  }
  socket.setTimeout(SOCKET_TIMEOUT_MS)
  socket.on('timeout', () => {
    socket.destroy()
    finishOnce(false)
  })
  socket.on('error', () => {
    // Típico: el daemon no está corriendo (ENOENT/ECONNREFUSED). No es un error que valga la
    // pena loguear en cada hook: el spool es justo el mecanismo previsto para esto.
    finishOnce(false)
  })
  socket.on('connect', () => {
    socket.write(line, () => {
      socket.end()
      finishOnce(true)
    })
  })
}

const main = () => {
  // Sin telemetría no se lee ni se escribe nada: ni socket ni spool.
  if (TELEMETRY_OFF) return finish()
  const chunks = []
  let total = 0
  process.stdin.on('data', (chunk) => {
    if (total >= STDIN_LIMIT_BYTES) return // ya truncamos: seguimos drenando sin acumular más
    const remaining = STDIN_LIMIT_BYTES - total
    const piece = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
    chunks.push(piece)
    total += piece.length
  })
  process.stdin.on('error', () => finish())
  process.stdin.on('end', () => {
    let raw
    try {
      const text = Buffer.concat(chunks).toString('utf8')
      raw = text.trim().length > 0 ? JSON.parse(text) : {}
    } catch (err) {
      logError('parse', err)
      return finish() // no hay nada útil que reenviar
    }
    let line
    try {
      line = `${JSON.stringify(buildPayload(raw))}\n`
    } catch (err) {
      logError('build', err)
      return finish()
    }
    sendOverSocket(line)
  })
  // Si no hay stdin en absoluto (raro, pero posible en pruebas manuales), forzamos el arranque
  // del flujo de lectura.
  process.stdin.resume()
}

main()
