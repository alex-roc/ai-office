import { type Catalog, type Edge, gradeOf, isActiveGrade, makeId } from '@ai-office/core'
import type { HistoryScan } from './history.ts'
import { slugForCwd } from './paths.ts'
import type { Actor, Invocation } from './transcripts.ts'

/** Nodo del hilo principal: no es un agente de `~/.claude/agents`, pero es un actor de pleno derecho. */
export const MAIN_THREAD_ID = makeId('agent', 'claude-code', 'builtin', 'hilo-principal')

export const actorId = (actor: Actor): string =>
  actor.kind === 'main' ? MAIN_THREAD_ID : makeId('agent', 'claude-code', 'user', actor.agentType)

interface Bucket {
  uses: number
  sessions: Set<string>
  projects: Set<string>
  lastUsedAt: number
}

const newBucket = (): Bucket => ({
  uses: 0,
  sessions: new Set(),
  projects: new Set(),
  lastUsedAt: 0,
})

const addUse = (b: Bucket, inv: Invocation): void => {
  b.uses += 1
  if (inv.sessionId) b.sessions.add(inv.sessionId)
  b.projects.add(inv.projectSlug)
  if (inv.ts > b.lastUsedAt) b.lastUsedAt = inv.ts
}

/** Hacia qué entidad apunta una invocación. Un `Skill` puede nombrar un comando. */
interface Target {
  id: string
  type: 'skill' | 'agent' | 'command'
}

const targetResolver = (catalog: Catalog) => {
  // Los archivados no existen para Claude Code: no pueden recibir uso.
  const skillByName = new Map(catalog.skills.map((s) => [s.name, s]))
  const agentByName = new Map(catalog.agents.filter((a) => !a.archived).map((a) => [a.name, a]))
  const commandByName = new Map(catalog.commands.map((c) => [c.name, c]))
  return (inv: Invocation): Target => {
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
}

/**
 * Convierte el historial en aristas `proven`: lo que de verdad pasó, con su cuenta,
 * sus sesiones y sus proyectos distintos (que es lo que determina el grado).
 */
export const buildProvenGraph = (invocations: Invocation[], catalog: Catalog): Edge[] => {
  const resolve = targetResolver(catalog)
  const buckets = new Map<
    string,
    { from: string; to: string; type: 'skill' | 'agent'; b: Bucket }
  >()

  for (const inv of invocations) {
    const target = resolve(inv)
    // Un comando invocado por Skill es actividad del comando (ver `activityByTarget`), no una
    // arista agente→skill.
    if (target.type === 'command') continue
    const from = actorId(inv.actor)
    const key = `${from}|${target.id}`
    let entry = buckets.get(key)
    if (!entry) {
      entry = { from, to: target.id, type: target.type, b: newBucket() }
      buckets.set(key, entry)
    }
    addUse(entry.b, inv)
  }

  return [...buckets.values()].map(({ from, to, type, b }) => ({
    from,
    to,
    kind: type === 'skill' ? ('agent-uses-skill' as const) : ('agent-delegates-agent' as const),
    layer: 'proven' as const,
    evidence: [],
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
  grade: ReturnType<typeof gradeOf>
  active: boolean
}

export interface ActivityOptions {
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
  const resolve = targetResolver(catalog)
  const buckets = new Map<string, Bucket>()
  const bucketOf = (id: string): Bucket => {
    const existing = buckets.get(id)
    if (existing) return existing
    const created = newBucket()
    buckets.set(id, created)
    return created
  }

  for (const inv of invocations) addUse(bucketOf(resolve(inv).id), inv)

  for (const command of catalog.commands) {
    const typed = opts.commandUse?.get(command.name)
    if (!typed) continue
    const b = bucketOf(command.id)
    b.uses += typed.count
    for (const s of typed.sessions) b.sessions.add(s)
    for (const p of typed.projects) b.projects.add(slugForCwd(p))
    if (typed.lastUsedAt > b.lastUsedAt) b.lastUsedAt = typed.lastUsedAt
  }

  const now = opts.now ?? Date.now()
  const map = new Map<string, EntityActivity>()
  for (const [id, b] of buckets) {
    const lastUsedAt = b.lastUsedAt || null
    const grade = gradeOf(
      { uses: b.uses, sessions: b.sessions.size, projects: b.projects.size, lastUsedAt },
      now,
    )
    map.set(id, {
      id,
      name: id.split('/').pop() ?? id,
      uses: b.uses,
      sessions: b.sessions.size,
      projects: b.projects.size,
      lastUsedAt,
      grade,
      active: isActiveGrade(grade),
    })
  }
  return map
}
