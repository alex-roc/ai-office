/**
 * Modelo de dominio. Puro: sin I/O, sin rutas absolutas en los identificadores.
 * Los nombres son los reales de Claude Code (agente, skill, comando, servidor MCP),
 * nunca un vocabulario paralelo.
 */

export type EntityKind = 'agent' | 'skill' | 'command' | 'mcp' | 'project' | 'tool'

/** De dónde sale una entidad. La precedencia efectiva es project > user > plugin. */
export type Scope = 'user' | 'project' | 'plugin' | 'builtin'

/**
 * Identificador canónico y estable: `kind:provider/scope/nombre`.
 * No incluye la ruta absoluta para que sea compartible entre máquinas.
 */
export type EntityId = string

export const makeId = (kind: EntityKind, provider: string, scope: Scope, name: string): EntityId =>
  `${kind}:${provider}/${scope}/${name}`

/** Procedencia en disco. `realPath` es el destino tras resolver symlinks: ahí se escribe. */
export interface Source {
  path: string
  realPath: string
  mtimeMs: number
  size: number
  /** El archivo visible es un symlink (el caso de ~/.claude/skills -> ~/.agents/skills). */
  symlink: boolean
  /** Todas las rutas desde las que la misma entidad es visible. */
  projections: string[]
  readOnly: boolean
}

export type EntityStatus =
  /** Existe en disco y es la que Claude Code carga. */
  | 'active'
  /** Otra entidad del mismo nombre en un scope de mayor precedencia la tapa. */
  | 'shadowed'
  /** Aparece en los contadores de uso pero ya no existe en disco. */
  | 'ghost'
  /** Symlink cuyo destino desapareció. */
  | 'orphan-link'
  /** El archivo existe pero su frontmatter no valida. */
  | 'invalid'

/**
 * Un problema de forma detectado al leer un archivo. `message` es el texto en inglés (el
 * respaldo); `code` + `params` permiten a la interfaz redactarlo en su idioma.
 */
export interface EntityProblem {
  code: string
  message: string
  params?: Record<string, string | number>
}

export interface EntityBase {
  id: EntityId
  kind: EntityKind
  /** Nombre tal y como Claude Code lo usa. */
  name: string
  scope: Scope
  provider: string
  description: string
  source: Source
  status: EntityStatus
  shadowedBy?: EntityId
  /** Problemas de forma detectados al leer. Nunca impiden mostrar la entidad. Son los `message`
   * (en inglés) de `problemDetails`, en el mismo orden. */
  problems: string[]
  /** Los mismos problemas con `code` y parámetros, para traducirlos en la interfaz. */
  problemDetails?: EntityProblem[]
  /**
   * Línea del archivo en la que empieza el cuerpo. Se suma a las posiciones halladas
   * dentro del cuerpo para que toda evidencia cite una línea real y abrible del archivo.
   */
  bodyStartLine: number
}

export interface Agent extends EntityBase {
  kind: 'agent'
  /** `tools:` del frontmatter. `null` = hereda todas. */
  tools: string[] | null
  model: string | null
  /** `color:` del frontmatter. Vacío en la inmensa mayoría de instalaciones. */
  color: string | null
  /** `skills:` del frontmatter: precarga del contenido completo al arrancar. */
  preloadedSkills: string[]
  /** Cuerpo del prompt, sin el frontmatter. */
  body: string
  bodyTokens: number
  /**
   * Está en `agents/.archive/` (o en el antiguo `agents/.archivo/`): Claude Code no lo carga. Se lista para poder restaurarlo, pero no
   * entra en grafos, despachos ni estadísticas.
   */
  archived?: boolean
}

export interface Skill extends EntityBase {
  kind: 'skill'
  allowedTools: string[] | null
  /** `disable-model-invocation: true` la retira de la elección autónoma del modelo. */
  disabledForModel: boolean
  metadata: Record<string, unknown> | null
  /** Directorio del skill (un skill es una carpeta con SKILL.md y anexos). */
  dir: string
  body: string
  /** Coste de tener la skill instalada: su description se carga en cada sesión. */
  descriptionTokens: number
  /** Coste de invocarla: el cuerpo entra en contexto. */
  bodyTokens: number
}

export interface Command extends EntityBase {
  kind: 'command'
  argumentHint: string | null
  body: string
}

export interface McpServer extends EntityBase {
  kind: 'mcp'
  transport: string
}

export interface Project extends EntityBase {
  kind: 'project'
  /** Directorio real de trabajo. */
  cwd: string
  /** Nombre del directorio bajo ~/.claude/projects (cwd con los `/` convertidos en `-`). */
  slug: string
  sessions: number
  lastActiveAt: number | null
}

export type Entity = Agent | Skill | Command | McpServer | Project

export interface Catalog {
  agents: Agent[]
  skills: Skill[]
  commands: Command[]
  mcpServers: McpServer[]
  projects: Project[]
  scannedAt: number
  /** Rutas leídas, para poder enseñar al usuario de dónde sale cada cosa. */
  roots: string[]
}

export const emptyCatalog = (): Catalog => ({
  agents: [],
  skills: [],
  commands: [],
  mcpServers: [],
  projects: [],
  scannedAt: Date.now(),
  roots: [],
})
