import { readFileSync } from 'node:fs'
import { type Messages, messagesFor } from './i18n.ts'

/** Puerto por defecto de la interfaz local. */
export const DEFAULT_PORT = 7377

/**
 * Puerto de la interfaz. `AI_OFFICE_PORT` manda; dentro del plugin, el `userConfig.port` que el
 * usuario fijó llega como `CLAUDE_PLUGIN_OPTION_PORT` (convención de Claude Code para las
 * opciones de un plugin: `CLAUDE_PLUGIN_OPTION_<CLAVE>`). Un valor que no es un puerto válido es
 * un error con mensaje, no un `NaN` que acaba en un `listen` incomprensible.
 */
export const resolvePort = (
  env: NodeJS.ProcessEnv = process.env,
  t: Messages = messagesFor('en'),
): number => {
  const raw = env.AI_OFFICE_PORT || env.CLAUDE_PLUGIN_OPTION_PORT
  if (!raw) return DEFAULT_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(t.invalidPort(raw))
  }
  return port
}

/** Versión del paquete. Se busca el `package.json` de `ai-office` tanto en desarrollo como en el
 * `dist` (que cuelga cuatro niveles más abajo, ver `scripts/build.sh`). */
export const cliVersion = (t: Messages = messagesFor('en')): string => {
  for (const rel of ['../package.json', '../../../../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as {
        name?: string
        version?: string
      }
      if (pkg.name === 'ai-office' && pkg.version) return pkg.version
    } catch {
      /* probar la siguiente ruta */
    }
  }
  return t.unknownVersion
}
