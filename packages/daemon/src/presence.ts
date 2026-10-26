import type { OfficeEvent, SessionState } from '@ai-office/core'

/**
 * Máquina de estados de presencia: a partir de la secuencia de `OfficeEvent` de una sesión,
 * mantiene qué está haciendo cada una ahora mismo. Es el estado que pinta la escena en vivo.
 *
 * Ojo con `Stop`: no dispara si el usuario interrumpe a Claude a mitad de una respuesta, así que
 * una sesión puede quedarse "trabajando" para siempre en nuestro estado aunque el proceso real ya
 * haya terminado. `reconcile` es el remedio: se le pasa la lista de sesiones vivas según
 * `claude agents --json` y cierra las que ya no están.
 */

/** Cuánto se queda visible una sesión terminada antes de olvidarla (para que se vea cómo acabó). */
const ENDED_TTL_MS = 10 * 60 * 1000

const emptyAgents = (): SessionState['agents'] => ({})

const ensureSession = (sessions: Map<string, SessionState>, event: OfficeEvent): SessionState => {
  const existing = sessions.get(event.sessionId)
  if (existing) return existing
  const created: SessionState = {
    sessionId: event.sessionId,
    cwd: event.cwd,
    startedAt: event.ts,
    lastEventAt: event.ts,
    status: 'starting',
    currentTool: null,
    agents: emptyAgents(),
  }
  sessions.set(event.sessionId, created)
  return created
}

export const createPresenceStore = () => {
  const sessions = new Map<string, SessionState>()
  // Cuándo pasó cada sesión a `ended`, con el reloj de esta máquina: `lastEventAt` es la hora del
  // evento (que puede ser de un spool de hace días) y no dice cuánto lleva terminada.
  const endedAt = new Map<string, number>()
  const markEnded = (s: SessionState): void => {
    if (s.status !== 'ended') endedAt.set(s.sessionId, Date.now())
    s.status = 'ended'
  }

  /** Aplica un evento normalizado y devuelve el estado resultante de su sesión. */
  const apply = (event: OfficeEvent): SessionState => {
    const s = ensureSession(sessions, event)
    s.lastEventAt = event.ts
    if (event.cwd) s.cwd = event.cwd

    const isAgent = event.actor.kind === 'agent' && event.actor.agentId
    const agentId = isAgent ? (event.actor.agentId as string) : null

    switch (event.type) {
      case 'session.start':
        s.status = 'starting'
        s.startedAt = event.ts
        break
      case 'session.end':
        markEnded(s)
        break
      case 'turn.start':
        s.status = 'thinking'
        break
      case 'turn.end':
        s.status = 'idle'
        s.currentTool = null
        break
      case 'tool.start':
      case 'skill.invoked': {
        const label =
          event.type === 'skill.invoked' ? `skill:${event.skill ?? '?'}` : (event.tool ?? null)
        if (agentId) {
          const agent = s.agents[agentId]
          if (agent) agent.currentTool = label
        } else {
          s.status = 'working'
          s.currentTool = label
        }
        break
      }
      case 'tool.end':
      case 'tool.failed':
        if (agentId) {
          const agent = s.agents[agentId]
          if (agent) agent.currentTool = null
        } else {
          s.status = 'thinking'
          s.currentTool = null
        }
        break
      case 'agent.start':
        if (agentId) {
          s.agents[agentId] = {
            agentType: event.actor.agentType ?? 'unknown',
            startedAt: event.ts,
            currentTool: null,
          }
        }
        break
      case 'agent.stop':
        if (agentId) delete s.agents[agentId]
        break
      case 'permission.requested':
        s.status = 'waiting-permission'
        break
      case 'permission.denied':
        s.status = 'thinking'
        break
      case 'compact.start':
        s.status = 'compacting'
        break
      case 'compact.end':
        s.status = 'thinking'
        break
      // task.created, task.completed, notify, config.changed: informativos, no cambian el status.
    }
    return s
  }

  const get = (sessionId: string): SessionState | undefined => sessions.get(sessionId)

  /**
   * Olvida las sesiones terminadas hace más de `ttlMs`. Sin esto el mapa solo crece (cada sesión
   * que alguna vez existió) y la interfaz recibe la lista entera en cada evento.
   */
  const purge = (now = Date.now(), ttlMs = ENDED_TTL_MS): number => {
    let removed = 0
    for (const [id, s] of sessions) {
      if (s.status !== 'ended') continue
      if (now - (endedAt.get(id) ?? now) > ttlMs) {
        sessions.delete(id)
        endedAt.delete(id)
        removed++
      }
    }
    return removed
  }

  const list = (): SessionState[] => {
    purge()
    return [...sessions.values()]
  }

  /**
   * Cierra las sesiones que ya no aparecen en `liveSessionIds` (típicamente `claude agents
   * --json`). Devuelve las que cambiaron, para que quien orqueste emita sus propios eventos si
   * hace falta. Una sesión ya `ended` no se vuelve a tocar.
   */
  const reconcile = (liveSessionIds: string[]): SessionState[] => {
    const live = new Set(liveSessionIds)
    const closed: SessionState[] = []
    for (const s of sessions.values()) {
      if (s.status === 'ended' || live.has(s.sessionId)) continue
      markEnded(s)
      closed.push(s)
    }
    return closed
  }

  return { apply, get, list, reconcile, purge }
}

export type PresenceStore = ReturnType<typeof createPresenceStore>
