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

/** Un aviso o problema con `code` estable y parámetros, para traducirlo en la interfaz. */
export interface DetalleCodigo {
  code: string
  message: string
  params?: Record<string, string | number>
}

/** De dónde sale una entidad. `local` y `managed` solo existen para servidores MCP. */
export type EntityScope = 'user' | 'project' | 'plugin' | 'builtin' | 'local' | 'managed'

export interface EntityBase {
  id: string
  kind: 'agent' | 'skill' | 'command' | 'mcp' | 'plugin' | 'project'
  name: string
  description: string
  /** `shadowed` = otra entidad de un ámbito de mayor precedencia la tapa y no se carga. */
  status: string
  problems: string[]
  /** Los mismos problemas con `code` y parámetros; un daemon más antiguo no los manda. */
  problemDetails?: DetalleCodigo[]
  /** Un daemon anterior a los ámbitos no lo manda: se lee como `user`. */
  scope?: EntityScope
  /** `<nombre>@<marketplace>` del plugin del que viene, solo con `scope: 'plugin'`. */
  plugin?: string
  /** Quién la tapa, con `status: 'shadowed'`. */
  shadowedBy?: string
  /** `readOnly`: viene de un plugin y una actualización lo sobrescribe, así que no se edita. */
  source: { path: string; realPath: string; symlink: boolean; readOnly?: boolean }
}

export interface Agent extends EntityBase {
  kind: 'agent'
  tools: string[] | null
  model: string | null
  color: string | null
  preloadedSkills: string[]
  bodyTokens: number
  /** Está en la carpeta de archivados de `agents/`: se lista para poder restaurarlo (`agent.unarchive`), no cuenta. */
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

export type McpTransport = 'stdio' | 'http' | 'sse' | 'unknown'
export type McpScope = 'user' | 'local' | 'project' | 'plugin' | 'managed'
export type SettingsScope = 'user' | 'project' | 'local'

/**
 * Un servidor MCP. Nunca trae valores de `env` ni de `headers`: solo los NOMBRES de sus claves,
 * el ejecutable y el host.
 */
export interface McpServer extends EntityBase {
  kind: 'mcp'
  scope: McpScope
  transport: McpTransport
  command?: string
  urlHost?: string
  envKeys: string[]
  headerKeys: string[]
  /** `null` = no se puede saber: Claude Code lo guarda por proyecto y el ámbito usuario no tiene. */
  enabled: boolean | null
  disabledVia?: 'disabledMcpServers' | 'disabledMcpjsonServers'
  /** Ajustes que lo desactivan (solo servidores de `.mcp.json`). */
  disabledIn?: SettingsScope[]
}

/** Un plugin instalado. Sus agentes, skills y comandos viajan en el catálogo, con su `scope: 'plugin'`. */
export interface Plugin {
  id: string
  kind?: 'plugin'
  /** `<nombre>@<marketplace>`. */
  key: string
  name: string
  marketplace: string
  version: string
  description?: string
  installPath: string
  enabled: boolean
  /** Qué ajustes lo deciden; `null` si ninguno lo nombra. */
  enabledSource: SettingsScope | 'managed' | null
  agents: string[]
  skills: string[]
  commands: string[]
  mcpServers: string[]
  /** Tokens de las descriptions de sus skills: se cargan en cada sesión mientras esté habilitado. */
  descriptionTokens: number
}

export type Grade = 'unused' | 'tried' | 'practicing' | 'certified'

export interface Activity {
  id: string
  name: string
  uses: number
  sessions: number
  projects: number
  lastUsedAt: number | null
  /** Usos por semana, 12 posiciones; la última es la semana en curso. */
  weekly: number[]
  /** Usos por proyecto (cwd abreviado `~/…` o slug). Ausente si no hay datos. */
  byProject?: Record<string, number>
  grade: Grade
  active: boolean
  /** Solo servidores MCP: usos por herramienta (el nombre sin el prefijo `mcp__servidor__`). */
  byTool?: Record<string, number>
}

/** `suelto` es el nombre antiguo de `loose`: se aceptan los dos según la versión del daemon. */
export type TipoSala = 'skill' | 'command' | 'suelto' | 'loose' | 'plugin'

/** El dato detrás de la placa de un despacho: la UI redacta la frase en su idioma. */
export interface RazonSala {
  tipo: 'skill' | 'command' | 'loose'
  nombre: string
  /** Cuántos ocupantes comparten el rasgo, de `total`. */
  cuantos: number
  total: number
}

/** Un despacho de la planta. Lo calcula el daemon a partir del grafo declarado. */
export interface Sala {
  id: string
  /** El rasgo real que une a sus ocupantes: una skill o un comando del usuario. */
  nombre: string
  tipo: TipoSala
  /** Frase ya redactada por el daemon: solo se usa si no llega `razon` (daemon más antiguo). */
  motivo: string
  /** Opcional: un daemon más antiguo no la manda. */
  razon?: RazonSala
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

/** El ámbito con el que se construyó el snapshot: solo lo del usuario, o además lo de un proyecto. */
export type ScopeSelection = { kind: 'user' } | { kind: 'project'; path: string }

/**
 * Sobre qué se midió la actividad: todo el historial, o solo las sesiones de un proyecto (en el
 * ámbito de proyecto "sin uso" quiere decir "sin uso en este proyecto").
 */
export type MeasuredOver = { kind: 'all' } | { kind: 'project'; path: string; sessions: number }

export interface KnownProject {
  path: string
  name: string
  exists: boolean
  /** Tiene `<ruta>/.claude/`. */
  hasClaudeDir: boolean
  sessions: number
}

export interface Snapshot {
  /** `plugins` y `mcpServers` los manda un daemon con soporte de plugins y MCP: se leen defensivamente. */
  catalog: {
    agents: Agent[]
    skills: Skill[]
    commands: Command[]
    mcpServers?: McpServer[]
    plugins?: Plugin[]
    roots: string[]
  }
  scope?: ScopeSelection
  /** Un daemon anterior no lo manda: se lee como `all`. */
  measuredOver?: MeasuredOver
  knownProjects?: KnownProject[]
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
    plugins?: number
    pluginsEnabled?: number
    pluginsUnused?: number
    /** Tokens de las descriptions de las skills de plugins HABILITADOS (aparte de `descriptionTokens`). */
    pluginDescriptionTokens?: number
    mcpServers?: number
    mcpUnused?: number
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
