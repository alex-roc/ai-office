import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import type { OurConfig, ShowConfig } from '@ai-office/core'
import { OfficeError } from './errors.ts'
import { appendAudit, sha256, writeAtomic } from './mutations.ts'
import { paths } from './paths.ts'
import { isRecord } from './settings.ts'

/**
 * La configuración propia de ai-office: `~/.claude/ai-office/config.json`. Es el ÚNICO archivo que
 * escribe sin pasar por el motor de mutaciones de Claude Code (no es de Claude Code, no hay etag que
 * proteger ni nada que deshacer), pero deja auditoría igual y valida con rigor: un valor raro aquí
 * decidiría qué directorio se escanea y dónde se permite escribir.
 */

export const ourConfigPath = (): string => join(paths().ours, 'config.json')

export const SHOW_KEYS: readonly (keyof ShowConfig)[] = [
  'agents',
  'skills',
  'commands',
  'plugins',
  'mcp',
]
const KEYS = ['scope', 'project', 'show', 'lang'] as const

const invalid = (key: string, message: string): OfficeError =>
  new OfficeError('invalid-config', message, { params: { key } })

/** Validación ESTRICTA: una clave desconocida o un valor de otro tipo es un error, no se ignora. */
export const parseOurConfig = (raw: unknown): OurConfig => {
  if (!isRecord(raw)) throw invalid('', 'the configuration must be a JSON object')
  for (const key of Object.keys(raw)) {
    if (!(KEYS as readonly string[]).includes(key)) {
      throw invalid(key, `unknown configuration key: "${key}"`)
    }
  }
  const out: OurConfig = {}
  if (raw.scope !== undefined) {
    if (raw.scope !== 'user' && raw.scope !== 'project') {
      throw invalid('scope', 'scope must be "user" or "project"')
    }
    out.scope = raw.scope
  }
  if (raw.project !== undefined) {
    if (
      typeof raw.project !== 'string' ||
      !isAbsolute(raw.project) ||
      raw.project.includes('\0') ||
      raw.project.length > 4096
    ) {
      throw invalid('project', 'project must be an absolute path')
    }
    out.project = raw.project
  }
  if (raw.show !== undefined) {
    if (!isRecord(raw.show)) throw invalid('show', 'show must be an object')
    const show: Partial<ShowConfig> = {}
    for (const [k, v] of Object.entries(raw.show)) {
      if (!(SHOW_KEYS as readonly string[]).includes(k)) {
        throw invalid(`show.${k}`, `unknown show key: "${k}"`)
      }
      if (typeof v !== 'boolean') throw invalid(`show.${k}`, `show.${k} must be true or false`)
      show[k as keyof ShowConfig] = v
    }
    out.show = show
  }
  if (raw.lang !== undefined) {
    if (raw.lang !== 'en' && raw.lang !== 'es') throw invalid('lang', 'lang must be "en" or "es"')
    out.lang = raw.lang
  }
  return out
}

/**
 * Aplica un parche a la configuración: una clave presente se sustituye, `null` la quita, y `show`
 * se combina clave a clave (para poder cambiar solo `show.mcp`). El resultado se vuelve a validar.
 */
export const applyConfigPatch = (current: OurConfig, patch: unknown): OurConfig => {
  if (!isRecord(patch)) throw invalid('', 'the configuration must be a JSON object')
  const merged: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (!(KEYS as readonly string[]).includes(key)) {
      throw invalid(key, `unknown configuration key: "${key}"`)
    }
    if (value === null) delete merged[key]
    else if (key === 'show' && isRecord(value) && isRecord(merged.show)) {
      merged.show = { ...merged.show, ...value }
    } else merged[key] = value
  }
  return parseOurConfig(merged)
}

export interface OurConfigRead {
  config: OurConfig
  /** El archivo existe pero no es válido: se trabaja sin él y la interfaz puede avisar. */
  error?: string
}

/** Defensivo: un archivo ausente o roto es "sin configuración", nunca un fallo de arranque. */
export const readOurConfig = async (): Promise<OurConfigRead> => {
  let text: string
  try {
    text = await readFile(ourConfigPath(), 'utf8')
  } catch {
    return { config: {} }
  }
  try {
    return { config: parseOurConfig(JSON.parse(text)) }
  } catch (err) {
    return { config: {}, error: (err as Error).message }
  }
}

const render = (config: OurConfig): string => `${JSON.stringify(config, null, 2)}\n`

/** Escribe la configuración (atómica) y lo deja en la auditoría. `changed` es `false` si ya era así. */
export const writeOurConfig = async (
  config: OurConfig,
): Promise<{ path: string; changed: boolean }> => {
  const path = ourConfigPath()
  const before = await readFile(path, 'utf8').catch(() => '')
  const after = render(parseOurConfig(config))
  if (before === after) return { path, changed: false }
  await mkdir(dirname(path), { recursive: true })
  const mode = await stat(path).then(
    (st) => st.mode & 0o777,
    () => 0o644,
  )
  await writeAtomic(path, after, mode)
  await appendAudit({
    ts: Date.now(),
    action: 'config.set',
    entityId: 'config:ai-office',
    path,
    shaBefore: before ? sha256(before) : '',
    shaAfter: sha256(after),
    bytesDelta: Buffer.byteLength(after, 'utf8') - Buffer.byteLength(before, 'utf8'),
  })
  return { path, changed: true }
}
