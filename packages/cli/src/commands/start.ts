import { spawn } from 'node:child_process'
import { startServer } from '@ai-office/daemon'
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

export const start = async (port = 7377, opts: { open?: boolean } = {}): Promise<void> => {
  const handle = await startServer(port)
  console.log()
  console.log(`  ${bold('ai-office')} escuchando en ${handle.url}`)
  console.log(dim('  Solo 127.0.0.1. El token cambia en cada arranque. Ctrl-C para parar.'))
  console.log()
  // Sin terminal (lo lanza otro programa, p. ej. la herramienta Bash de Claude Code) no se abre
  // nada: nadie lo espera y abriría una pestaña a quien no la pidió.
  if (opts.open !== false && process.stdout.isTTY) openBrowser(handle.url)
  const stop = async () => {
    await handle.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
