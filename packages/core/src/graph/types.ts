import type { EntityId } from '../model/entity.ts'

/**
 * Las cuatro capas de acoplamiento. El orden importa: manda visualmente la acreditada,
 * porque es la única respaldada por hechos y no por intenciones.
 */
export type EdgeLayer =
  /** Escrito en la prosa del cuerpo: "antes de trabajar, lee tal skill". Nadie lo garantiza. */
  | 'declared'
  /** `skills:` en el frontmatter: se carga siempre, cueste lo que cueste. */
  | 'preloaded'
  /** Demostrado en los transcripts: lo hizo, N veces, la última el X. */
  | 'proven'

/** Qué campo real respalda la arista. Ninguna arista es decorativa. */
export type EdgeKind =
  | 'agent-uses-skill'
  | 'agent-has-tool'
  | 'agent-uses-mcp'
  | 'agent-delegates-agent'
  | 'command-invokes-agent'
  | 'command-invokes-skill'
  | 'skill-references-skill'
  | 'skill-declares-client'

export interface EdgeEvidence {
  /** Archivo del que sale la afirmación. */
  path: string
  /** Línea 1-indexada, cuando la arista viene de la prosa. */
  line?: number
  /** Campo del frontmatter, cuando viene de ahí. */
  field?: string
  /** El texto literal que la justifica, recortado. */
  excerpt?: string
}

export interface Edge {
  from: EntityId
  to: EntityId
  kind: EdgeKind
  layer: EdgeLayer
  evidence: EdgeEvidence[]
  /** Solo en la capa `proven`. */
  uses?: number
  sessions?: number
  projects?: number
  lastUsedAt?: number
  /** La entidad de destino no existe en el catálogo: cita rota. */
  dangling?: boolean
}

export interface Graph {
  edges: Edge[]
}

export const edgeKey = (e: Pick<Edge, 'from' | 'to' | 'kind' | 'layer'>): string =>
  `${e.layer}|${e.kind}|${e.from}|${e.to}`

/**
 * Grado de un par agente↔skill. Saturante a propósito: el uso nº 4 no vale más que el nº 50.
 * Solo suben la variedad (otro proyecto, otra sesión) y la vigencia.
 */
export type Grade = 'unused' | 'tried' | 'practicing' | 'certified'

export const CERTIFICATION_TTL_DAYS = 90

export interface GradeInput {
  uses: number
  sessions: number
  projects: number
  lastUsedAt: number | null
}

export const gradeOf = (input: GradeInput, now = Date.now()): Grade => {
  if (input.uses <= 0) return 'unused'
  const fresh =
    input.lastUsedAt !== null &&
    now - input.lastUsedAt <= CERTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000
  if (input.sessions >= 3 && input.projects >= 2 && fresh) return 'certified'
  if (input.sessions >= 3) return 'practicing'
  return 'tried'
}

/** Cómo se dice cada grado en la interfaz y en el censo: un solo sitio para las dos. */
export const GRADE_LABEL: Record<Grade, string> = {
  unused: 'sin estrenar',
  tried: 'estrenada',
  practicing: 'en práctica',
  certified: 'acreditada',
}

/** Cuenta como activo lo que está en práctica o acreditado. */
export const isActiveGrade = (g: Grade): boolean => g === 'practicing' || g === 'certified'
