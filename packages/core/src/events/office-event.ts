/**
 * Contrato de eventos entre el hook, el daemon y la interfaz.
 *
 * Es una unión versionada: todo productor escribe `v` y todo consumidor tolera valores que no
 * conoce. Los hooks de Claude Code son el productor principal, pero el lanzador de sesiones
 * produce exactamente los mismos eventos, para que la escena no distinga entre una sesión que
 * abrió el usuario y una que lanzó ai-office.
 */

export const OFFICE_EVENT_VERSION = 1

export type OfficeEventType =
  | 'session.start'
  | 'session.end'
  | 'turn.start'
  | 'turn.end'
  | 'tool.start'
  | 'tool.end'
  | 'tool.failed'
  | 'skill.invoked'
  | 'agent.start'
  | 'agent.stop'
  | 'permission.requested'
  | 'permission.denied'
  | 'task.created'
  | 'task.completed'
  | 'compact.start'
  | 'compact.end'
  | 'notify'
  | 'config.changed'

/** Quién actúa: el hilo principal de una sesión o un subagente concreto. */
export interface EventActor {
  kind: 'main' | 'agent'
  /** `agent_type` del hook: `Explore`, `general-purpose`, o el nombre de un agente propio. */
  agentType?: string
  agentId?: string
}

export interface OfficeEvent {
  v: number
  /** Monotónico por daemon; permite reanudar un cliente sin perder eventos. */
  seq: number
  type: OfficeEventType
  ts: number
  sessionId: string
  /** Directorio de trabajo: identifica el proyecto en el que ocurre. */
  cwd: string | null
  actor: EventActor
  /** Nombre de la herramienta, para los eventos `tool.*`. */
  tool?: string
  toolUseId?: string
  /** Nombre de la skill, para `skill.invoked`. */
  skill?: string
  /** Identificador de la entidad del catálogo a la que apunta, si se pudo resolver. */
  entityId?: string
  /** Texto corto y ya recortado. Nunca lleva el contenido completo de una herramienta. */
  detail?: string
  /** Cierto cuando el evento viene de rellenar el pasado, no de algo que ocurre ahora. */
  replayed?: boolean
}

export interface SessionState {
  sessionId: string
  cwd: string | null
  startedAt: number
  lastEventAt: number
  /** Lo que el actor principal está haciendo ahora mismo. */
  status:
    | 'starting'
    | 'idle'
    | 'thinking'
    | 'working'
    | 'waiting-permission'
    | 'compacting'
    | 'ended'
  currentTool: string | null
  /** Subagentes vivos, por `agentId`. */
  agents: Record<string, { agentType: string; startedAt: number; currentTool: string | null }>
}

export const isOfficeEvent = (value: unknown): value is OfficeEvent => {
  if (!value || typeof value !== 'object') return false
  const e = value as Partial<OfficeEvent>
  return typeof e.type === 'string' && typeof e.ts === 'number' && typeof e.sessionId === 'string'
}
