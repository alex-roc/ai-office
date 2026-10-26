import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { SessionState } from '@ai-office/core'
import { paths } from '@ai-office/providers'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import Fastify from 'fastify'
import { type AuthConfig, createToken, registerGuards } from './auth.ts'
import { createEventBus } from './bus.ts'
import { startIngestSocket } from './ingest/socket.ts'
import { createDedupeCache, watchSpool } from './ingest/spool.ts'
import { openFlow, planFlow, previewFlow, saveFlow } from './mutations/flows.ts'
import { applyMutation, type MutationRequest, planMutation } from './mutations/router.ts'
import { createPresenceStore } from './presence.ts'
import { buildSnapshot, type Snapshot } from './snapshot.ts'

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))

export interface ServerHandle {
  url: string
  port: number
  token: string
  close: () => Promise<void>
}

/** Sitio construido de la interfaz. En desarrollo se usa el dev server de Vite. */
const webDist = (): string | null => {
  const candidate = join(here, '../../../apps/web/dist')
  return existsSync(candidate) ? candidate : null
}

/**
 * Censo de sesiones vivas según el propio CLI. Es el watchdog de la presencia: `Stop` no dispara
 * si el usuario interrumpe, así que sin esto una sesión podría quedarse "trabajando" para siempre.
 */
const liveSessionIds = async (): Promise<string[] | null> => {
  try {
    const { stdout } = await execFileAsync('claude', ['agents', '--json'], { timeout: 3000 })
    const list = JSON.parse(stdout) as { sessionId?: string }[]
    return list.map((s) => s.sessionId).filter((s): s is string => Boolean(s))
  } catch {
    // Sin el CLI disponible no se reconcilia; el resto del producto funciona igual.
    return null
  }
}

export const startServer = async (port = 7377): Promise<ServerHandle> => {
  const p = paths()
  const auth: AuthConfig = await createToken(join(p.ours, 'run'), port)
  const app = Fastify({ logger: false })
  await app.register(fastifyWebsocket)
  registerGuards(app, auth)

  app.addHook('onSend', async (req, reply) => {
    const origin = req.headers.origin
    if (typeof origin === 'string') {
      reply.header('access-control-allow-origin', origin)
      reply.header('access-control-allow-headers', 'authorization, content-type, x-ai-office')
      reply.header('access-control-allow-methods', 'GET, POST')
    }
  })
  app.options('/api/*', async (_req, reply) => reply.code(204).send())

  // --- estado vivo ---------------------------------------------------------------------------
  const bus = createEventBus()
  const presence = createPresenceStore()
  // El mismo caché de deduplicación para socket y spool: un evento que llega por los dos
  // caminos (el relay alcanzó a escribir en ambos) solo se publica una vez.
  const dedupe = createDedupeCache()

  /**
   * El hook sabe el NOMBRE de la skill o del agente, no su identidad en el catálogo. Aquí se
   * resuelve, que es donde el catálogo existe: sin esto la interfaz recibe el evento pero no
   * sabe a qué figura de la sala corresponde.
   */
  const resolveEntity = (normalized: Parameters<typeof bus.publish>[0]): string | undefined => {
    const cat = snapshot?.catalog
    if (!cat) return undefined
    if (normalized.skill) {
      const name = normalized.skill.includes(':')
        ? normalized.skill.split(':').pop()
        : normalized.skill
      return cat.skills.find((s) => s.name === name)?.id
    }
    if (normalized.actor.kind === 'agent' && normalized.actor.agentType) {
      return cat.agents.find((a) => a.name === normalized.actor.agentType)?.id
    }
    return undefined
  }

  const handleEvent = (normalized: Parameters<typeof bus.publish>[0]) => {
    const entityId = normalized.entityId ?? resolveEntity(normalized)
    presence.apply(bus.publish(entityId ? { ...normalized, entityId } : normalized))
  }

  const socketHandle = await startIngestSocket(
    join(p.ours, 'run', 'ingest.sock'),
    handleEvent,
    dedupe,
  ).catch(() => null)
  const spoolHandle = watchSpool(join(p.ours, 'spool'), handleEvent, dedupe)

  const reconcileTimer = setInterval(() => {
    void liveSessionIds().then((ids) => {
      if (!ids) return
      for (const closed of presence.reconcile(ids)) {
        bus.publish({
          v: 1,
          type: 'session.end',
          ts: Date.now(),
          sessionId: closed.sessionId,
          cwd: closed.cwd,
          actor: { kind: 'main' },
          detail: 'cerrada al reconciliar con el censo de sesiones',
        })
      }
    })
  }, 5000)
  reconcileTimer.unref()

  // --- snapshot ------------------------------------------------------------------------------
  let snapshot: Snapshot | null = null
  let building: Promise<Snapshot> | null = null
  const getSnapshot = async (): Promise<Snapshot> => {
    if (snapshot) return snapshot
    building ??= buildSnapshot().then((s) => {
      snapshot = s
      building = null
      return s
    })
    return building
  }

  app.get('/api/health', async () => ({ ok: true, name: 'ai-office' }))
  app.get('/api/snapshot', async () => await getSnapshot())
  app.post('/api/refresh', async () => {
    snapshot = null
    return await getSnapshot()
  })
  app.get('/api/sessions', async () => ({ sessions: presence.list() }))

  // --- escritura -----------------------------------------------------------------------------
  app.post('/api/mutations/plan', async (req, reply) => {
    try {
      return await planMutation((await getSnapshot()).catalog, req.body as MutationRequest)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/mutations/apply', async (req, reply) => {
    try {
      const body = req.body as MutationRequest & { etag: string }
      const result = await applyMutation((await getSnapshot()).catalog, body)
      // El catálogo acaba de cambiar en disco: el siguiente que pida el snapshot lo recalcula.
      snapshot = null
      return result
    } catch (err) {
      const e = err as Error & { name?: string; currentEtag?: string }
      if (e.name === 'ConflictError') {
        return reply.code(409).send({ error: e.message, currentEtag: e.currentEtag })
      }
      return reply.code(400).send({ error: e.message })
    }
  })

  // --- flujos (el editor de comandos) --------------------------------------------------------
  app.post('/api/flows/open', async (req, reply) => {
    try {
      const { commandId } = req.body as { commandId: string }
      return await openFlow((await getSnapshot()).catalog, commandId)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/flows/preview', async (req, reply) => {
    try {
      return await previewFlow((req.body as { flow: Parameters<typeof previewFlow>[0] }).flow)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/flows/plan', async (req, reply) => {
    try {
      return await planFlow((req.body as { flow: Parameters<typeof planFlow>[0] }).flow)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/flows/save', async (req, reply) => {
    try {
      const { flow, etag } = req.body as { flow: Parameters<typeof saveFlow>[0]; etag: string }
      const result = await saveFlow(flow, etag)
      snapshot = null
      return result
    } catch (err) {
      const e = err as Error & { name?: string; currentEtag?: string }
      if (e.name === 'ConflictError') {
        return reply.code(409).send({ error: e.message, currentEtag: e.currentEtag })
      }
      return reply.code(400).send({ error: e.message })
    }
  })

  // --- eventos en vivo -----------------------------------------------------------------------
  app.get('/api/live', { websocket: true }, (socket) => {
    let sub: { close: () => void } | null = null
    let authed = false

    const send = (payload: unknown) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload))
    }
    const sendSessions = (sessions: SessionState[]) => send({ sessions })

    socket.on('message', (raw: Buffer) => {
      if (authed) return
      let hello: { token?: string; resumeFrom?: number }
      try {
        hello = JSON.parse(raw.toString())
      } catch {
        socket.close()
        return
      }
      // El token viaja en el primer frame, no en la URL: así no queda en ningún registro.
      if (hello.token !== auth.token) {
        socket.close()
        return
      }
      authed = true
      const subscription = bus.subscribe(
        (event) => {
          send({ events: [event] })
          sendSessions(presence.list())
        },
        { resumeFrom: hello.resumeFrom },
      )
      sub = subscription
      if (subscription.needsResync) send({ type: 'resync' })
      sendSessions(presence.list())
    })

    socket.on('close', () => sub?.close())
  })

  const dist = webDist()
  if (dist) {
    await app.register(fastifyStatic, { root: dist })
  } else {
    app.get('/', async (_req, reply) =>
      reply
        .type('text/html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>ai-office</title>' +
            '<p style="font:14px system-ui;padding:2rem">La interfaz no esta construida. ' +
            'En desarrollo: <code>pnpm dev:web</code>.</p>',
        ),
    )
  }

  await app.listen({ port, host: '127.0.0.1' })
  return {
    url: `http://127.0.0.1:${port}/#t=${auth.token}`,
    port,
    token: auth.token,
    close: async () => {
      clearInterval(reconcileTimer)
      spoolHandle.close()
      await socketHandle?.close()
      await app.close()
    },
  }
}
