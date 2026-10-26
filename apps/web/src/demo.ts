import type { ConfigPatch, ConfigView } from './config.ts'
import { apiError, errorDeCodigo } from './errores.ts'
import { getLang, type Lang } from './i18n/index.ts'
import type { LiveEvent, LiveSession } from './live.ts'
import type { Show } from './show.ts'
import type { Snapshot } from './types.ts'

/**
 * Modo demo estático: la interfaz sin daemon, servida desde la página del proyecto.
 *
 * Se activa al compilar con `VITE_DEMO=1` y sustituye los únicos tres puntos de red de `api.ts`:
 * el snapshot sale de `demo/snapshot.json` (generado por `scripts/demo-snapshot.ts` con el mismo
 * código del daemon sobre la instalación ficticia), las escrituras se rechazan con un mensaje que
 * explica por qué, y el WebSocket es un guion que reproduce el grafo ACREDITADO del snapshot: los
 * destellos que se ven son delegaciones e invocaciones que de verdad constan en esos transcripts.
 */

export const DEMO = import.meta.env.VITE_DEMO === '1'

/** La página de instalación del proyecto, en el idioma de la interfaz (la web lo lee de `?lang=`). */
export const urlInstalar = (lang: Lang): string =>
  `https://alex-roc.github.io/ai-office/${lang === 'es' ? '?lang=es' : ''}#install`

const cargar = (archivo: string): Promise<Snapshot> =>
  fetch(`${import.meta.env.BASE_URL}demo/${archivo}`).then((r) => {
    if (!r.ok) throw new Error(`demo/${archivo}: ${r.status}`)
    return r.json() as Promise<Snapshot>
  })

/**
 * La demo trae DOS snapshots: el del ámbito de usuario (`snapshot.json`, el de entrada) y el de un
 * proyecto (`snapshot-project.json`). Cambiar de ámbito alterna entre ellos en memoria, sin daemon.
 * Si el de proyecto no existe, el selector de ámbito queda deshabilitado y todo sigue igual.
 */
let usuario: Promise<Snapshot> | null = null
let proyecto: Promise<Snapshot | null> | null = null
let ambitoDemo: 'user' | 'project' = 'user'

const snapshotProyecto = (): Promise<Snapshot | null> => {
  proyecto ??= cargar('snapshot-project.json').catch(() => null)
  return proyecto
}

export const demoSnapshot = async (): Promise<Snapshot> => {
  usuario ??= cargar('snapshot.json')
  if (ambitoDemo === 'project') return (await snapshotProyecto()) ?? usuario
  return usuario
}

/** `Show` elegido en esta pestaña: la demo no puede escribir `config.json`, así que vive en memoria. */
let showDemo: Partial<Show> = {}

/**
 * `GET`/`POST /api/config` de la demo. `show` se aplica en memoria (hasta recargar la página) y el
 * ámbito alterna entre los dos snapshots; no hay daemon que reconstruya nada ni `config.json`.
 */
const configDemo = async (patch: ConfigPatch | undefined): Promise<ConfigView> => {
  const hayProyecto = (await snapshotProyecto()) !== null
  if (patch && (patch.scope !== undefined || patch.project !== undefined)) {
    // Solo hay dos ámbitos y solo si existen los dos archivos; cualquier otra cosa no se puede.
    if (!hayProyecto || (patch.scope !== 'user' && patch.scope !== 'project')) {
      throw apiError('http', 'scope.demo', 403)
    }
    ambitoDemo = patch.scope
  }
  if (patch?.show) showDemo = { ...showDemo, ...patch.show }
  const s = await demoSnapshot()
  return {
    scopeLocked: !hayProyecto,
    config: { show: showDemo },
    path: '~/.claude/ai-office/config.json',
    scope: s.scope ?? { kind: 'user' },
    scopeSource: 'config',
    changed: false,
  }
}

interface Paso {
  type: LiveEvent['type']
  actor: LiveEvent['actor']
  entityId: string
  skill?: string
}

/** Del grafo acreditado salen pares "delegó en X, que invocó Y": eso es lo que se reproduce. */
const guion = (s: Snapshot): Paso[] => {
  const pasos: Paso[] = []
  const nombre = (id: string) => id.split('/').pop() ?? id
  for (const e of s.edges) {
    if (e.layer !== 'proven') continue
    if (e.kind === 'agent-delegates-agent') {
      // El hilo principal (u otro agente) delega: el subagente se materializa.
      const agente = nombre(e.to)
      pasos.push({
        type: 'agent.start',
        actor: { kind: 'agent', agentType: agente },
        entityId: e.to,
      })
    } else if (e.kind === 'agent-uses-skill') {
      const actor: Paso['actor'] =
        e.from === s.mainThreadId ? { kind: 'main' } : { kind: 'agent', agentType: nombre(e.from) }
      pasos.push({ type: 'skill.invoked', actor, entityId: e.to, skill: nombre(e.to) })
    }
  }
  // Barajado determinista: el orden del grafo agruparía todos los pasos de un mismo agente.
  return pasos
    .map((p, i) => ({ p, k: (i * 7919) % 101 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p)
}

/**
 * Las peticiones POST de la demo. El lienzo de flujos funciona de verdad: abrir un comando y la
 * vista previa usan el MISMO compilador que el daemon (`compile.ts` es puro), importado bajo
 * demanda para que no pese en la interfaz normal. Lo que escribe en disco se rechaza.
 */
export const demoPost = async (url: string, body: unknown): Promise<unknown> => {
  // El idioma de la petición manda; sin él, el de la interfaz.
  const lang = (body as { lang?: Lang } | undefined)?.lang ?? getLang()
  if (url === '/api/config') return configDemo(body as ConfigPatch | undefined)
  if (url === '/api/flows/open' || url === '/api/flows/preview') {
    const [s, c] = await Promise.all([
      demoSnapshot(),
      import('../../../packages/providers/src/claude-code/compile.ts'),
    ])
    const raiz = s.catalog.roots[1] ?? '~/.claude/commands'
    if (url === '/api/flows/open') {
      const { commandId } = body as { commandId: string }
      const command = s.catalog.commands.find((x) => x.id === commandId)
      if (!command) {
        throw errorDeCodigo('not-found', '', 404, undefined, 'command-not-found', { id: commandId })
      }
      // biome-ignore lint/suspicious/noExplicitAny: el catálogo del snapshot es el de core, tipado aparte en la web
      const [cmd, agentes, skills] = [command, s.catalog.agents, s.catalog.skills] as any[]
      const flow = c.importFlow(cmd, agentes, skills, lang)
      return {
        flow,
        markdown: c.compileFlow(flow, lang),
        path: command.source.realPath,
        etag: '',
        exists: true,
      }
    }
    const { flow } = body as { flow: Parameters<typeof c.compileFlow>[0] }
    let nombre = 'nuevo-flujo.md'
    try {
      nombre = c.flowFileName(flow)
    } catch {
      /* nombre vacío: la vista previa se enseña igual */
    }
    const existe = s.catalog.commands.some((x) => `${x.name}.md` === nombre)
    return {
      flow,
      markdown: c.compileFlow(flow, lang),
      path: `${raiz}/${nombre}`,
      etag: '',
      exists: existe,
    }
  }
  throw apiError('http', 'demo.error', 403)
}

const SESION = 'demo-session'

/**
 * Lo justo de la interfaz de `WebSocket` que usa `live.ts`. Responde al primer frame como el
 * daemon (sesiones) y luego emite un paso del guion cada pocos segundos.
 */
class DemoSocket {
  onopen: (() => void) | null = null
  onmessage: ((msg: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  readyState = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private seq = 0

  constructor() {
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  send(): void {
    void demoSnapshot().then((s) => {
      const pasos = guion(s)
      const sesion: LiveSession = {
        sessionId: SESION,
        cwd: '/home/dev/acme-web',
        status: 'working',
        currentTool: null,
        agents: {},
      }
      this.emitir({ sessions: [sesion] })
      if (!pasos.length) return
      let i = 0
      const siguiente = () => {
        if (this.readyState !== 1) return
        const p = pasos[i++ % pasos.length] as Paso
        const evento: LiveEvent = {
          v: 1,
          seq: ++this.seq,
          ts: Date.now(),
          sessionId: SESION,
          cwd: sesion.cwd,
          ...p,
        }
        this.emitir({ events: [evento] })
        this.timer = setTimeout(siguiente, 1800 + ((i * 523) % 1700))
      }
      this.timer = setTimeout(siguiente, 1200)
    })
  }

  close(): void {
    this.readyState = 3
    if (this.timer) clearTimeout(this.timer)
  }

  private emitir(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

export const abrirSocketDemo = (): WebSocket => new DemoSocket() as unknown as WebSocket
