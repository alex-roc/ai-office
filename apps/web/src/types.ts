/** Espejo en el cliente de lo que sirve el daemon. */

export type EdgeLayer = 'declared' | 'preloaded' | 'proven'

export interface EdgeEvidence {
  path: string
  line?: number
  field?: string
  excerpt?: string
}

export interface Edge {
  from: string
  to: string
  kind: string
  layer: EdgeLayer
  evidence: EdgeEvidence[]
  uses?: number
  sessions?: number
  projects?: number
  lastUsedAt?: number
  dangling?: boolean
}

export interface EntityBase {
  id: string
  kind: 'agent' | 'skill' | 'command' | 'mcp' | 'project'
  name: string
  description: string
  status: string
  problems: string[]
  source: { path: string; realPath: string; symlink: boolean }
}

export interface Agent extends EntityBase {
  kind: 'agent'
  tools: string[] | null
  model: string | null
  color: string | null
  preloadedSkills: string[]
  bodyTokens: number
  /** Está en `agents/.archivo/`: se lista para poder restaurarlo (`agent.unarchive`), no cuenta. */
  archived?: boolean
}

export interface Skill extends EntityBase {
  kind: 'skill'
  disabledForModel: boolean
  descriptionTokens: number
  bodyTokens: number
  dir: string
}

export interface Command extends EntityBase {
  kind: 'command'
}

export type Grade = 'unused' | 'tried' | 'practicing' | 'certified'

export interface Activity {
  id: string
  name: string
  uses: number
  sessions: number
  projects: number
  lastUsedAt: number | null
  grade: Grade
  active: boolean
}

export type TipoSala = 'skill' | 'command' | 'suelto'

/** Un despacho de la planta. Lo calcula el daemon a partir del grafo declarado. */
export interface Sala {
  id: string
  /** El rasgo real que une a sus ocupantes: una skill o un comando del usuario. */
  nombre: string
  tipo: TipoSala
  /** Frase citable para la placa de la puerta. */
  motivo: string
  agents: string[]
  skills: string[]
  commands: string[]
}

export interface Planta {
  salas: Sala[]
  /** Skills que cita media planta: van al archivo del pasillo. */
  archivoComun: string[]
  /** Skills que no cita ningún agente: van al depósito. */
  deposito: string[]
  /** Comandos cuyo reparto cruza varias salas. */
  tablonComun: string[]
  /** Comandos que no nombran a ningún agente. */
  tablonHuerfano: string[]
}

export interface Snapshot {
  catalog: { agents: Agent[]; skills: Skill[]; commands: Command[]; roots: string[] }
  edges: Edge[]
  /** Skills, agentes y comandos (estos desde history.jsonl y la herramienta Skill). */
  activity: Record<string, Activity>
  /** Archivos del catálogo que no se pudieron leer, con el motivo. */
  scanErrors: string[]
  vocabularyGaps: Record<string, string[]>
  planta: Planta
  mainThreadId: string
  stats: {
    agents: number
    skills: number
    commands: number
    agentsUnused: number
    skillsUnused: number
    /** Skills jubiladas: salen del denominador del ratio activo. */
    skillsRetired: number
    commandsUsed: number
    activeRatio: number
    /** Días que Claude Code conserva los transcripts (`cleanupPeriodDays`); `null` si no se sabe. */
    historyWindowDays: number | null
    descriptionTokens: number
    deadDescriptionTokens: number
    declaredAgentSkill: number
    preloadedAgentSkill: number
    provenAgentSkill: number
    mainThreadSkills: number
    historyPrompts: number
    transcriptFiles: number
    transcriptBytes: number
    buildMs: number
    builtAt: number
  }
}
