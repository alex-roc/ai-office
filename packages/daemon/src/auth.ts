import { randomBytes } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'

/**
 * Seguridad del servidor local.
 *
 * Aunque hoy solo sirva lectura, esto acabará ejecutando comandos con acceso al disco, y
 * cualquier página web abierta en el navegador puede hablar con 127.0.0.1. Las defensas van
 * desde el primer commit porque añadirlas después es como no tenerlas.
 */

export interface AuthConfig {
  token: string
  tokenPath: string
  port: number
}

/** Token nuevo en cada arranque, en un archivo que solo puede leer el usuario. */
export const createToken = async (runDir: string, port: number): Promise<AuthConfig> => {
  await mkdir(runDir, { recursive: true, mode: 0o700 })
  const token = randomBytes(32).toString('base64url')
  const tokenPath = join(runDir, 'token')
  await writeFile(tokenPath, token, { mode: 0o600 })
  await chmod(tokenPath, 0o600)
  return { token, tokenPath, port }
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

const hostIsLocal = (value: string | undefined): boolean => {
  if (!value) return false
  const host = value.replace(/:\d+$/, '').toLowerCase()
  return LOCAL_HOSTS.has(host)
}

const tokenFromRequest = (req: FastifyRequest): string | null => {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7)
  return null
}

export const registerGuards = (app: FastifyInstance, cfg: AuthConfig): void => {
  app.addHook('onRequest', async (req, reply) => {
    // Anti DNS-rebinding: solo se atiende a quien dice venir de la dirección local.
    if (!hostIsLocal(req.headers.host)) {
      return reply.code(403).send({ error: 'host no permitido' })
    }
    const origin = req.headers.origin
    if (typeof origin === 'string') {
      try {
        if (!hostIsLocal(new URL(origin).host)) {
          return reply.code(403).send({ error: 'origen no permitido' })
        }
      } catch {
        return reply.code(403).send({ error: 'origen ilegible' })
      }
    }
    // La página y sus estáticos son públicos para el navegador local; los datos no.
    if (!req.url.startsWith('/api/')) return
    if (req.url === '/api/health') return
    // El WebSocket se autentica en su primer frame, no en la cabecera: una petición de upgrade
    // no puede llevar `Authorization`. Aquí solo pasa el filtro de Host y Origin de arriba.
    if (req.url.startsWith('/api/live')) return

    if (tokenFromRequest(req) !== cfg.token) {
      return reply.code(401).send({ error: 'token invalido' })
    }
    // Cabecera propia: obliga a preflight CORS y hace imposible el CSRF por formulario.
    if (req.method !== 'GET' && req.headers['x-ai-office'] !== '1') {
      return reply.code(403).send({ error: 'falta la cabecera X-AI-Office' })
    }
  })
}
