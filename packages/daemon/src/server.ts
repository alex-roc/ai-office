import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Lang, ScopeSelection, SessionState } from '@ai-office/core'
import {
  applyConfigPatch,
  assertUsableConfig,
  ourConfigPath,
  paths,
  readOurConfig,
  resolveScope,
  type ScopeSource,
  scanCatalogReport,
  withCurrentProject,
  writeOurConfig,
} from '@ai-office/providers'
import fastifyStatic from '@fastify/static'
import fastifyWebsocket from '@fastify/websocket'
import Fastify from 'fastify'
import { type AuthConfig, createToken, persistToken, registerGuards } from './auth.ts'
import { createEventBus } from './bus.ts'
import { reject, sendError } from './errors.ts'
import { startIngestSocket } from './ingest/socket.ts'
import { createDedupeCache, watchSpool } from './ingest/spool.ts'
import { applyCreate, type CreateEntityRequest, planCreate } from './mutations/entities.ts'
import { openFlow, planFlow, previewFlow, saveFlow } from './mutations/flows.ts'
import { applyMutation, type MutationRequest, planMutation } from './mutations/router.ts'
import { createPresenceStore } from './presence.ts'
import { assembleSnapshot, type HistoricalData, type Snapshot, scanHistorical } from './snapshot.ts'

/** El idioma que pide la interfaz; cualquier otra cosa (o nada) es el inglés por defecto. */
const parseLang = (v: unknown): Lang => (v === 'es' ? 'es' : 'en')

/** Plazo por defecto del primer frame del WebSocket. */
const HELLO_TIMEOUT_MS = 5000

export interface ServerOptions {
  /** Plazo del primer frame del WebSocket (con el token). */
  helloTimeoutMs?: number
  /**
   * Ámbito con el que arranca (lo resuelve la CLI: flag > config > autodetección). Sin él se usa
   * el de `config.json` o el de usuario: el daemon no mira desde qué carpeta se lanzó.
   */
  scope?: { scope: ScopeSelection; source: ScopeSource }
}

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

/** ¿Hay ya un ai-office respondiendo en este puerto? Sondea `/api/health`, que es público. */
const aiOfficeAt = async (port: number): Promise<boolean> => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
    })
    return ((await res.json()) as { name?: string }).name === 'ai-office'
  } catch {
    return false
  }
}

export const startServer = async (port = 7377, opts: ServerOptions = {}): Promise<ServerHandle> => {
  // Antes de tocar nada: un segundo arranque no debe invalidar el token del primero ni quitarle
  // el spool. Se avisa con claridad en vez de morir con un EADDRINUSE crudo.
  if (await aiOfficeAt(port)) {
    throw new Error(
      `ai-office is already listening on port ${port}. Use that one (its link with the token was printed at startup) or pick another port with AI_OFFICE_PORT.`,
    )
  }
  const p = paths()
  const initial = opts.scope ?? (await resolveScope())
  // El ámbito activo: lo cambia `POST /api/config` sin reiniciar y sin cambiar la URL.
  let currentScope: ScopeSelection = initial.scope
  let scopeSource: ScopeSource = initial.source
  const auth: AuthConfig = await createToken(join(p.ours, 'run'), port)
  const app = Fastify({ logger: false })
  await app.register(fastifyWebsocket)
  registerGuards(app, auth)
  app.setNotFoundHandler((_req, reply) => reject(reply, 404, 'not-found', 'not found'))

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
    // Lo tapado por otro ámbito no es lo que Claude Code ejecuta.
    const loaded = <T extends { status: string }>(list: T[]): T[] =>
      list.filter((e) => e.status !== 'shadowed')
    if (normalized.skill) {
      // Una skill de plugin llega como `plugin:skill` y así se llama en el catálogo; si no casa
      // entera, se prueba con la parte final (el prefijo puede ser un espacio de nombres propio).
      const full = normalized.skill
      const exact = loaded(cat.skills).find((s) => s.name === full)
      if (exact) return exact.id
      const name = full.includes(':') ? full.split(':').pop() : full
      return loaded(cat.skills).find((s) => s.name === name)?.id
    }
    if (normalized.actor.kind === 'agent' && normalized.actor.agentType) {
      return loaded(cat.agents).find((a) => a.name === normalized.actor.agentType)?.id
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
    presence.purge()
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
          detail: 'closed while reconciling with the session census',
        })
      }
    })
  }, 5000)
  reconcileTimer.unref()

  // --- snapshot ------------------------------------------------------------------------------
  // Dos cachés con ciclos de vida distintos: el historial (segundos sobre gigabytes) solo se
  // recalcula en `/api/refresh`; el catálogo (milisegundos) se reescanea tras cada mutación.
  let snapshot: Snapshot | null = null
  let historical: HistoricalData | null = null
  let building: Promise<Snapshot> | null = null
  // Sube con cada invalidación. Una construcción que empezó antes de una mutación termina con un
  // catálogo anterior al cambio: se devuelve a quien lo pidió pero NO se cachea.
  let generation = 0
  // El historial solo se invalida con `/api/refresh`, no con una mutación.
  let historyEpoch = 0

  const getSnapshot = async (): Promise<Snapshot> => {
    if (snapshot) return snapshot
    if (building) return building
    const mine = generation
    const myEpoch = historyEpoch
    const scope = currentScope
    const t0 = Date.now()
    let attempt: Promise<Snapshot> | undefined
    attempt = (async () => {
      try {
        const [catalog, hist] = await Promise.all([
          scanCatalogReport(scope),
          historical ?? scanHistorical(),
        ])
        if (myEpoch === historyEpoch) historical = hist
        const knownProjects = await withCurrentProject(hist.knownProjects, scope)
        const built = assembleSnapshot(catalog, { ...hist, knownProjects }, scope, t0)
        if (mine === generation) snapshot = built
        return built
      } finally {
        // Aunque falle: si la promesa fallida se quedara guardada, todas las peticiones
        // siguientes recibirían el mismo error para siempre.
        if (building === attempt) building = null
      }
    })()
    building = attempt
    return attempt
  }

  /** El catálogo cambió en disco: el siguiente snapshot lo reescanea, sin releer transcripts. */
  const invalidateCatalog = () => {
    generation++
    snapshot = null
    building = null
  }

  app.get('/api/health', async () => ({ ok: true, name: 'ai-office' }))
  app.get('/api/snapshot', async () => await getSnapshot())
  app.post('/api/refresh', async () => {
    historical = null
    historyEpoch++
    invalidateCatalog()
    return await getSnapshot()
  })
  app.get('/api/sessions', async () => ({ sessions: presence.list() }))

  // --- configuración propia ------------------------------------------------------------------
  // `~/.claude/ai-office/config.json`. Es lo único que escribe fuera del motor de mutaciones de
  // Claude Code y solo toca ese archivo. `POST` recibe un PARCHE (`null` quita una clave, `show` se
  // combina clave a clave); cambiar `scope`/`project` cambia el ámbito en caliente y reconstruye
  // el snapshot.
  const configView = async (changed = false) => {
    const { config, error } = await readOurConfig()
    return {
      config,
      ...(error ? { configError: error } : {}),
      path: ourConfigPath(),
      scope: currentScope,
      scopeSource,
      changed,
    }
  }
  app.get('/api/config', async (_req, reply) => {
    try {
      return await configView()
    } catch (err) {
      return sendError(reply, err)
    }
  })
  app.post('/api/config', async (req, reply) => {
    try {
      const { config: current } = await readOurConfig()
      const next = applyConfigPatch(current, req.body)
      await assertUsableConfig(next)
      const { changed } = await writeOurConfig(next)
      const touchesScope =
        req.body !== null &&
        typeof req.body === 'object' &&
        ('scope' in req.body || 'project' in req.body)
      if (touchesScope) {
        const resolved = await resolveScope({ config: next })
        if (JSON.stringify(resolved.scope) !== JSON.stringify(currentScope)) invalidateCatalog()
        currentScope = resolved.scope
        scopeSource = resolved.source
      }
      return await configView(changed)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  // --- escritura -----------------------------------------------------------------------------
  // Los errores salen siempre como `{ error, code, ... }` (ver `errors.ts`).
  app.post('/api/mutations/plan', async (req, reply) => {
    try {
      return await planMutation((await getSnapshot()).catalog, req.body as MutationRequest, {
        scope: currentScope,
      })
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.post('/api/mutations/apply', async (req, reply) => {
    try {
      const body = req.body as MutationRequest & { etag: string }
      const result = await applyMutation((await getSnapshot()).catalog, body, {
        scope: currentScope,
      })
      // El catálogo acaba de cambiar en disco: el siguiente que pida el snapshot lo recalcula.
      invalidateCatalog()
      return result
    } catch (err) {
      return sendError(reply, err)
    }
  })

  // --- entidades nuevas ----------------------------------------------------------------------
  // `{ kind: 'agent' | 'skill' | 'command', name, description, body?, lang? }`. Sin `body` se
  // escribe uno inicial breve en `lang`.
  app.post('/api/entities/plan', async (req, reply) => {
    try {
      return await planCreate(
        (await getSnapshot()).catalog,
        req.body as CreateEntityRequest,
        currentScope,
      )
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.post('/api/entities/create', async (req, reply) => {
    try {
      const result = await applyCreate(
        (await getSnapshot()).catalog,
        req.body as CreateEntityRequest,
        currentScope,
      )
      invalidateCatalog()
      return result
    } catch (err) {
      return sendError(reply, err)
    }
  })

  // --- flujos (el editor de comandos) --------------------------------------------------------
  // `lang` ('en' | 'es', por defecto 'en') decide el idioma de la prosa que se escribe en el
  // archivo del comando.
  app.post('/api/flows/open', async (req, reply) => {
    try {
      const { commandId, lang } = req.body as { commandId: string; lang?: unknown }
      return await openFlow((await getSnapshot()).catalog, commandId, parseLang(lang))
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.post('/api/flows/preview', async (req, reply) => {
    try {
      const { flow, lang } = req.body as { flow: Parameters<typeof previewFlow>[0]; lang?: unknown }
      return await previewFlow(flow, (await getSnapshot()).catalog, parseLang(lang))
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.post('/api/flows/plan', async (req, reply) => {
    try {
      const { flow, lang } = req.body as { flow: Parameters<typeof planFlow>[0]; lang?: unknown }
      return await planFlow(flow, (await getSnapshot()).catalog, parseLang(lang), currentScope)
    } catch (err) {
      return sendError(reply, err)
    }
  })

  app.post('/api/flows/save', async (req, reply) => {
    try {
      const { flow, etag, lang } = req.body as {
        flow: Parameters<typeof saveFlow>[0]
        etag: string
        lang?: unknown
      }
      const result = await saveFlow(
        flow,
        etag,
        (await getSnapshot()).catalog,
        parseLang(lang),
        currentScope,
      )
      invalidateCatalog()
      return result
    } catch (err) {
      return sendError(reply, err)
    }
  })

  // --- eventos en vivo -----------------------------------------------------------------------
  app.get('/api/live', { websocket: true }, (socket) => {
    let sub: { close: () => void } | null = null
    let authed = false

    // Un cliente que abre el socket y calla ocuparía una conexión para siempre: el primer frame
    // (con el token) tiene 5 s para llegar.
    const helloTimer = setTimeout(() => {
      if (!authed) socket.close()
    }, opts.helloTimeoutMs ?? HELLO_TIMEOUT_MS)
    helloTimer.unref()

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
      clearTimeout(helloTimer)
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

    socket.on('close', () => {
      clearTimeout(helloTimer)
      sub?.close()
    })
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
            '<p style="font:14px system-ui;padding:2rem">The interface is not built. ' +
            'In development: <code>pnpm dev:web</code>.</p>',
        ),
    )
  }

  try {
    await app.listen({ port, host: '127.0.0.1' })
  } catch (err) {
    clearInterval(reconcileTimer)
    spoolHandle.close()
    await socketHandle?.close()
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(
        `port ${port} is in use by another program. Pick another with AI_OFFICE_PORT.`,
      )
    }
    throw err
  }
  // El token se guarda solo cuando el servidor ya escucha: si este arranque hubiera fallado, el
  // archivo seguiría siendo el del que sí está corriendo.
  await persistToken(auth)
  // Con puerto 0 el sistema elige uno: lo que se anuncia es el real.
  const actualPort = (app.server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${actualPort}/#t=${auth.token}`,
    port: actualPort,
    token: auth.token,
    close: async () => {
      clearInterval(reconcileTimer)
      spoolHandle.close()
      await socketHandle?.close()
      await app.close()
    },
  }
}
