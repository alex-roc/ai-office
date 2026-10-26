import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Directorio de ajustes gestionados (`managed-settings.json`, `managed-mcp.json`). `CLAUDE_MANAGED_DIR`
 * es nuestra, para probar sin depender de lo que tenga instalada la máquina.
 */
export const managedDir = (): string => {
  if (process.env.CLAUDE_MANAGED_DIR) return process.env.CLAUDE_MANAGED_DIR
  // Con `CLAUDE_HOME` (una copia de prueba o la demo) no se mira lo gestionado de la máquina real.
  if (process.env.CLAUDE_HOME) return join(process.env.CLAUDE_HOME, 'managed')
  if (process.platform === 'darwin') return '/Library/Application Support/ClaudeCode'
  if (process.platform === 'win32') return 'C:\\Program Files\\ClaudeCode'
  return '/etc/claude-code'
}

/**
 * Directorio de configuración de Claude Code. Precedencia:
 *  1. `CLAUDE_HOME`: la nuestra, para probar contra una copia sin tocar nada real.
 *  2. `CLAUDE_CONFIG_DIR`: la variable oficial de Claude Code. Quien la usa (varias cuentas,
 *     contenedores) tiene TODO su estado ahí, incluido `.claude.json`.
 *  3. `~/.claude`.
 */
export const claudeHome = (): string =>
  process.env.CLAUDE_HOME || process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')

const customHome = (): boolean => Boolean(process.env.CLAUDE_HOME || process.env.CLAUDE_CONFIG_DIR)

export const paths = () => {
  const home = claudeHome()
  return {
    home,
    agents: join(home, 'agents'),
    commands: join(home, 'commands'),
    skills: join(home, 'skills'),
    projects: join(home, 'projects'),
    settings: join(home, 'settings.json'),
    /**
     * Datos de plugins (`installed_plugins.json`, `cache/`). Lo mueve `CLAUDE_CODE_PLUGIN_CACHE_DIR`,
     * salvo con `CLAUDE_HOME` (probando contra una copia no se debe salir a la instalación real).
     */
    plugins:
      (process.env.CLAUDE_HOME ? undefined : process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR) ||
      join(home, 'plugins'),
    managed: managedDir(),
    /**
     * Contadores de uso que el propio CLI mantiene. Por defecto vive FUERA de `~/.claude`
     * (`~/.claude.json`); con un directorio de configuración propio vive dentro de él.
     */
    usageJson: customHome() ? join(home, '.claude.json') : join(homedir(), '.claude.json'),
    /** Estado propio de ai-office. Nunca se mezcla con el de Claude Code. */
    ours: join(home, 'ai-office'),
  }
}

/** Carpeta (dentro de `agents/`) donde ai-office aparta los agentes archivados. */
export const ARCHIVE_DIR = '.archive'

/** Nombre antiguo de esa carpeta (versiones en español): se sigue leyendo y restaurando. */
export const LEGACY_ARCHIVE_DIR = '.archivo'

/** `/Users/x/dev/p` -> `~/dev/p` (solo si cuelga del home; cualquier otra ruta queda como está). */
export const abbreviateCwd = (cwd: string): string => {
  const home = homedir()
  if (cwd === home) return '~'
  return cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd
}

/** `/Users/x/dev/p` -> `-Users-x-dev-p`, que es como Claude Code nombra sus carpetas de proyecto. */
export const slugForCwd = (cwd: string): string => cwd.replace(/[/.]/g, '-')
