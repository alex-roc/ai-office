#!/usr/bin/env node
import { censo } from './commands/censo.ts'
import { doctor, hooksInstall, hooksUninstall } from './commands/hooks.ts'
import { start } from './commands/start.ts'
import { cliVersion, resolvePort } from './env.ts'
import { bold, dim } from './ui.ts'

/**
 * Cada subcomando se declara una vez: lo que hace y lo que dice la ayuda salen del mismo sitio.
 * Para añadir uno (p. ej. `demo`), basta con una entrada nueva en `commands`.
 */
interface CliCommand {
  usage: string
  summary: string
  options?: [flag: string, summary: string][]
  run: (args: string[]) => Promise<void>
}

const flagValue = (args: string[], flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const commands: Record<string, CliCommand> = {
  start: {
    usage: 'ai-office',
    summary: 'abre la interfaz en el navegador (también `ai-office start`)',
    options: [
      ['--no-open', 'solo imprime el enlace, sin abrir el navegador'],
      ['AI_OFFICE_PORT=7377', 'puerto de la interfaz (en el plugin, la opción «Puerto»)'],
    ],
    run: (args) => start(resolvePort(), { open: !args.includes('--no-open') }),
  },
  censo: {
    usage: 'ai-office censo',
    summary: 'diagnóstico de lo que tienes y de lo que usas',
    options: [['--cartel [ruta.svg]', 'guarda el censo como imagen compartible']],
    run: async (args) => {
      // `--cartel` sin ruta guarda en `ai-office-censo.svg`.
      const i = args.indexOf('--cartel')
      const next = flagValue(args, '--cartel')
      await censo(i < 0 ? undefined : next && !next.startsWith('--') ? next : 'ai-office-censo.svg')
    },
  },
  doctor: {
    usage: 'ai-office doctor',
    summary: 'comprueba la instalación: hooks, plugin, daemon y actividad pendiente',
    run: () => doctor(resolvePort()),
  },
  hooks: {
    usage: 'ai-office hooks install|uninstall',
    summary: 'instala los hooks de actividad en settings.json (muestra el diff antes) o los retira',
    options: [
      ['--yes', 'aplica el cambio sin volver a preguntar'],
      ['--dry-run', 'solo muestra el diff'],
    ],
    run: async (args) => {
      const sub = args[0]
      const yes = args.includes('--yes')
      if (sub === 'install') await hooksInstall({ yes, dryRun: args.includes('--dry-run') })
      else if (sub === 'uninstall') await hooksUninstall({ yes })
      else {
        console.log('  uso: ai-office hooks install|uninstall [--yes] [--dry-run]')
        process.exitCode = 1
      }
    },
  },
  // demo: otro módulo registrará aquí su entrada (`ai-office demo`).
}

const help = (): string => {
  const rows = Object.values(commands).flatMap((c) => [
    `  ${bold(c.usage.padEnd(36))} ${c.summary}`,
    ...(c.options ?? []).map(([flag, text]) => dim(`      ${flag.padEnd(34)} ${text}`)),
  ])
  return `
${bold('ai-office')} - visor y editor de tu arquitectura de agentes en Claude Code

${rows.join('\n')}
  ${bold('ai-office --version'.padEnd(36))} muestra la versión

${dim('Todo se lee de ~/.claude (o de CLAUDE_CONFIG_DIR). Nada sale de esta máquina.')}
`
}

const main = async (): Promise<void> => {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === '--version' || cmd === '-v') {
    console.log(cliVersion())
    return
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(help())
    return
  }
  // Sin subcomando (o solo con opciones, como `ai-office --no-open`) se arranca la interfaz.
  if (cmd === undefined || cmd.startsWith('-')) {
    await commands.start?.run(cmd === undefined ? [] : [cmd, ...rest])
    return
  }
  const command = commands[cmd]
  if (!command) {
    console.log(help())
    process.exitCode = 1
    return
  }
  await command.run(rest)
}

main().catch((err: unknown) => {
  // Un error esperado (puerto ocupado, ajustes ilegibles) es un mensaje, no un stack trace.
  console.error(
    process.env.AI_OFFICE_DEBUG
      ? ((err as Error).stack ?? String(err))
      : `error: ${(err as Error).message ?? String(err)}`,
  )
  process.exitCode = 1
})
