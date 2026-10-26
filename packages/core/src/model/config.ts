import type { Lang } from '../graph/types.ts'

/**
 * Configuración propia de ai-office (`~/.claude/ai-office/config.json`). Nunca se mezcla con la
 * de Claude Code. Todo es opcional: sin archivo, el ámbito se decide solo (ver `resolveScope`).
 */

/** Qué familias de cosas muestra la interfaz. La interfaz aplica sus propios valores por defecto. */
export interface ShowConfig {
  agents: boolean
  skills: boolean
  commands: boolean
  plugins: boolean
  mcp: boolean
}

export interface OurConfig {
  scope?: 'user' | 'project'
  /** Ruta absoluta del proyecto (con `scope: 'project'`). */
  project?: string
  show?: Partial<ShowConfig>
  lang?: Lang
}

/** El ámbito efectivo: solo lo del usuario, o además lo de un proyecto. */
export type ScopeSelection = { kind: 'user' } | { kind: 'project'; path: string }

/** Un proyecto conocido: sale de `~/.claude.json` y de los `cwd` de los transcripts. */
export interface KnownProject {
  path: string
  name: string
  exists: boolean
  /** Tiene `<ruta>/.claude/`. */
  hasClaudeDir: boolean
  sessions: number
}
