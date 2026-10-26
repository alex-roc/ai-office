import { spawn } from 'node:child_process'
import type { Lang } from '@ai-office/core'
import { startServer } from '@ai-office/daemon'
import {
  abbreviateCwd,
  type ResolvedScope,
  resolveScope,
  type ScopeRequest,
} from '@ai-office/providers'
import { type Messages, messagesFor } from '../i18n.ts'
import { bold, dim } from '../ui.ts'

/** Abre la URL en el navegador por defecto. Silencioso: si no hay navegador, el enlace impreso basta. */
const openBrowser = (url: string): void => {
  const [cmd, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]]
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
  } catch {
    /* sin navegador: no es un error */
  }
}

/**
 * La URL que se imprime y se abre. Con inglés no lleva parámetro (es el idioma por defecto de la
 * interfaz); con español añade `?lang=es` ANTES del hash (`#t=...`), que es donde viaja el
 * token y que debe quedar el último.
 */
export const interfaceUrl = (url: string, lang: Lang): string => {
  if (lang === 'en') return url
  const i = url.indexOf('#')
  const head = i < 0 ? url : url.slice(0, i)
  const hash = i < 0 ? '' : url.slice(i)
  return `${head}${head.includes('?') ? '&' : '?'}lang=${lang}${hash}`
}

/** Cómo se dice el ámbito resuelto y por qué: lo usan `start` y `doctor`. */
export const scopeLine = (resolved: ResolvedScope, t: Messages): string => {
  const what =
    resolved.scope.kind === 'user'
      ? t.scope.user
      : t.scope.project(abbreviateCwd(resolved.scope.path))
  const why =
    resolved.source === 'auto' && resolved.via === 'git-root'
      ? t.scope.why.autoGit
      : t.scope.why[resolved.source]
  return `${what} (${why})`
}

export const start = async (
  port = 7377,
  opts: { open?: boolean; lang?: Lang; t?: Messages; scopeRequest?: ScopeRequest } = {},
): Promise<void> => {
  const lang = opts.lang ?? 'en'
  const t = opts.t ?? messagesFor(lang)
  const resolved = await resolveScope(opts.scopeRequest ?? { auto: true })
  const handle = await startServer(port, { scope: resolved })
  const url = interfaceUrl(handle.url, lang)
  console.log()
  console.log(`  ${bold('ai-office')} ${t.start.listening(url)}`)
  console.log(dim(`  ${scopeLine(resolved, t)}`))
  console.log(dim(`  ${t.start.note}`))
  console.log()
  // Sin terminal (lo lanza otro programa, p. ej. la herramienta Bash de Claude Code) no se abre
  // nada: nadie lo espera y abriría una pestaña a quien no la pidió.
  if (opts.open !== false && process.stdout.isTTY) openBrowser(url)
  const stop = async () => {
    await handle.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
