/**
 * Modelo de dominio. Puro: sin I/O, sin rutas absolutas en los identificadores.
 * Los nombres son los reales de Claude Code (agente, skill, comando, servidor MCP),
 * nunca un vocabulario paralelo.
 */

export type EntityKind = 'agent' | 'skill' | 'command' | 'mcp' | 'plugin' | 'project' | 'tool'

/**
 * De dónde sale una entidad. Agentes: project > user > plugin; skills: user > project (los de
 * plugin van con prefijo y no compiten). `local` y `managed` solo existen para servidores MCP
 * (`~/.claude.json` por proyecto, y el directorio de ajustes gestionados).
 */
export type Scope = 'user' | 'project' | 'plugin' | 'builtin' | 'local' | 'managed'

/**
 * Identificador canónico y estable: `kind:provider/scope/nombre`.
 * No incluye la ruta absoluta para que sea compartible entre máquinas.
 */
export type EntityId = string

export const makeId = (kind: EntityKind, provider: string, scope: Scope, name: string): EntityId =>
  `${kind}:${provider}/${scope}/${name}`

/** Id de un plugin: `plugin:claude-code/plugin/<nombre>@<marketplace>`. */
export const pluginId = (key: string): EntityId => `plugin:claude-code/plugin/${key}`

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
  /** Plugin del que viene (`<nombre>@<marketplace>`), solo si `scope` es `plugin`. */
  plugin?: string
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

/** Dónde está declarado un servidor MCP (ver docs/CLAUDE-CODE-CONFIG.md). */
export type McpScope = 'user' | 'local' | 'project' | 'plugin' | 'managed'

export type McpTransport = 'stdio' | 'http' | 'sse' | 'unknown'

/**
 * Un servidor MCP. NUNCA lleva valores de `env`, de `headers`, argumentos ni URLs completas: son
 * secretos habituales. Solo el ejecutable, el host y los NOMBRES de las claves.
 */
export interface McpServer extends EntityBase {
  kind: 'mcp'
  scope: McpScope
  transport: McpTransport
  /** Solo el ejecutable (sin argumentos ni directorios). */
  command?: string
  /** Solo el host (sin ruta, consulta ni credenciales). */
  urlHost?: string
  envKeys: string[]
  headerKeys: string[]
  /**
   * `false` si está desactivado (lista del proyecto o plugin deshabilitado). `null` cuando no se
   * puede saber: Claude Code guarda esa lista por proyecto y el ámbito usuario no tiene proyecto.
   */
  enabled: boolean | null
  disabledVia?: 'disabledMcpServers' | 'disabledMcpjsonServers'
  /** Ajustes (user/project/local) cuya lista `disabledMcpjsonServers` lo nombra; solo `.mcp.json`. */
  disabledIn?: PluginSettingsScope[]
}

/** Quién fija `enabledPlugins` o las listas de MCP desactivados: un archivo de ajustes. */
export type PluginSettingsScope = 'user' | 'project' | 'local'

export type PluginEnabledSource = PluginSettingsScope | 'managed'

/**
 * Un plugin instalado (`~/.claude/plugins/installed_plugins.json`). Sus agentes, skills y
 * comandos viajan en `catalog.agents|skills|commands` con `scope: 'plugin'`; aquí solo sus ids.
 */
export interface Plugin {
  id: EntityId
  /** `<nombre>@<marketplace>`: la clave de `enabledPlugins`. */
  key: string
  name: string
  marketplace: string
  version: string
  description?: string
  installPath: string
  enabled: boolean
  /** Qué ajustes lo deciden (el de mayor precedencia que nombra la clave); `null` si ninguno. */
  enabledSource: PluginEnabledSource | null
  agents: EntityId[]
  skills: EntityId[]
  commands: EntityId[]
  mcpServers: EntityId[]
  /** Coste en tokens de las descriptions de sus skills (se cargan en cada sesión). */
  descriptionTokens: number
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
  plugins: Plugin[]
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
  plugins: [],
  projects: [],
  scannedAt: Date.now(),
  roots: [],
})
