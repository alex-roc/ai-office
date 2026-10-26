import { type Catalog, type Edge, gradeOf, isActiveGrade, makeId } from '@ai-office/core'
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

/**
 * Convierte el historial en aristas `proven`: lo que de verdad pasó, con su cuenta,
 * sus sesiones y sus proyectos distintos (que es lo que determina el grado).
 */
export const buildProvenGraph = (invocations: Invocation[], catalog: Catalog): Edge[] => {
  const skillByName = new Map(catalog.skills.map((s) => [s.name, s]))
  const agentByName = new Map(catalog.agents.map((a) => [a.name, a]))
  const buckets = new Map<
    string,
    { from: string; to: string; type: 'skill' | 'agent'; b: Bucket }
  >()

  for (const inv of invocations) {
    const from = actorId(inv.actor)
    // El nombre puede venir con prefijo de plugin (`plugin:skill`): se usa tal cual como id.
    const to =
      inv.type === 'skill'
        ? (skillByName.get(inv.target)?.id ?? makeId('skill', 'claude-code', 'plugin', inv.target))
        : (agentByName.get(inv.target)?.id ?? makeId('agent', 'claude-code', 'builtin', inv.target))
    const key = `${from}|${to}`
    let entry = buckets.get(key)
    if (!entry) {
      entry = {
        from,
        to,
        type: inv.type,
        b: { uses: 0, sessions: new Set(), projects: new Set(), lastUsedAt: 0 },
      }
      buckets.set(key, entry)
    }
    entry.b.uses += 1
    if (inv.sessionId) entry.b.sessions.add(inv.sessionId)
    entry.b.projects.add(inv.projectSlug)
    if (inv.ts > entry.b.lastUsedAt) entry.b.lastUsedAt = inv.ts
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

/** Agrega las aristas probadas por entidad de destino, para saber qué está vivo y qué no. */
export const activityByTarget = (proven: Edge[], now = Date.now()): Map<string, EntityActivity> => {
  const map = new Map<string, EntityActivity>()
  for (const e of proven) {
    const cur = map.get(e.to) ?? {
      id: e.to,
      name: e.to.split('/').pop() ?? e.to,
      uses: 0,
      sessions: 0,
      projects: 0,
      lastUsedAt: null,
      grade: 'unused' as const,
      active: false,
    }
    cur.uses += e.uses ?? 0
    cur.sessions += e.sessions ?? 0
    cur.projects = Math.max(cur.projects, e.projects ?? 0)
    if (e.lastUsedAt && (cur.lastUsedAt === null || e.lastUsedAt > cur.lastUsedAt)) {
      cur.lastUsedAt = e.lastUsedAt
    }
    map.set(e.to, cur)
  }
  for (const a of map.values()) {
    a.grade = gradeOf(
      { uses: a.uses, sessions: a.sessions, projects: a.projects, lastUsedAt: a.lastUsedAt },
      now,
    )
    a.active = isActiveGrade(a.grade)
  }
  return map
}
