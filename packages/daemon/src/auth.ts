import { randomBytes } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { reject } from './errors.ts'

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

/** Token nuevo en cada arranque. Solo se genera: escribirlo es `persistToken`, que se llama
 * cuando el servidor ya escucha, para que un arranque fallido no pise el token del que sí corre. */
export const createToken = async (runDir: string, port: number): Promise<AuthConfig> => {
  await mkdir(runDir, { recursive: true, mode: 0o700 })
  return {
    token: randomBytes(32).toString('base64url'),
    tokenPath: join(runDir, 'token'),
    port,
  }
}

/** Guarda el token en un archivo que solo puede leer el usuario. */
export const persistToken = async (cfg: AuthConfig): Promise<void> => {
  await writeFile(cfg.tokenPath, cfg.token, { mode: 0o600 })
  await chmod(cfg.tokenPath, 0o600)
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

const hostIsLocal = (value: string | undefined): boolean => {
  if (!value) return false
  const host = value.replace(/:\d+$/, '').toLowerCase()
  return LOCAL_HOSTS.has(host)
}

/** Lo único de `/api` que se atiende sin token. Lista cerrada: todo lo demás bajo `/api` lo exige,
 * incluidas las rutas que se añadan en el futuro. */
const PUBLIC_API = new Set(['/api/health', '/api/live'])

/**
 * Ruta tal y como la verá el router, no como llega en crudo. find-my-way decodifica el
 * percent-encoding antes de enrutar, así que `/%61pi/x` llega al manejador de `/api/x`; decidir
 * con `req.url` a pelo deja un hueco por el que cualquier página salta el token. Se decodifica
 * (también el doble codificado), se colapsan `//` y `..`, y se pasa a minúsculas para comparar.
 * `null` = ilegible: se trata como API protegida.
 */
export const normalizePath = (url: string): string | null => {
  let path = url.split(/[?#]/, 1)[0] ?? ''
  try {
    for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(path); i++) path = decodeURIComponent(path)
  } catch {
    return null
  }
  const clean = posix.normalize(`/${path.replaceAll('\\', '/')}`).replace(/\/+$/, '')
  return (clean || '/').toLowerCase()
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
      return reject(reply, 403, 'forbidden-host', 'host not allowed')
    }
    const origin = req.headers.origin
    if (typeof origin === 'string') {
      try {
        if (!hostIsLocal(new URL(origin).host)) {
          return reject(reply, 403, 'forbidden-origin', 'origin not allowed')
        }
      } catch {
        return reject(reply, 403, 'forbidden-origin', 'unreadable origin')
      }
    }
    // La página y sus estáticos son públicos para el navegador local; los datos no. Se decide con
    // la ruta normalizada Y con la ruta que el router resolvió: basta con que cualquiera de las
    // dos sea de la API para exigir token, y lo público es una lista blanca exacta.
    const path = normalizePath(req.url)
    const route = req.routeOptions?.url?.toLowerCase()
    const isApi =
      path === null ||
      path === '/api' ||
      path.startsWith('/api/') ||
      (route !== undefined && (route === '/api' || route.startsWith('/api/')))
    if (!isApi) return
    // El WebSocket se autentica en su primer frame, no en la cabecera: una petición de upgrade
    // no puede llevar `Authorization`. Aquí solo pasa el filtro de Host y Origin de arriba.
    if (path !== null && PUBLIC_API.has(path) && (route === undefined || PUBLIC_API.has(route))) {
      return
    }

    if (tokenFromRequest(req) !== cfg.token) {
      return reject(reply, 401, 'unauthorized', 'invalid token')
    }
    // Cabecera propia: obliga a preflight CORS y hace imposible el CSRF por formulario.
    if (req.method !== 'GET' && req.headers['x-ai-office'] !== '1') {
      return reject(reply, 403, 'missing-header', 'missing X-AI-Office header')
    }
  })
}
