import { homedir } from 'node:os'
import { join } from 'node:path'

/** Rutas de Claude Code. Todo lo que el producto lee sale de aquí. */
export const claudeHome = (): string => process.env.CLAUDE_HOME ?? join(homedir(), '.claude')

export const paths = () => {
  const home = claudeHome()
  return {
    home,
    agents: join(home, 'agents'),
    commands: join(home, 'commands'),
    skills: join(home, 'skills'),
    projects: join(home, 'projects'),
    settings: join(home, 'settings.json'),
    /** Contadores de uso que el propio CLI mantiene. Ojo: vive fuera de ~/.claude. */
    usageJson: join(homedir(), '.claude.json'),
    /** Estado propio de ai-office. Nunca se mezcla con el de Claude Code. */
    ours: join(home, 'ai-office'),
  }
}

/** `/Users/x/dev/p` -> `-Users-x-dev-p`, que es como Claude Code nombra sus carpetas de proyecto. */
export const slugForCwd = (cwd: string): string => cwd.replace(/[/.]/g, '-')
