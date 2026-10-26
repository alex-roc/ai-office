import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyInstall,
  applyUninstall,
  installRelay,
  paths,
  planInstall,
  planUninstall,
  removeRelay,
  stableRelayPath,
} from '@ai-office/providers'
import type { Messages } from '../i18n.ts'
import { bold, dim, green, red, yellow } from '../ui.ts'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Ruta del relay que VIENE con el paquete (o con el monorepo). No es la que se registra en los
 * hooks: con `npx` vive en una caché que se purga. Es solo la fuente de la copia estable.
 */
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
 *
 * Lo que se registra es una copia del relay en `~/.claude/ai-office/bin/`, no el archivo del
 * paquete: sobrevive a que se purgue la caché de npx o se mueva el repositorio.
 */
export const hooksInstall = async (
  opts: { yes: boolean; dryRun: boolean },
  m: Messages,
): Promise<void> => {
  const t = m.hooks
  const settingsPath = paths().settings
  // Un settings.json que aún no existe se trata como vacío: instalar lo crea.
  const before = await readFile(settingsPath, 'utf8').catch(() => '{}\n')
  const stable = stableRelayPath()
  const plan = planInstall(before, stable)

  console.log()
  if (!plan.changed) {
    console.log(`  ${green(t.alreadyInstalled)}`)
    // Una versión nueva del paquete trae un relay nuevo: se refresca la copia estable.
    if (!opts.dryRun && (await installRelay(relayPath()))) {
      console.log(dim(`  ${t.relayUpdated(stable)}`))
    }
    console.log()
    return
  }
  console.log(`  ${t.changesIn(bold(settingsPath))}`)
  console.log()
  printDiff(plan.diff)
  console.log()
  console.log(
    dim(`  ${t.yoursUntouched[0]}\n`) +
      dim(`  ${t.yoursUntouched[1]}\n`) +
      dim(`  ${t.relayCopied(stable)}`),
  )
  console.log()

  if (opts.dryRun) {
    console.log(dim(`  ${t.dryRunDone}`))
    console.log()
    return
  }
  if (!opts.yes) {
    console.log(`  ${t.toApply(bold('ai-office hooks install --yes'))}`)
    console.log(dim(`  ${t.backupNote[0]}`))
    console.log(dim(`  ${t.backupNote[1]}`))
    console.log()
    return
  }
  // Primero el relay: así, si falla la copia, settings.json no queda apuntando a un archivo ausente.
  await installRelay(relayPath())
  await applyInstall(settingsPath, stable)
  console.log(`  ${green(t.installed)} ${t.installedNext}`)
  console.log()
}

export const hooksUninstall = async (opts: { yes: boolean }, m: Messages): Promise<void> => {
  const t = m.hooks
  const settingsPath = paths().settings
  const before = await readFile(settingsPath, 'utf8').catch(() => '{}\n')
  const plan = planUninstall(before)
  console.log()
  if (!plan.changed) {
    console.log(`  ${t.noneToRemove}`)
    console.log()
    return
  }
  printDiff(plan.diff)
  console.log()
  if (!opts.yes) {
    console.log(`  ${t.toApply(bold('ai-office hooks uninstall --yes'))}`)
    console.log()
    return
  }
  await applyUninstall(settingsPath)
  await removeRelay()
  console.log(`  ${green(t.removed)}`)
  console.log()
}

/** ¿Está el plugin de ai-office instalado? Defensivo: el formato de `installed_plugins.json` es de
 * Claude Code y ha cambiado de versión (v1: claves de primer nivel; v2: bajo `plugins`). */
const pluginInstalled = async (home: string): Promise<boolean> => {
  try {
    const raw = JSON.parse(await readFile(join(home, 'plugins', 'installed_plugins.json'), 'utf8'))
    const registry =
      raw && typeof raw === 'object' && raw.plugins && typeof raw.plugins === 'object'
        ? raw.plugins
        : raw
    return Object.keys(registry ?? {}).some((k) => k === 'ai-office' || k.startsWith('ai-office@'))
  } catch {
    return false
  }
}

/** ¿Responde un daemon de ai-office en este puerto? `/api/health` es público. */
const daemonAlive = async (port: number): Promise<boolean> => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
    })
    return ((await res.json()) as { name?: string }).name === 'ai-office'
  } catch {
    return false
  }
}

/** Eventos que el relay dejó en el spool y el daemon aún no ha recogido. */
const spoolPending = async (dir: string): Promise<number> => {
  let total = 0
  for (const f of await readdir(dir).catch(() => [])) {
    if (!f.endsWith('.ndjson') && !f.endsWith('.draining')) continue
    const text = await readFile(join(dir, f), 'utf8').catch(() => '')
    total += text.split('\n').filter((l) => l.trim()).length
  }
  return total
}

/** Comprueba que todo esté en su sitio y dice qué falta, sin arreglar nada por su cuenta. */
export const doctor = async (port: number, m: Messages): Promise<void> => {
  const t = m.doctor
  const p = paths()
  const settings = await readFile(p.settings, 'utf8').catch(() => null)
  const ok = (s: string) => console.log(`  ${green('ok')}   ${s}`)
  const warn = (s: string) => console.log(`  ${yellow('··')}   ${s}`)

  console.log()
  console.log(bold(`  ${t.title}`))
  console.log()
  console.log(`  ${t.claudeAt(dim(p.home))}`)

  const inSettings = settings?.includes('ai-office-hook') ?? false
  const plugin = await pluginInstalled(p.home)

  if (plugin) ok(t.pluginOk)
  if (inSettings) ok(t.hooksOk)
  if (!plugin && !inSettings) {
    warn(t.neither)
  }
  if (plugin && inSettings) {
    warn(t.both)
  }

  if (settings === null) {
    warn(t.settingsUnreadable)
  } else {
    // Coexistencia: se listan los hooks de terceros para que el usuario sepa con quién convive.
    try {
      const parsed = JSON.parse(settings) as { hooks?: Record<string, unknown[]> }
      const ajenos = new Set<string>()
      const propios = new Set<string>()
      for (const grupos of Object.values(parsed.hooks ?? {})) {
        for (const grupo of grupos as { hooks?: { command?: string }[] }[]) {
          for (const h of grupo.hooks ?? []) {
            const cmd = h.command ?? ''
            if (cmd.includes('ai-office-hook')) {
              propios.add(cmd.match(/node\s+'?([^'\s]+)'?/)?.[1] ?? '')
            } else if (cmd) {
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
      if (ajenos.size) ok(t.coexists(ajenos.size, [...ajenos].join(', ')))
      // Un hook registrado desde la caché de npx deja de funcionar cuando esa caché se purga.
      for (const ruta of propios) {
        if (ruta && !existsSync(ruta)) {
          warn(t.staleHook(ruta))
        }
      }
    } catch {
      warn(t.invalidJson)
    }

    if (/"disableAllHooks"\s*:\s*true/.test(settings)) {
      warn(t.hooksDisabled)
    }
  }

  if (existsSync(relayPath())) ok(t.relayAt(dim(relayPath())))
  else warn(t.relayMissing(relayPath()))

  if (await daemonAlive(port)) ok(t.daemonUp(port))
  else warn(t.daemonDown(port))

  const pending = await spoolPending(join(p.ours, 'spool'))
  if (pending > 0) {
    warn(t.spoolPending(pending))
  } else ok(t.spoolEmpty)

  console.log()
}
