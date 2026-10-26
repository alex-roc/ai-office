import { rmSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeDemoHome } from '../demo/synth.ts'
import { dim } from '../ui.ts'
import { start } from './start.ts'

/**
 * `ai-office demo`: la interfaz completa contra una instalación ficticia, en un directorio
 * temporal que se borra al salir.
 *
 * Sirve para probar TODO, escrituras incluidas, sin tocar `~/.claude`: crear un comando desde el
 * lienzo, jubilar una skill o archivar un agente escriben en la copia. Por eso escucha en otro
 * puerto por defecto (7379): así puede convivir con un `ai-office` real abierto a la vez.
 */
export const demo = async (port: number, opts: { open?: boolean } = {}): Promise<void> => {
  const home = await mkdtemp(join(tmpdir(), 'ai-office-demo-'))
  await writeDemoHome(home)
  // Las rutas de Claude Code se leen en cada llamada a `paths()`: basta con fijarlas antes de
  // arrancar. CLAUDE_HOME manda sobre CLAUDE_CONFIG_DIR; se fijan las dos por claridad.
  process.env.CLAUDE_CONFIG_DIR = home
  process.env.CLAUDE_HOME = home
  console.log()
  console.log(dim(`  instalación de demostración en ${home} (se borra al salir)`))
  const limpiar = () => rm(home, { recursive: true, force: true }).catch(() => {})
  process.once('exit', () => {
    // `exit` no espera promesas: el borrado síncrono es el único que llega a ejecutarse.
    try {
      rmSync(home, { recursive: true, force: true })
    } catch {
      /* el sistema limpia su tmp tarde o temprano */
    }
  })
  try {
    await start(port, opts)
  } catch (err) {
    await limpiar()
    throw err
  }
}
