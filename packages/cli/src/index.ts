#!/usr/bin/env node
import type { Lang } from '@ai-office/core'
import type { ScopeRequest } from '@ai-office/providers'
import { census } from './commands/census.ts'
import { demo } from './commands/demo.ts'
import { doctor, hooksInstall, hooksUninstall } from './commands/hooks.ts'
import { start } from './commands/start.ts'
import { cliVersion, configuredLang, extractScopeFlags, resolvePort } from './env.ts'
import { type Messages, messagesFor, resolveLang } from './i18n.ts'
import { bold, dim } from './ui.ts'

/** Lo que cada subcomando recibe: el idioma resuelto y sus mensajes. */
interface Ctx {
  lang: Lang
  t: Messages
  /** `--project` y `--scope`: se combinan con `config.json` en `resolveScope`. */
  scope: Pick<ScopeRequest, 'scope' | 'project'>
}

/**
 * Cada subcomando se declara una vez: lo que hace y lo que dice la ayuda salen del mismo sitio.
 * Para añadir uno (p. ej. `demo`), basta con una entrada nueva en `commands`. Los textos de la
 * ayuda son funciones del catálogo de mensajes, así que salen en el idioma elegido.
 */
interface CliCommand {
  usage: string
  summary: (t: Messages) => string
  options?: [flag: string, summary: (t: Messages) => string][]
  /** Otros nombres con los que se invoca (compatibilidad); la ayuda solo muestra el principal. */
  aliases?: string[]
  run: (args: string[], ctx: Ctx) => Promise<void>
}

const flagValue = (args: string[], flag: string): string | undefined => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const commands: Record<string, CliCommand> = {
  start: {
    usage: 'ai-office',
    summary: (t) => t.help.start,
    options: [
      ['--no-open', (t) => t.help.noOpen],
      ['--project <path>', (t) => t.help.project],
      ['--scope user|project', (t) => t.help.scope],
      ['AI_OFFICE_PORT=7377', (t) => t.help.port],
    ],
    run: (args, { lang, t, scope }) =>
      start(resolvePort(process.env, t), {
        open: !args.includes('--no-open'),
        lang,
        t,
        scopeRequest: { ...scope, auto: true },
      }),
  },
  census: {
    usage: 'ai-office census',
    summary: (t) => t.help.census,
    // `censo` y `--cartel` son los nombres en español de antes: siguen funcionando.
    aliases: ['censo'],
    options: [
      ['--poster [file.svg]', (t) => t.help.poster],
      ['--project <path>', (t) => t.help.project],
      ['--scope user|project', (t) => t.help.scope],
    ],
    run: async (args, ctx) => {
      // `--poster` sin ruta guarda en `ai-office-census.svg`.
      const flag = ['--poster', '--cartel'].find((f) => args.includes(f))
      const next = flag ? flagValue(args, flag) : undefined
      await census(
        { lang: ctx.lang, t: ctx.t, scopeRequest: { ...ctx.scope, auto: true } },
        flag === undefined
          ? undefined
          : next && !next.startsWith('--')
            ? next
            : 'ai-office-census.svg',
      )
    },
  },
  doctor: {
    usage: 'ai-office doctor',
    summary: (t) => t.help.doctor,
    options: [
      ['--project <path>', (t) => t.help.project],
      ['--scope user|project', (t) => t.help.scope],
    ],
    run: (_args, { t, scope }) => doctor(resolvePort(process.env, t), t, { ...scope, auto: true }),
  },
  hooks: {
    usage: 'ai-office hooks install|uninstall',
    summary: (t) => t.help.hooks,
    options: [
      ['--yes', (t) => t.help.yes],
      ['--dry-run', (t) => t.help.dryRun],
    ],
    run: async (args, { t }) => {
      const sub = args[0]
      const yes = args.includes('--yes')
      if (sub === 'install') await hooksInstall({ yes, dryRun: args.includes('--dry-run') }, t)
      else if (sub === 'uninstall') await hooksUninstall({ yes }, t)
      else {
        console.log(`  ${t.hooks.usage}`)
        process.exitCode = 1
      }
    },
  },
  demo: {
    usage: 'ai-office demo',
    summary: (t) => t.help.demo,
    options: [
      ['--no-open', (t) => t.help.noOpen],
      ['--port 7379', (t) => t.help.demoPort],
    ],
    run: (args, { lang, t }) => {
      // Misma validación que el puerto normal: `--port abc` da un mensaje claro, no un NaN.
      const raw = flagValue(args, '--port')
      const port = raw ? resolvePort({ AI_OFFICE_PORT: raw }, t) : 7379
      return demo(port, { open: !args.includes('--no-open'), lang, t })
    },
  },
}

const findCommand = (name: string): CliCommand | undefined =>
  commands[name] ?? Object.values(commands).find((c) => c.aliases?.includes(name))

const help = (t: Messages): string => {
  const rows = Object.values(commands).flatMap((c) => [
    `  ${bold(c.usage.padEnd(36))} ${c.summary(t)}`,
    ...(c.options ?? []).map(([flag, text]) => dim(`      ${flag.padEnd(34)} ${text(t)}`)),
  ])
  return `
${bold('ai-office')} - ${t.help.tagline}

${rows.join('\n')}
  ${bold('ai-office --lang en|es'.padEnd(36))} ${t.help.lang}
  ${bold('ai-office --version'.padEnd(36))} ${t.help.version}

${dim(t.help.footer)}
`
}

const main = async (): Promise<void> => {
  // El idioma se resuelve primero y la opción `--lang` se retira: los subcomandos no la ven.
  const { lang, args: withScope } = resolveLang(
    process.argv.slice(2),
    process.env,
    configuredLang(),
  )
  const t = messagesFor(lang)
  const { flags: scope, args: argv } = extractScopeFlags(withScope, t)
  const ctx: Ctx = { lang, t, scope }
  const [cmd, ...rest] = argv
  if (cmd === '--version' || cmd === '-v') {
    console.log(cliVersion(t))
    return
  }
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(help(t))
    return
  }
  // Sin subcomando (o solo con opciones, como `ai-office --no-open`) se arranca la interfaz.
  if (cmd === undefined || cmd.startsWith('-')) {
    await commands.start?.run(cmd === undefined ? [] : [cmd, ...rest], ctx)
    return
  }
  const command = findCommand(cmd)
  if (!command) {
    console.log(help(t))
    process.exitCode = 1
    return
  }
  await command.run(rest, ctx)
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
