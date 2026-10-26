import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import type {
  Agent,
  Catalog,
  Command,
  Lang,
  McpServer,
  Plugin,
  PluginSettingsScope,
  ScopeSelection,
  Skill,
} from '@ai-office/core'
import {
  AGENT_COLORS,
  type AgentColor,
  type ApplyResult,
  applyArchiveAgent,
  applyRetireSkill,
  applySetAgentBody,
  applySetAgentColor,
  applySetAgentDescription,
  applySetAgentModel,
  applySetAgentPreloadedSkills,
  applySetAgentSkillMentions,
  applySetAgentTools,
  applySetClaudeJsonMcpDisabled,
  applySetCommandArgumentHint,
  applySetCommandBody,
  applySetCommandDescription,
  applySetMcpjsonDisabled,
  applySetPluginEnabled,
  applySetSkillBody,
  applySetSkillDescription,
  applyUnarchiveAgent,
  applyUnretireSkill,
  ConflictError,
  claudeJsonProjectKey,
  etagOf,
  type MutationPlan,
  OfficeError,
  type PlanWarning,
  paths,
  planArchiveAgent,
  planRetireSkill,
  planSetAgentColor,
  planSetAgentDescription,
  planSetAgentModel,
  planSetAgentPreloadedSkills,
  planSetAgentSkillMentions,
  planSetAgentTools,
  planSetBody,
  planSetClaudeJsonMcpDisabled,
  planSetCommandArgumentHint,
  planSetCommandDescription,
  planSetMcpjsonDisabled,
  planSetPluginEnabled,
  planSetSkillDescription,
  planUnarchiveAgent,
  planUnretireSkill,
  readJsonTarget,
  scopeRoots,
  settingsPathFor,
} from '@ai-office/providers'

/**
 * Traduce las peticiones de la interfaz a operaciones de escritura concretas.
 *
 * Todo pasa por aquí en dos tiempos —planear y aplicar— y el `etag` viaja entre ambos: si el
 * archivo cambió en disco mientras el usuario miraba el diff, la escritura se rechaza en vez de
 * pisar el cambio.
 */

export type MutationKind =
  | 'agent.color'
  | 'agent.description'
  | 'agent.body'
  | 'agent.model'
  | 'agent.tools'
  | 'agent.preloadedSkills'
  | 'agent.skillMentions'
  | 'skill.description'
  | 'skill.body'
  | 'skill.retire'
  | 'skill.unretire'
  | 'command.description'
  | 'command.body'
  | 'command.argumentHint'
  | 'agent.archive'
  /** Restaura un agente de `agents/.archive/` (o del `.archivo/` heredado). Misma petición que `agent.archive`. */
  | 'agent.unarchive'
  /** `value: { scope: 'user' | 'project' | 'local' }` (por defecto `user`): qué settings se escribe. */
  | 'plugin.enable'
  | 'plugin.disable'
  /**
   * Solo con ámbito de proyecto. `value: { scope }` solo elige el settings de un servidor de
   * `.mcp.json`. `mcp.enable` SIN `value.scope` lo quita de TODOS los settings (user, project, local)
   * donde esté desactivado: el plan trae entonces `files` y un `etag` compuesto (ver `PlanResponse`).
   */
  | 'mcp.enable'
  | 'mcp.disable'

/** Lo que una mutación necesita saber del daemon y no está en el catálogo: el ámbito activo. */
export interface MutationContext {
  scope: ScopeSelection
}

const USER_CONTEXT: MutationContext = { scope: { kind: 'user' } }

export interface MutationRequest {
  kind: MutationKind
  /** Una entidad, un plugin (`plugin.*`) o un servidor MCP (`mcp.*`). */
  entityId: string
  value?: unknown
  /** Idioma de la interfaz. Hoy ninguna mutación escribe prosa en el archivo (las secciones
   * gestionadas son listas de nombres), así que no cambia nada; se acepta para que la interfaz
   * lo mande siempre y para el día en que alguna lo necesite. */
  lang?: Lang
}

/** Un archivo de un plan que escribe en varios. */
export interface PlanFile {
  scope: PluginSettingsScope
  path: string
  diff: string
  changed: boolean
}

/**
 * Casi siempre un plan escribe UN archivo: `path`, `diff` y `etag` son los suyos. Solo `mcp.enable`
 * de un servidor de `.mcp.json` desactivado en varios settings escribe en más de uno; entonces:
 *  - `files` lista un elemento por archivo (de menor a mayor precedencia: user, project, local);
 *  - `path` es el del primero, `diff` es la concatenación de los diffs de todos y `changed` es que
 *    cambie alguno;
 *  - `etag` es COMPUESTO (`multi:<hash>` de las rutas y etags de todos): el cliente lo devuelve tal
 *    cual al aplicar y el daemon lo recalcula; si algún archivo cambió, es un `conflict`.
 */
export interface PlanResponse extends Omit<MutationPlan, 'before' | 'after'> {
  etag: string
  files?: PlanFile[]
}

/** Resultado de aplicar. Con varios archivos, `files` trae el de cada uno, en el orden aplicado. */
export interface ApplyResponse extends ApplyResult {
  files?: ApplyResult[]
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []

/** El cuerpo llega tal cual: un valor que no es texto se rechaza, no se convierte en "null". */
const bodyOf = (v: unknown): string => {
  if (typeof v !== 'string') throw new OfficeError('invalid-body', 'the body must be text')
  return v
}

/** De dónde es cada skill, para que la sección de citas diga la ruta (o el nombre) correcta. */
const citationRefs = (catalog: Catalog) =>
  catalog.skills.map((s) => ({ name: s.name, scope: s.scope, status: s.status }))

const findEntity = (
  catalog: Catalog,
  id: string,
): { entity: Agent | Skill | Command; kind: 'agent' | 'skill' | 'command' } => {
  const agent = catalog.agents.find((a) => a.id === id)
  if (agent) return { entity: agent, kind: 'agent' }
  const skill = catalog.skills.find((s) => s.id === id)
  if (skill) return { entity: skill, kind: 'skill' }
  const command = catalog.commands.find((c) => c.id === id)
  if (command) return { entity: command, kind: 'command' }
  throw new OfficeError('entity-not-found', `entity ${id} does not exist`, {
    kind: 'not-found',
    params: { id },
  })
}

/**
 * Una skill puede ser un symlink a un repositorio de proyecto. La escritura va al destino real,
 * así que hay que autorizar explícitamente esa raíz: el daemon la conoce, la capa de mutaciones no.
 * Con un ámbito de proyecto, también `<proyecto>/.claude` y `<proyecto>/.mcp.json`.
 */
const extraRootsFor = (entity: Agent | Skill | Command, ctx: MutationContext): string[] => [
  ...(entity.source.symlink ? [entity.source.realPath] : []),
  ...scopeRoots(ctx.scope),
]

/** Lo de un plugin son copias que una actualización sobrescribe: no se edita. */
const assertWritable = (entity: Agent | Skill | Command): void => {
  if (entity.source.readOnly) {
    throw new OfficeError('read-only', `${entity.name} comes from a plugin and is read-only`, {
      params: { name: entity.name },
    })
  }
}

/** Archivar un archivado o restaurar uno activo movería el archivo a donde no corresponde. */
const assertArchiveState = (entity: Agent | Skill | Command, kind: MutationKind): void => {
  const archived = entity.kind === 'agent' && entity.archived === true
  if (kind === 'agent.archive' && archived) {
    throw new OfficeError('already-archived', `${entity.name} is already archived`, {
      params: { name: entity.name },
    })
  }
  if (kind === 'agent.unarchive' && !archived) {
    throw new OfficeError('not-archived', `${entity.name} is not archived`, {
      params: { name: entity.name },
    })
  }
}

/** `skill.body` sobre el id de un agente escribiría en un archivo que no es el que se ve. */
const assertKindMatches = (entity: Agent | Skill | Command, kind: MutationKind): void => {
  if (!kind.startsWith(`${entity.kind}.`)) {
    throw new OfficeError('wrong-entity-kind', `${kind} does not apply to a ${entity.kind}`, {
      params: { kind, entityKind: entity.kind },
    })
  }
}

const readCurrent = async (path: string): Promise<{ text: string; etag: string }> => {
  const [text, st] = await Promise.all([readFile(path, 'utf8'), stat(path)])
  return { text, etag: etagOf(text, st.mtimeMs, st.size) }
}

export const planMutation = async (
  catalog: Catalog,
  req: MutationRequest,
  ctx: MutationContext = USER_CONTEXT,
): Promise<PlanResponse> => {
  if (typeof req?.kind === 'string' && req.kind.startsWith('plugin.')) {
    return planPlugin(catalog, req, ctx)
  }
  if (typeof req?.kind === 'string' && req.kind.startsWith('mcp.'))
    return planMcp(catalog, req, ctx)
  const { entity } = findEntity(catalog, req.entityId)
  assertKindMatches(entity, req.kind)
  assertWritable(entity)
  assertArchiveState(entity, req.kind)
  const path = entity.source.realPath
  const { text, etag } = await readCurrent(path)

  const plan = ((): MutationPlan => {
    switch (req.kind) {
      case 'agent.color': {
        const color = req.value === null ? null : String(req.value)
        if (color !== null && !AGENT_COLORS.includes(color as AgentColor)) {
          throw new OfficeError('invalid-color', `invalid color: ${color}`, { params: { color } })
        }
        return planSetAgentColor(path, text, color as AgentColor | null)
      }
      case 'agent.model':
        return planSetAgentModel(path, text, req.value === null ? null : String(req.value))
      case 'agent.tools':
        return planSetAgentTools(path, text, req.value === null ? null : asStringArray(req.value))
      case 'agent.preloadedSkills':
        return planSetAgentPreloadedSkills(
          path,
          text,
          asStringArray(req.value),
          catalog.skills.map((s) => ({ name: s.name, body: s.body })),
        )
      case 'agent.skillMentions':
        return planSetAgentSkillMentions(
          path,
          text,
          asStringArray(req.value),
          citationRefs(catalog),
        )
      case 'agent.description':
        return planSetAgentDescription(path, text, String(req.value ?? ''))
      case 'agent.body':
      case 'skill.body':
        return planSetBody(path, text, bodyOf(req.value))
      case 'command.description':
        return planSetCommandDescription(path, text, String(req.value ?? ''))
      case 'command.body':
        return planSetBody(path, text, bodyOf(req.value), true)
      case 'command.argumentHint':
        return planSetCommandArgumentHint(path, text, req.value == null ? null : String(req.value))
      case 'skill.description':
        return planSetSkillDescription(path, text, String(req.value ?? ''))
      case 'skill.retire':
        return planRetireSkill(path, text)
      case 'skill.unretire':
        return planUnretireSkill(path, text)
      case 'agent.archive':
        return planArchiveAgent(path, text)
      case 'agent.unarchive':
        return planUnarchiveAgent(path, text)
      default:
        throw new OfficeError('unknown-operation', `unknown operation: ${String(req.kind)}`, {
          params: { kind: String(req.kind) },
        })
    }
  })()

  const { before: _before, after: _after, ...rest } = plan
  return { ...rest, etag }
}

export const applyMutation = async (
  catalog: Catalog,
  req: MutationRequest & { etag: string },
  ctx: MutationContext = USER_CONTEXT,
): Promise<ApplyResponse> => {
  if (typeof req?.kind === 'string' && req.kind.startsWith('plugin.')) {
    return applyPlugin(catalog, req, ctx)
  }
  if (typeof req?.kind === 'string' && req.kind.startsWith('mcp.'))
    return applyMcp(catalog, req, ctx)
  const { entity } = findEntity(catalog, req.entityId)
  assertKindMatches(entity, req.kind)
  assertWritable(entity)
  assertArchiveState(entity, req.kind)
  const visiblePath = entity.source.path
  const opts = {
    extraAllowedRoots: extraRootsFor(entity, ctx),
    entityScope: entity.scope === 'project' ? ('project' as const) : ('user' as const),
  }
  const name = entity.name

  switch (req.kind) {
    case 'agent.color':
      return applySetAgentColor(
        name,
        visiblePath,
        req.value === null ? null : (String(req.value) as AgentColor),
        req.etag,
        opts,
      )
    case 'agent.model':
      return applySetAgentModel(
        name,
        visiblePath,
        req.value === null ? null : String(req.value),
        req.etag,
        opts,
      )
    case 'agent.tools':
      return applySetAgentTools(
        name,
        visiblePath,
        req.value === null ? null : asStringArray(req.value),
        req.etag,
        opts,
      )
    case 'agent.preloadedSkills':
      return applySetAgentPreloadedSkills(
        name,
        visiblePath,
        asStringArray(req.value),
        catalog.skills.map((s) => ({ name: s.name, body: s.body })),
        req.etag,
        opts,
      )
    case 'agent.skillMentions':
      return applySetAgentSkillMentions(
        name,
        visiblePath,
        asStringArray(req.value),
        req.etag,
        opts,
        citationRefs(catalog),
      )
    case 'agent.description':
      return applySetAgentDescription(name, visiblePath, String(req.value ?? ''), req.etag, opts)
    case 'agent.body':
      return applySetAgentBody(name, visiblePath, bodyOf(req.value), req.etag, opts)
    case 'command.description':
      return applySetCommandDescription(name, visiblePath, String(req.value ?? ''), req.etag, opts)
    case 'command.body':
      return applySetCommandBody(name, visiblePath, bodyOf(req.value), req.etag, opts)
    case 'command.argumentHint':
      return applySetCommandArgumentHint(
        name,
        visiblePath,
        req.value == null ? null : String(req.value),
        req.etag,
        opts,
      )
    case 'skill.body':
      return applySetSkillBody(name, visiblePath, bodyOf(req.value), req.etag, opts)
    case 'skill.description':
      return applySetSkillDescription(name, visiblePath, String(req.value ?? ''), req.etag, opts)
    case 'skill.retire':
      return applyRetireSkill(name, visiblePath, req.etag, opts)
    case 'skill.unretire':
      return applyUnretireSkill(name, visiblePath, req.etag, opts)
    case 'agent.archive':
      return applyArchiveAgent(name, visiblePath, req.etag, opts)
    case 'agent.unarchive':
      return applyUnarchiveAgent(name, visiblePath, req.etag, opts)
    default:
      throw new OfficeError('unknown-operation', `unknown operation: ${String(req.kind)}`, {
        params: { kind: String(req.kind) },
      })
  }
}

// ---------------------------------------------------------------------------------------------
// Plugins y servidores MCP: escriben en settings y en `~/.claude.json`, no en la entidad
// ---------------------------------------------------------------------------------------------

const SETTINGS_SCOPES: readonly string[] = ['user', 'project', 'local']
/** De menor a mayor precedencia: `managed` manda sobre todo lo que podamos escribir. */
const RANK = ['user', 'project', 'local', 'managed']

/** El settings elegido en `value.scope`; `project` y `local` solo existen con un ámbito de proyecto. */
const settingsChoice = (
  value: unknown,
  ctx: MutationContext,
  fallback: PluginSettingsScope,
): { source: PluginSettingsScope; path: string } => {
  const raw =
    value !== null && typeof value === 'object' ? (value as { scope?: unknown }).scope : undefined
  const source = raw === undefined ? fallback : raw
  if (typeof source !== 'string' || !SETTINGS_SCOPES.includes(source)) {
    throw new OfficeError('invalid-scope', `scope must be one of: ${SETTINGS_SCOPES.join(', ')}`, {
      params: { scope: String(source) },
    })
  }
  const path = settingsPathFor(source as PluginSettingsScope, ctx.scope)
  if (!path) {
    throw new OfficeError('needs-project', `the "${source}" settings only exist inside a project`, {
      params: { scope: source },
    })
  }
  return { source: source as PluginSettingsScope, path }
}

const findPlugin = (catalog: Catalog, id: string): Plugin => {
  const plugin = catalog.plugins.find((p) => p.id === id)
  if (!plugin) {
    throw new OfficeError('entity-not-found', `plugin ${id} does not exist`, {
      kind: 'not-found',
      params: { id },
    })
  }
  return plugin
}

const findMcp = (catalog: Catalog, id: string): McpServer => {
  const server = catalog.mcpServers.find((m) => m.id === id)
  if (!server) {
    throw new OfficeError('entity-not-found', `MCP server ${id} does not exist`, {
      kind: 'not-found',
      params: { id },
    })
  }
  return server
}

/** Lo que ya manda por encima del settings elegido: el cambio se escribe pero no surte efecto. */
const overriddenWarning = (plugin: Plugin, wanted: boolean, source: string): PlanWarning[] =>
  plugin.enabledSource !== null &&
  plugin.enabled !== wanted &&
  RANK.indexOf(plugin.enabledSource) > RANK.indexOf(source)
    ? [
        {
          code: 'overridden',
          message: `the ${plugin.enabledSource} settings set this plugin to ${plugin.enabled} and take precedence over ${source}`,
          params: { source: plugin.enabledSource },
        },
      ]
    : []

const pluginTarget = (catalog: Catalog, req: MutationRequest, ctx: MutationContext) => {
  const plugin = findPlugin(catalog, req.entityId)
  const choice = settingsChoice(req.value, ctx, 'user')
  return { plugin, enabled: req.kind === 'plugin.enable', ...choice }
}

const planPlugin = async (
  catalog: Catalog,
  req: MutationRequest,
  ctx: MutationContext,
): Promise<PlanResponse> => {
  const { plugin, enabled, source, path } = pluginTarget(catalog, req, ctx)
  const target = await readJsonTarget(path)
  const plan = planSetPluginEnabled(target.path, target.text, plugin.key, enabled)
  const extra = plan.changed ? overriddenWarning(plugin, enabled, source) : []
  const { before: _b, after: _a, ...rest } = plan
  return {
    ...rest,
    warnings: [...rest.warnings, ...extra.map((w) => w.message)],
    warningDetails: [...rest.warningDetails, ...extra],
    etag: target.etag,
  }
}

const applyPlugin = async (
  catalog: Catalog,
  req: MutationRequest & { etag: string },
  ctx: MutationContext,
) => {
  const { plugin, enabled, path } = pluginTarget(catalog, req, ctx)
  return applySetPluginEnabled(plugin.key, plugin.id, path, enabled, req.etag, {
    extraAllowedRoots: scopeRoots(ctx.scope),
  })
}

/**
 * Dónde se guarda el estado de un servidor MCP. Los de `.mcp.json` se desactivan en un settings
 * (`disabledMcpjsonServers`); los demás, por proyecto en `~/.claude.json`. Claude Code lo guarda por
 * proyecto, así que sin ámbito de proyecto no hay dónde escribirlo.
 */
const mcpTarget = async (catalog: Catalog, req: MutationRequest, ctx: MutationContext) => {
  const server = findMcp(catalog, req.entityId)
  if (ctx.scope.kind !== 'project') {
    throw new OfficeError(
      'needs-project',
      'Claude Code stores which MCP servers are off per project: open a project scope first',
    )
  }
  if (server.scope === 'managed') {
    throw new OfficeError('read-only', `${server.name} is managed and cannot be changed`, {
      params: { name: server.name },
    })
  }
  const disabled = req.kind === 'mcp.disable'
  if (server.scope === 'project') {
    // Al desactivar, `settings.local.json` (el que no se comparte), salvo que `value.scope` elija otro.
    // Al activar, se quita de TODOS los settings donde esté desactivado: dejarlo en uno solo lo
    // dejaría apagado por el otro, sin que nada lo avisara. `value.scope` limita a uno.
    const explicit = scopeInValue(req.value) !== undefined
    const wheres = [...new Set(server.disabledIn ?? [])]
    if (disabled || explicit || wheres.length === 0) {
      const choice = settingsChoice(req.value, ctx, 'local')
      return { server, disabled, file: 'settings' as const, targets: [choice] }
    }
    const targets = wheres.map((source) => settingsChoice({ scope: source }, ctx, 'local'))
    return { server, disabled, file: 'settings' as const, targets }
  }
  return {
    server,
    disabled,
    file: 'claude-json' as const,
    path: paths().usageJson,
    projectPath: ctx.scope.path,
  }
}

const scopeInValue = (value: unknown): unknown =>
  value !== null && typeof value === 'object' ? (value as { scope?: unknown }).scope : undefined

/** Etag de un conjunto de archivos: cambia si cambia cualquiera de ellos. */
const compositeEtag = (parts: { path: string; etag: string }[]): string =>
  `multi:${createHash('sha256')
    .update(parts.map((p) => `${p.path}\n${p.etag}`).join('\n'))
    .digest('hex')
    .slice(0, 16)}`

/** Lee cada settings una sola vez: dos rutas que acaban en el mismo archivo real no se escriben dos veces. */
const readTargets = async (targets: { source: PluginSettingsScope; path: string }[]) => {
  const out: (Awaited<ReturnType<typeof readJsonTarget>> & { source: PluginSettingsScope })[] = []
  for (const t of targets) {
    const read = await readJsonTarget(t.path)
    if (!out.some((o) => o.path === read.path)) out.push({ ...read, source: t.source })
  }
  return out
}

/** La clave de `projects` de `~/.claude.json` y el nombre con el que se anota el servidor. */
const claudeJsonKeys = async (
  text: string | null,
  server: McpServer,
  projectPath: string,
): Promise<{ projectKey: string; name: string }> => {
  let key: string | null = null
  try {
    const data: unknown = text ? JSON.parse(text) : null
    if (data && typeof data === 'object') {
      key = await claudeJsonProjectKey(data as Record<string, unknown>, projectPath)
    }
  } catch {
    /* si no se puede leer, el plan lo dirá con su propio error */
  }
  // Cómo se anota un servidor de plugin NO está documentado: se asume `plugin:<plugin>:<servidor>`.
  const name = server.scope === 'plugin' ? `plugin:${server.name}` : server.name
  return { projectKey: key ?? projectPath, name }
}

const planMcp = async (
  catalog: Catalog,
  req: MutationRequest,
  ctx: MutationContext,
): Promise<PlanResponse> => {
  const t = await mcpTarget(catalog, req, ctx)
  if (t.file === 'settings') {
    const reads = await readTargets(t.targets)
    const plans = reads.map((r) =>
      planSetMcpjsonDisabled(r.path, r.text, t.server.name, t.disabled),
    )
    const [first, ...others] = plans
    if (!first || !others.length) {
      const { before: _b, after: _a, ...rest } = first as MutationPlan
      return { ...rest, etag: reads[0]?.etag ?? '' }
    }
    return {
      path: first.path,
      diff: plans.map((p) => p.diff).join(''),
      changed: plans.some((p) => p.changed),
      warnings: plans.flatMap((p) => p.warnings),
      warningDetails: plans.flatMap((p) => p.warningDetails),
      etag: compositeEtag(reads),
      files: plans.map((p, i) => ({
        scope: reads[i]?.source ?? 'local',
        path: p.path,
        diff: p.diff,
        changed: p.changed,
      })),
    }
  }
  const target = await readJsonTarget(t.path)
  const { projectKey, name } = await claudeJsonKeys(target.text, t.server, t.projectPath)
  const plan = planSetClaudeJsonMcpDisabled(target.path, target.text, projectKey, name, t.disabled)
  const { before: _b, after: _a, ...rest } = plan
  return { ...rest, etag: target.etag }
}

const applyMcp = async (
  catalog: Catalog,
  req: MutationRequest & { etag: string },
  ctx: MutationContext,
) => {
  const t = await mcpTarget(catalog, req, ctx)
  if (t.file === 'settings') {
    const opts = { extraAllowedRoots: scopeRoots(ctx.scope) }
    const reads = await readTargets(t.targets)
    const [only, ...others] = reads
    if (only && !others.length) {
      return applySetMcpjsonDisabled(
        t.server.name,
        t.server.id,
        only.path,
        t.disabled,
        req.etag,
        opts,
      )
    }
    // Varios archivos: el etag compuesto dice que ninguno cambió desde el plan. Se aplican en orden,
    // cada uno con su propio etag; no hay transacción: si uno falla, los anteriores quedan escritos.
    const now = compositeEtag(reads)
    if (now !== req.etag) throw new ConflictError(only?.path ?? '', now, '')
    const results: ApplyResult[] = []
    for (const r of reads) {
      results.push(
        await applySetMcpjsonDisabled(t.server.name, t.server.id, r.path, t.disabled, r.etag, opts),
      )
    }
    return {
      path: results[0]?.path ?? '',
      etag: compositeEtag(results),
      backup: results[0]?.backup ?? '',
      files: results,
    }
  }
  const target = await readJsonTarget(t.path)
  const { projectKey, name } = await claudeJsonKeys(target.text, t.server, t.projectPath)
  return applySetClaudeJsonMcpDisabled(
    name,
    t.server.id,
    t.path,
    projectKey,
    t.disabled,
    req.etag,
    {
      // `~/.claude.json` vive fuera de `~/.claude`: se autoriza solo para esta escritura.
      extraAllowedRoots: [paths().usageJson],
    },
  )
}
