/**
 * Genera el snapshot de la instalación de demostración, el que sirve la demo estática de la
 * página del proyecto (`VITE_DEMO=1`).
 *
 *   node scripts/demo-snapshot.ts <directorio>
 *
 * Escribe dos: `snapshot.json` (ámbito usuario: todo el historial, el más rico) y
 * `snapshot-project.json` (ámbito del proyecto acme-web: el agente tapado, el `.mcp.json` del
 * proyecto y la medición limitada a sus sesiones). La demo estática alterna entre los dos con el
 * selector de ámbito, igual que el daemon reconstruye el snapshot al cambiarlo.
 *
 * Escribe la demo en un directorio temporal, apunta las rutas de Claude Code ahí y construye el
 * snapshot con el MISMO código que usa el daemon: la demo estática no es una maqueta, es la
 * interfaz real leyendo una instalación ficticia.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { writeDemoHome } from '../packages/cli/src/demo/synth.ts'

const outDir = resolve(process.argv[2] ?? '.')
// realpath: en macOS el tmp cuelga de un symlink (/var -> /private/var) y, sin resolverlo, cada
// archivo de la demo se vería como un enlace simbólico (y no se podría archivar).
const home = await realpath(await mkdtemp(join(tmpdir(), 'ai-office-demo-')))
try {
  await writeDemoHome(home)
  process.env.CLAUDE_CONFIG_DIR = home
  process.env.CLAUDE_HOME = home
  // Import diferido: las rutas se leen al llamar, pero así nadie se adelanta a la variable.
  const { buildSnapshot } = await import('../packages/daemon/src/snapshot.ts')
  const real = await realpath(home)
  // Las rutas absolutas del directorio temporal no dicen nada a quien mira la demo: se reescriben
  // como si la instalación viviera en ~/.claude, y los proyectos ficticios (bajo
  // `<home>/demo-projects/`) como si estuvieran en `~/dev/` (primero, o quedarían como
  // `~/.claude/demo-projects/...`). En macOS el tmp es un symlink: se sustituyen las dos formas.
  // Claude Code nombra las carpetas de transcripts con la ruta del proyecto (`/a/b` -> `-a-b`):
  // también llevan el tmp y se reescriben a la forma de `~/dev`.
  const slug = (ruta: string): string => ruta.replace(/[/.]/g, '-')
  const limpiar = (texto: string): string =>
    texto
      .split(slug(`${real}/demo-projects`))
      .join('-home-you-dev')
      .split(slug(`${home}/demo-projects`))
      .join('-home-you-dev')
      .split(`${real}/demo-projects`)
      .join('~/dev')
      .split(`${home}/demo-projects`)
      .join('~/dev')
      .split(real)
      .join('~/.claude')
      .split(home)
      .join('~/.claude')
  await mkdir(outDir, { recursive: true })
  const ambitos = [
    { archivo: 'snapshot.json', scope: { kind: 'user' as const } },
    {
      archivo: 'snapshot-project.json',
      scope: { kind: 'project' as const, path: join(real, 'demo-projects', 'acme-web') },
    },
  ]
  for (const { archivo, scope } of ambitos) {
    const text = limpiar(JSON.stringify(await buildSnapshot(scope)))
    await writeFile(join(outDir, archivo), text)
    console.log(
      `snapshot de la demo -> ${join(outDir, archivo)} (${(text.length / 1024).toFixed(0)} KB)`,
    )
  }
} finally {
  await rm(home, { recursive: true, force: true })
}
