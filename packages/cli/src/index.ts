#!/usr/bin/env node
import { censo } from './commands/censo.ts'
import { doctor, hooksInstall, hooksUninstall } from './commands/hooks.ts'
import { start } from './commands/start.ts'
import { bold, dim } from './ui.ts'

const help = `
${bold('ai-office')} - visor y editor de tu arquitectura de agentes en Claude Code

  ${bold('ai-office')}          abre la interfaz en el navegador
  ${bold('ai-office censo')}    diagnostico de lo que tienes y de lo que usas
    ${dim('--cartel [ruta.svg]')}  guarda el censo como imagen compartible
  ${bold('ai-office doctor')}   comprueba la instalacion y con que hooks convive
  ${bold('ai-office hooks install')}    instala los hooks de actividad (muestra el diff antes)
  ${bold('ai-office hooks uninstall')}  los retira

${dim('Todo se lee de ~/.claude. Nada sale de esta maquina.')}
`

const main = async (): Promise<void> => {
  const cmd = process.argv[2]
  switch (cmd) {
    case 'censo': {
      // `--cartel ruta.svg` guarda el censo como una imagen compartible.
      const i = process.argv.indexOf('--cartel')
      await censo(i > 0 ? (process.argv[i + 1] ?? 'ai-office-censo.svg') : undefined)
      break
    }
    case 'hooks': {
      const sub = process.argv[3]
      const yes = process.argv.includes('--yes')
      if (sub === 'install') await hooksInstall({ yes, dryRun: process.argv.includes('--dry-run') })
      else if (sub === 'uninstall') await hooksUninstall({ yes })
      else {
        console.log('  uso: ai-office hooks install|uninstall [--yes] [--dry-run]')
        process.exitCode = 1
      }
      break
    }
    case 'doctor':
      await doctor()
      break
    case undefined:
    case 'start':
      await start(Number(process.env.AI_OFFICE_PORT ?? 7377))
      break
    default:
      console.log(help)
      if (cmd !== '--help' && cmd !== '-h') process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).stack ?? String(err))
  process.exitCode = 1
})
