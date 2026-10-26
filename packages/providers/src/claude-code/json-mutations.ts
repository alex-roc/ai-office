import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { OfficeError } from './errors.ts'
import { etagOf } from './etag.ts'
import { stringifySettings } from './install.ts'
import {
  type ApplyResult,
  appendAudit,
  assertWithinRoots,
  buildUnifiedDiff,
  ConflictError,
  type MutationOptions,
  type MutationPlan,
  type PlanWarning,
  readWithEtag,
  realWhereverItEnds,
  sha256,
  writeAtomic,
  writeBackup,
} from './mutations.ts'
import { isRecord } from './settings.ts'

/**
 * Mutaciones sobre archivos JSON de Claude Code: activar un plugin (`enabledPlugins` de un
 * settings) y desactivar un servidor MCP (`disabledMcpjsonServers` de un settings, o
 * `disabledMcpServers` de un proyecto en `~/.claude.json`). Mismo patrón que el resto —`plan*`
 * puro con diff, `apply*` con etag, backup, escritura atómica al realPath y auditoría— con dos
 * diferencias: el archivo puede NO existir todavía (un settings de proyecto sin crear) y se
 * escribe JSON, así que solo se toca la clave que se pide.
 */

/** Etag de un archivo que todavía no existe: crear exige que siga sin existir. */
export const ABSENT_ETAG = 'absent'

/** El archivo, o `null` si no existe. El etag de lo que no existe es `ABSENT_ETAG`. */
export const readJsonTarget = async (
  path: string,
): Promise<{ path: string; text: string | null; etag: string }> => {
  const real = await realWhereverItEnds(path)
  try {
    const { text, etag } = await readWithEtag(real)
    return { path: real, text, etag }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    return { path: real, text: null, etag: ABSENT_ETAG }
  }
}

type Compute = (before: string | null) => {
  after: string
  changed: boolean
  warnings: PlanWarning[]
}

const parseObject = (text: string, path: string): Record<string, unknown> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new OfficeError(
      'unreadable-json',
      `${path} is not valid JSON: ${(err as Error).message}`,
      {
        params: { path },
      },
    )
  }
  if (!isRecord(parsed)) {
    throw new OfficeError('unexpected-format', `${path} is not a JSON object`, { params: { path } })
  }
  return parsed
}

const planOf = (path: string, before: string | null, compute: Compute): MutationPlan => {
  const { after, changed, warnings } = compute(before)
  const was = before ?? ''
  return {
    path,
    before: was,
    after,
    diff: changed ? buildUnifiedDiff(path, was, after) : '',
    changed,
    warnings: warnings.map((w) => w.message),
    warningDetails: warnings,
  }
}

/** Claude Code solo relee los plugins al recargar: el cambio no se ve en una sesión ya abierta. */
const RELOAD_NEEDED: PlanWarning = {
  code: 'reload-needed',
  message: 'run /reload-plugins in your open sessions (or start a new one) to pick up the change',
}

// ---------------------------------------------------------------------------------------------
// plugin.enable / plugin.disable: `enabledPlugins["nombre@marketplace"]` de un settings
// ---------------------------------------------------------------------------------------------

const computeSetPluginEnabled =
  (path: string, key: string, enabled: boolean): Compute =>
  (before) => {
    const text = before ?? '{}\n'
    const doc = parseObject(text, path)
    const section = doc.enabledPlugins
    if (section !== undefined && !isRecord(section)) {
      throw new OfficeError('unexpected-format', `enabledPlugins in ${path} is not an object`, {
        params: { path },
      })
    }
    if (section?.[key] === enabled) return { after: text, changed: false, warnings: [] }
    // Se escribe `false` en vez de borrar la clave: así se impone a un `true` de un ajuste inferior.
    doc.enabledPlugins = { ...section, [key]: enabled }
    return { after: stringifySettings(doc, text), changed: true, warnings: [RELOAD_NEEDED] }
  }

export const planSetPluginEnabled = (
  path: string,
  before: string | null,
  key: string,
  enabled: boolean,
): MutationPlan => planOf(path, before, computeSetPluginEnabled(path, key, enabled))

// ---------------------------------------------------------------------------------------------
// mcp.disable / mcp.enable
// ---------------------------------------------------------------------------------------------

/** Añade o quita `name` de una lista de cadenas, que debe ser un array de texto si existe. */
const toggleInList = (
  list: unknown,
  name: string,
  disabled: boolean,
  path: string,
  field: string,
): { next: string[]; changed: boolean } => {
  if (list !== undefined && (!Array.isArray(list) || list.some((x) => typeof x !== 'string'))) {
    throw new OfficeError('unexpected-format', `${field} in ${path} is not a list of names`, {
      params: { path },
    })
  }
  const current = (list ?? []) as string[]
  if (disabled)
    return current.includes(name)
      ? { next: current, changed: false }
      : { next: [...current, name], changed: true }
  return current.includes(name)
    ? { next: current.filter((x) => x !== name), changed: true }
    : { next: current, changed: false }
}

/** `disabledMcpjsonServers` de un settings (servidores de `.mcp.json`). */
const computeSetMcpjsonDisabled =
  (path: string, name: string, disabled: boolean): Compute =>
  (before) => {
    const text = before ?? '{}\n'
    const doc = parseObject(text, path)
    const { next, changed } = toggleInList(
      doc.disabledMcpjsonServers,
      name,
      disabled,
      path,
      'disabledMcpjsonServers',
    )
    if (!changed) return { after: text, changed: false, warnings: [] }
    // Una lista que se vacía se quita: así activar un servidor deja el archivo como estaba antes
    // de desactivarlo.
    if (next.length === 0) delete doc.disabledMcpjsonServers
    else doc.disabledMcpjsonServers = next
    return { after: stringifySettings(doc, text), changed: true, warnings: [] }
  }

export const planSetMcpjsonDisabled = (
  path: string,
  before: string | null,
  name: string,
  disabled: boolean,
): MutationPlan => planOf(path, before, computeSetMcpjsonDisabled(path, name, disabled))

/**
 * `~/.claude.json` → `projects[<ruta>].disabledMcpServers`. Claude Code reescribe ese archivo a
 * menudo y es estado suyo, no configuración: se parsea, se toca SOLO esa lista y se serializa con
 * dos espacios. Si el original no es exactamente lo que `JSON.stringify(_, null, 2)` produciría (otro
 * formato, números que no sobreviven al viaje, escapes), se rechaza en vez de reformatearlo.
 */
const computeSetClaudeJsonMcpDisabled =
  (path: string, projectKey: string, name: string, disabled: boolean): Compute =>
  (before) => {
    const text = before ?? '{}\n'
    const doc = parseObject(text, path)
    const canonical = JSON.stringify(doc, null, 2)
    if (text !== `${canonical}\n` && text !== canonical) {
      throw new OfficeError(
        'unexpected-format',
        `${path} is not formatted the way Claude Code writes it: refusing to rewrite it`,
        { params: { path } },
      )
    }
    const projects = doc.projects
    if (projects !== undefined && !isRecord(projects)) {
      throw new OfficeError('unexpected-format', `projects in ${path} is not an object`, {
        params: { path },
      })
    }
    const entry = projects?.[projectKey]
    if (entry !== undefined && !isRecord(entry)) {
      throw new OfficeError(
        'unexpected-format',
        `projects[${projectKey}] in ${path} is not an object`,
        {
          params: { path },
        },
      )
    }
    const { next, changed } = toggleInList(
      entry?.disabledMcpServers,
      name,
      disabled,
      path,
      'disabledMcpServers',
    )
    if (!changed) return { after: text, changed: false, warnings: [] }
    doc.projects = { ...projects, [projectKey]: { ...entry, disabledMcpServers: next } }
    return {
      after: JSON.stringify(doc, null, 2) + (text.endsWith('\n') ? '\n' : ''),
      changed: true,
      warnings: [],
    }
  }

export const planSetClaudeJsonMcpDisabled = (
  path: string,
  before: string | null,
  projectKey: string,
  name: string,
  disabled: boolean,
): MutationPlan =>
  planOf(path, before, computeSetClaudeJsonMcpDisabled(path, projectKey, name, disabled))

// ---------------------------------------------------------------------------------------------
// Aplicar
// ---------------------------------------------------------------------------------------------

interface ApplyJsonArgs {
  kind: 'plugin' | 'mcp'
  name: string
  action: string
  entityId: string
  path: string
  etag: string
  compute: Compute
  roots: string[]
}

const applyJsonMutation = async (args: ApplyJsonArgs): Promise<ApplyResult> => {
  const target = await realWhereverItEnds(args.path)
  await assertWithinRoots(target, args.roots)

  let current: { text: string; etag: string; mode: number } | null = null
  try {
    current = await readWithEtag(target)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  const currentEtag = current?.etag ?? ABSENT_ETAG
  if (currentEtag !== args.etag) throw new ConflictError(target, currentEtag, current?.text ?? '')

  const { after, changed } = args.compute(current?.text ?? null)
  if (!changed) return { path: target, etag: currentEtag, backup: '' }

  let backup = ''
  if (current) {
    backup = await writeBackup(args.kind, args.name, current.text, '.json')
    await writeAtomic(target, after, current.mode)
  } else {
    // Un archivo nuevo (un settings de proyecto que no existía): `wx` falla si alguien lo creó mientras tanto.
    await mkdir(dirname(target), { recursive: true })
    try {
      await writeFile(target, after, { encoding: 'utf8', mode: 0o644, flag: 'wx' })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      const now = await readWithEtag(target)
      throw new ConflictError(target, now.etag, now.text)
    }
  }
  const st = await stat(target)
  await appendAudit({
    ts: Date.now(),
    action: args.action,
    entityId: args.entityId,
    path: target,
    shaBefore: current ? sha256(current.text) : '',
    shaAfter: sha256(after),
    bytesDelta: Buffer.byteLength(after, 'utf8') - Buffer.byteLength(current?.text ?? '', 'utf8'),
  })
  return { path: target, etag: etagOf(after, st.mtimeMs, st.size), backup }
}

export const applySetPluginEnabled = (
  pluginKey: string,
  entityId: string,
  path: string,
  enabled: boolean,
  etag: string,
  opts: MutationOptions = {},
): Promise<ApplyResult> =>
  applyJsonMutation({
    kind: 'plugin',
    name: pluginKey,
    action: enabled ? 'plugin.enable' : 'plugin.disable',
    entityId,
    path,
    etag,
    compute: computeSetPluginEnabled(path, pluginKey, enabled),
    roots: opts.extraAllowedRoots ?? [],
  })

export const applySetMcpjsonDisabled = (
  serverName: string,
  entityId: string,
  path: string,
  disabled: boolean,
  etag: string,
  opts: MutationOptions = {},
): Promise<ApplyResult> =>
  applyJsonMutation({
    kind: 'mcp',
    name: serverName,
    action: disabled ? 'mcp.disable' : 'mcp.enable',
    entityId,
    path,
    etag,
    compute: computeSetMcpjsonDisabled(path, serverName, disabled),
    roots: opts.extraAllowedRoots ?? [],
  })

export const applySetClaudeJsonMcpDisabled = (
  serverName: string,
  entityId: string,
  path: string,
  projectKey: string,
  disabled: boolean,
  etag: string,
  opts: MutationOptions = {},
): Promise<ApplyResult> =>
  applyJsonMutation({
    kind: 'mcp',
    name: serverName,
    action: disabled ? 'mcp.disable' : 'mcp.enable',
    entityId,
    path,
    etag,
    compute: computeSetClaudeJsonMcpDisabled(path, projectKey, serverName, disabled),
    roots: opts.extraAllowedRoots ?? [],
  })
