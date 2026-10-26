/**
 * Genera el snapshot de la instalación de demostración, el que sirve la demo estática de la
 * página del proyecto (`VITE_DEMO=1`).
 *
 *   node scripts/demo-snapshot.ts salida.json
 *
 * Escribe la demo en un directorio temporal, apunta las rutas de Claude Code ahí y construye el
 * snapshot con el MISMO código que usa el daemon: la demo estática no es una maqueta, es la
 * interfaz real leyendo una instalación ficticia.
 */
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { writeDemoHome } from '../packages/cli/src/demo/synth.ts'

const out = resolve(process.argv[2] ?? 'snapshot.json')
// realpath: en macOS el tmp cuelga de un symlink (/var -> /private/var) y, sin resolverlo, cada
// archivo de la demo se vería como un enlace simbólico (y no se podría archivar).
const home = await realpath(await mkdtemp(join(tmpdir(), 'ai-office-demo-')))
try {
  await writeDemoHome(home)
  process.env.CLAUDE_CONFIG_DIR = home
  process.env.CLAUDE_HOME = home
  // Import diferido: las rutas se leen al llamar, pero así nadie se adelanta a la variable.
  const { buildSnapshot } = await import('../packages/daemon/src/snapshot.ts')
  const snapshot = await buildSnapshot()
  // Las rutas absolutas del directorio temporal no dicen nada a quien mira la demo: se
  // reescriben como si la instalación viviera en ~/.claude.
  // En macOS el tmp es un symlink (/var -> /private/var): los realPath llevan la forma resuelta.
  const real = await realpath(home)
  const text = JSON.stringify(snapshot).split(real).join('~/.claude').split(home).join('~/.claude')
  await writeFile(out, text)
  console.log(`snapshot de la demo -> ${out} (${(text.length / 1024).toFixed(0)} KB)`)
} finally {
  await rm(home, { recursive: true, force: true })
}
