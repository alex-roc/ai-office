import { startServer } from '@ai-office/daemon'
import { bold, dim } from '../ui.ts'

export const start = async (port = 7377): Promise<void> => {
  const handle = await startServer(port)
  console.log()
  console.log(`  ${bold('ai-office')} escuchando en ${handle.url}`)
  console.log(dim('  Solo 127.0.0.1. El token cambia en cada arranque. Ctrl-C para parar.'))
  console.log()
  const stop = async () => {
    await handle.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
