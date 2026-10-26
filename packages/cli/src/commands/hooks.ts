import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyInstall,
  applyUninstall,
  paths,
  planInstall,
  planUninstall,
} from '@ai-office/providers'
import { bold, dim, green, red, yellow } from '../ui.ts'

const here = dirname(fileURLToPath(import.meta.url))

/** Ruta absoluta del relay, que es lo que se escribe en los hooks. */
export const relayPath = (): string =>
  resolve(join(here, '..', '..', '..', 'hook-relay', 'bin', 'ai-office-hook.mjs'))

const printDiff = (diff: string) => {
  for (const line of diff.split('\n')) {
    if (line.startsWith('+')) console.log(green(`  ${line}`))
    else if (line.startsWith('-')) console.log(red(`  ${line}`))
    else console.log(dim(`  ${line}`))
  }
}

/**
 * Instala los hooks en settings.json. La vía recomendada sigue siendo el plugin, que no toca
 * ese archivo: ahí viven los permisos del usuario y sus otros hooks, y es el sitio donde más
 * daño se puede hacer. Por eso aquí se enseña el diff y se pide confirmación explícita.
 */
export const hooksInstall = async (opts: { yes: boolean; dryRun: boolean }): Promise<void> => {
  const settingsPath = paths().settings
  const before = await readFile(settingsPath, 'utf8').catch(() => '{}')
  const plan = planInstall(before, relayPath())

  console.log()
  if (!plan.changed) {
    console.log(`  ${green('Los hooks de ai-office ya están instalados.')}`)
    console.log()
    return
  }
  console.log(`  Cambios en ${bold(settingsPath)}:`)
  console.log()
  printDiff(plan.diff)
  console.log()
  console.log(
    dim('  Tus hooks actuales no se tocan: los nuestros se añaden al final de cada grupo\n') +
      dim('  y todos son async, así que no pueden bloquear ni alterar una decisión.'),
  )
  console.log()

  if (opts.dryRun) {
    console.log(dim('  (--dry-run: no se ha escrito nada)'))
    console.log()
    return
  }
  if (!opts.yes) {
    console.log(`  Para aplicarlo: ${bold('ai-office hooks install --yes')}`)
    console.log(dim('  Se guarda una copia previa en ~/.claude/ai-office/backups/ y es reversible'))
    console.log(dim('  con `ai-office hooks uninstall`.'))
    console.log()
    return
  }
  await applyInstall(settingsPath, relayPath())
  console.log(`  ${green('Hooks instalados.')} Abre una sesión nueva de Claude Code para verlos.`)
  console.log()
}

export const hooksUninstall = async (opts: { yes: boolean }): Promise<void> => {
  const settingsPath = paths().settings
  const before = await readFile(settingsPath, 'utf8').catch(() => '{}')
  const plan = planUninstall(before)
  console.log()
  if (!plan.changed) {
    console.log('  No hay hooks de ai-office en tu settings.json.')
    console.log()
    return
  }
  printDiff(plan.diff)
  console.log()
  if (!opts.yes) {
    console.log(`  Para aplicarlo: ${bold('ai-office hooks uninstall --yes')}`)
    console.log()
    return
  }
  await applyUninstall(settingsPath)
  console.log(`  ${green('Hooks retirados.')}`)
  console.log()
}

/** Comprueba que todo esté en su sitio y dice qué falta, sin arreglar nada por su cuenta. */
export const doctor = async (): Promise<void> => {
  const p = paths()
  const settings = await readFile(p.settings, 'utf8').catch(() => null)
  const ok = (s: string) => console.log(`  ${green('ok')}   ${s}`)
  const warn = (s: string) => console.log(`  ${yellow('··')}   ${s}`)

  console.log()
  console.log(bold('  ai-office · doctor'))
  console.log()
  console.log(`  Claude Code en ${dim(p.home)}`)

  if (settings === null) {
    warn('no se pudo leer settings.json')
  } else {
    const installed = settings.includes('ai-office-hook')
    if (installed) ok('hooks de ai-office instalados en settings.json')
    else warn('hooks no instalados (usa el plugin, o `ai-office hooks install`)')

    // Coexistencia: se listan los hooks de terceros para que el usuario sepa con quién convive.
    try {
      const parsed = JSON.parse(settings) as { hooks?: Record<string, unknown[]> }
      const ajenos = new Set<string>()
      for (const grupos of Object.values(parsed.hooks ?? {})) {
        for (const grupo of grupos as { hooks?: { command?: string }[] }[]) {
          for (const h of grupo.hooks ?? []) {
            const cmd = h.command ?? ''
            if (cmd && !cmd.includes('ai-office-hook')) {
              // El comando suele venir como `bash '/ruta/script.sh' arg`: interesa el nombre.
              const nombre = cmd
                .split('/')
                .pop()
                ?.replace(/['"].*$/, '')
                .trim()
              ajenos.add(nombre || cmd.slice(0, 40))
            }
          }
        }
      }
      if (ajenos.size) ok(`convive con ${ajenos.size} hooks tuyos: ${[...ajenos].join(', ')}`)
    } catch {
      warn('settings.json no es JSON válido')
    }

    if (settings.includes('"disableAllHooks": true')) {
      warn('disableAllHooks está activo: ningún hook se ejecutará')
    }
  }

  const { existsSync } = await import('node:fs')
  if (existsSync(relayPath())) ok(`relay en ${dim(relayPath())}`)
  else warn(`no encuentro el relay en ${relayPath()}`)

  console.log()
}
