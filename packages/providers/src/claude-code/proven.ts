import {
  type Catalog,
  type Edge,
  type EdgeEvidence,
  gradeOf,
  isActiveGrade,
  makeId,
  pluginId,
} from '@ai-office/core'
import type { HistoryScan } from './history.ts'
import { mcpResolver, unknownMcpId } from './mcp.ts'
import { abbreviateCwd, slugForCwd } from './paths.ts'
import type { Actor, Invocation } from './transcripts.ts'

/** Nodo del hilo principal: no es un agente de `~/.claude/agents`, pero es un actor de pleno derecho. */
export const MAIN_THREAD_ID = makeId('agent', 'claude-code', 'builtin', 'hilo-principal')

export const actorId = (actor: Actor): string =>
  actor.kind === 'main' ? MAIN_THREAD_ID : makeId('agent', 'claude-code', 'user', actor.agentType)

/** Semanas de la serie de `EntityActivity.weekly`. */
export const WEEKLY_SERIES_LENGTH = 12
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

interface Bucket {
  uses: number
  /** Usos por semana; la última posición es la semana en curso. */
  weekly: number[]
  /** Usos por proyecto: el cwd abreviado (`~/…`) o el slug si la fuente no trae cwd. */
  byProject: Map<string, number>
  sessions: Set<string>
  projects: Set<string>
  lastUsedAt: number
  /** Llamadas por herramienta (solo servidores MCP). */
  byTool: Map<string, number>
}

const newBucket = (): Bucket => ({
  uses: 0,
  weekly: new Array<number>(WEEKLY_SERIES_LENGTH).fill(0),
  byProject: new Map(),
  sessions: new Set(),
  projects: new Set(),
  lastUsedAt: 0,
  byTool: new Map(),
})

/**
 * Ventanas móviles de 7 días que terminan en `now` (no semanas de calendario: así la serie no
 * cambia de forma según el día en que se mire). Una fecha futura por desfase de reloj cuenta en la
 * última; lo que cae fuera de las 12 semanas no entra en la serie, pero sí en el total.
 */
const addWeekly = (b: Bucket, ts: number, now: number): void => {
  if (!ts) return
  const ago = Math.max(0, Math.floor((now - ts) / WEEK_MS))
  if (ago < WEEKLY_SERIES_LENGTH) b.weekly[WEEKLY_SERIES_LENGTH - 1 - ago]! += 1
}

const addProject = (b: Bucket, key: string, n = 1): void => {
  b.byProject.set(key, (b.byProject.get(key) ?? 0) + n)
}

const addUse = (b: Bucket, inv: Invocation, now: number, withTool = false): void => {
  if (withTool && inv.type === 'mcp') {
    const tool = inv.tool || '(unknown)'
    b.byTool.set(tool, (b.byTool.get(tool) ?? 0) + 1)
  }
  addWeekly(b, inv.ts, now)
  addProject(b, inv.cwd ? abbreviateCwd(inv.cwd) : inv.projectSlug)
  b.uses += 1
  if (inv.sessionId) b.sessions.add(inv.sessionId)
  b.projects.add(inv.projectSlug)
  if (inv.ts > b.lastUsedAt) b.lastUsedAt = inv.ts
}

/** Hacia qué entidad apunta una invocación. Un `Skill` puede nombrar un comando. */
interface Target {
  id: string
  type: 'skill' | 'agent' | 'command' | 'mcp'
}

/**
 * Resuelve nombres del historial a entidades del catálogo. Los archivados no existen para Claude
 * Code y los tapados por otro ámbito tampoco: no pueden recibir uso. Los de un plugin
 * deshabilitado SÍ entran: lo que se usó mientras estaba habilitado sigue siendo historia.
 */
const targetResolver = (catalog: Catalog) => {
  const loaded = <T extends { status: string }>(list: T[]): T[] =>
    list.filter((e) => e.status !== 'shadowed')
  const skillByName = new Map(loaded(catalog.skills).map((s) => [s.name, s]))
  const agentByName = new Map(
    loaded(catalog.agents.filter((a) => !a.archived)).map((a) => [a.name, a]),
  )
  const commandByName = new Map(loaded(catalog.commands).map((c) => [c.name, c]))
  const mcpByKey = mcpResolver(catalog)
  const actor = (a: Actor): string =>
    a.kind === 'main' ? MAIN_THREAD_ID : (agentByName.get(a.agentType)?.id ?? actorId(a))
  const resolve = (inv: Invocation): Target => {
    if (inv.type === 'mcp') {
      return { id: mcpByKey(inv.target)?.id ?? unknownMcpId(inv.target), type: 'mcp' }
    }
    if (inv.type === 'agent') {
      return {
        id:
          agentByName.get(inv.target)?.id ?? makeId('agent', 'claude-code', 'builtin', inv.target),
        type: 'agent',
      }
    }
    const skill = skillByName.get(inv.target)
    if (skill) return { id: skill.id, type: 'skill' }
    // En versiones recientes un slash command también se invoca por la herramienta Skill, con el
    // nombre del comando en `tool_input.skill`. Si no es una skill y sí es un comando, es suyo.
    const command = commandByName.get(inv.target)
    if (command) return { id: command.id, type: 'command' }
    // El nombre puede venir con prefijo de plugin (`plugin:skill`): se usa tal cual como id.
    return { id: makeId('skill', 'claude-code', 'plugin', inv.target), type: 'skill' }
  }
  return { resolve, actor }
}

/**
 * Convierte el historial en aristas `proven`: lo que de verdad pasó, con su cuenta,
 * sus sesiones y sus proyectos distintos (que es lo que determina el grado).
 */
export const buildProvenGraph = (invocations: Invocation[], catalog: Catalog): Edge[] => {
  const { resolve, actor } = targetResolver(catalog)
  const buckets = new Map<
    string,
    {
      from: string
      to: string
      type: 'skill' | 'agent' | 'mcp'
      b: Bucket
      /** Por herramienta MCP: cuántas veces y en qué transcript se vio por última vez. */
      tools: Map<string, { n: number; file: string }>
    }
  >()

  for (const inv of invocations) {
    const target = resolve(inv)
    // Un comando invocado por Skill es actividad del comando (ver `activityByTarget`), no una
    // arista agente→skill.
    if (target.type === 'command') continue
    const from = actor(inv.actor)
    const key = `${from}|${target.id}`
    let entry = buckets.get(key)
    if (!entry) {
      entry = { from, to: target.id, type: target.type, b: newBucket(), tools: new Map() }
      buckets.set(key, entry)
    }
    addUse(entry.b, inv, Date.now())
    if (inv.type === 'mcp') {
      const tool = `mcp__${inv.target}__${inv.tool ?? ''}`
      const cur = entry.tools.get(tool)
      entry.tools.set(tool, { n: (cur?.n ?? 0) + 1, file: inv.file ?? cur?.file ?? '' })
    }
  }

  const KIND = {
    skill: 'agent-uses-skill',
    agent: 'agent-delegates-agent',
    mcp: 'agent-uses-mcp',
  } as const
  return [...buckets.values()].map(({ from, to, type, b, tools }) => ({
    from,
    to,
    kind: KIND[type],
    layer: 'proven' as const,
    // La evidencia de un servidor MCP son sus herramientas más llamadas y dónde se vieron.
    evidence: [...tools.entries()]
      .sort((x, y) => y[1].n - x[1].n)
      .slice(0, 3)
      .map(([excerpt, { file }]): EdgeEvidence => ({ path: file, excerpt })),
    uses: b.uses,
    sessions: b.sessions.size,
    projects: b.projects.size,
    lastUsedAt: b.lastUsedAt || undefined,
  }))
}

export interface EntityActivity {
  id: string
  name: string
  uses: number
  sessions: number
  projects: number
  lastUsedAt: number | null
  /** Usos por semana, 12 posiciones: la última es la semana en curso (ventanas de 7 días que
   * terminan al construir). Agentes: delegaciones; skills: invocaciones; comandos: tecleados más
   * los invocados por la herramienta Skill. */
  weekly: number[]
  /** Usos por proyecto (cwd abreviado `~/…`, o el slug si no hay cwd). Ausente si no hay datos. */
  byProject?: Record<string, number>
  /** Solo servidores MCP: llamadas por herramienta (`create_issue` -> 12). */
  byTool?: Record<string, number>
  grade: ReturnType<typeof gradeOf>
  active: boolean
}

export interface ActivityOptions {
  /** Se mide un solo proyecto: el grado acreditado pide semanas distintas en vez de proyectos. */
  singleProject?: boolean
  /** Comandos tecleados (de `history.jsonl`): los slash commands no dejan rastro como herramienta. */
  commandUse?: HistoryScan['commandUse']
  now?: number
}

/**
 * Actividad por entidad de destino, para saber qué está vivo y qué no.
 *
 * Se calcula desde las invocaciones y no desde las aristas porque las sesiones y los proyectos
 * son CONJUNTOS: la misma sesión en la que trabajaron tres agentes con una skill es una sesión,
 * no tres. Sumar las aristas por actor inflaba el grado de lo que usa más de un agente.
 */
export const activityByTarget = (
  invocations: Invocation[],
  catalog: Catalog,
  opts: ActivityOptions = {},
): Map<string, EntityActivity> => {
  const { resolve } = targetResolver(catalog)
  const now = opts.now ?? Date.now()
  const buckets = new Map<string, Bucket>()
  // El uso de un plugin es la suma del de todo lo suyo (skills, agentes, comandos y servidores).
  // Se acumula aparte, no sumando entidades: sesiones y proyectos son conjuntos.
  const pluginOf = new Map<string, string>()
  for (const e of [
    ...catalog.agents,
    ...catalog.skills,
    ...catalog.commands,
    ...catalog.mcpServers,
  ]) {
    if (e.plugin) pluginOf.set(e.id, pluginId(e.plugin))
  }
  const bucketOf = (id: string): Bucket => {
    const existing = buckets.get(id)
    if (existing) return existing
    const created = newBucket()
    buckets.set(id, created)
    return created
  }

  for (const inv of invocations) {
    const id = resolve(inv).id
    addUse(bucketOf(id), inv, now, true)
    const plugin = pluginOf.get(id)
    if (plugin) addUse(bucketOf(plugin), inv, now)
  }

  for (const command of catalog.commands) {
    if (command.status === 'shadowed') continue
    const typed = opts.commandUse?.get(command.name)
    if (!typed) continue
    const plugin = pluginOf.get(command.id)
    for (const b of plugin ? [bucketOf(command.id), bucketOf(plugin)] : [bucketOf(command.id)]) {
      b.uses += typed.count
      for (const s of typed.sessions) b.sessions.add(s)
      for (const p of typed.projects) b.projects.add(slugForCwd(p))
      for (const e of typed.events) {
        addWeekly(b, e.ts, now)
        if (e.project) addProject(b, abbreviateCwd(e.project))
      }
      if (typed.lastUsedAt > b.lastUsedAt) b.lastUsedAt = typed.lastUsedAt
    }
  }

  const map = new Map<string, EntityActivity>()
  for (const [id, b] of buckets) {
    const lastUsedAt = b.lastUsedAt || null
    const grade = gradeOf(
      {
        uses: b.uses,
        sessions: b.sessions.size,
        projects: b.projects.size,
        lastUsedAt,
        weeks: b.weekly.filter((n) => n > 0).length,
      },
      now,
      { singleProject: opts.singleProject },
    )
    map.set(id, {
      id,
      name: id.split('/').slice(2).join('/') || id,
      uses: b.uses,
      sessions: b.sessions.size,
      projects: b.projects.size,
      lastUsedAt,
      weekly: b.weekly,
      ...(b.byProject.size > 0 ? { byProject: Object.fromEntries(b.byProject) } : {}),
      ...(b.byTool.size > 0 ? { byTool: Object.fromEntries(b.byTool) } : {}),
      grade,
      active: isActiveGrade(grade),
    })
  }
  return map
}
