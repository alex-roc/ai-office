import { ConflictError, OfficeError } from '@ai-office/providers'
import type { FastifyReply } from 'fastify'

/**
 * Códigos de error de la API. Toda respuesta de error es `{ error, code, ... }`: `error` es el
 * texto en inglés (para humanos y logs) y `code` es estable (para que la interfaz lo traduzca).
 *
 *   unauthorized      401  falta el token o no es el de este arranque
 *   forbidden-host    403  la cabecera Host no es local (anti DNS-rebinding)
 *   forbidden-origin  403  el Origin no es local, o es ilegible
 *   missing-header    403  una petición que no es GET sin `X-AI-Office: 1`
 *   conflict          409  el archivo cambió en disco desde el plan; trae además `currentEtag`
 *   not-found         404  la entidad, el comando o la ruta no existen
 *   invalid-request   400  petición bien recibida pero inválida o no ejecutable; trae además
 *                          `reason` (la causa concreta, p. ej. `invalid-color`, `target-exists`)
 *                          y `params` (datos para redactarla)
 *   demo-readonly     403  reservado: el daemon real no lo emite (la demo `ai-office demo` es una
 *                          copia escribible y la demo estática no tiene daemon)
 *   internal          500  fallo inesperado (E/S, bug)
 */
export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden-host'
  | 'forbidden-origin'
  | 'missing-header'
  | 'conflict'
  | 'not-found'
  | 'invalid-request'
  | 'demo-readonly'
  | 'internal'

export interface ApiErrorBody {
  error: string
  code: ApiErrorCode
  reason?: string
  params?: Record<string, string | number>
  currentEtag?: string
}

/** Traduce una excepción a su respuesta HTTP. Lo esperado (OfficeError, conflicto) conserva su
 * causa; todo lo demás es `internal`. */
export const toApiError = (err: unknown): { status: number; body: ApiErrorBody } => {
  if (err instanceof ConflictError || (err as Error)?.name === 'ConflictError') {
    const e = err as ConflictError
    return {
      status: 409,
      body: { error: e.message, code: 'conflict', currentEtag: e.currentEtag },
    }
  }
  if (err instanceof OfficeError) {
    const notFound = err.kind === 'not-found'
    return {
      status: notFound ? 404 : 400,
      body: {
        error: err.message,
        code: notFound ? 'not-found' : 'invalid-request',
        reason: err.code,
        params: err.params,
      },
    }
  }
  return { status: 500, body: { error: (err as Error)?.message ?? String(err), code: 'internal' } }
}

export const sendError = (reply: FastifyReply, err: unknown): FastifyReply => {
  const { status, body } = toApiError(err)
  return reply.code(status).send(body)
}

/** Respuesta de error con código fijo, para los guardias que no parten de una excepción. */
export const reject = (
  reply: FastifyReply,
  status: number,
  code: ApiErrorCode,
  error: string,
): FastifyReply => reply.code(status).send({ error, code } satisfies ApiErrorBody)
