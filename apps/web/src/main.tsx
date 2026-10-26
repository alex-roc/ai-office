import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchSnapshot, getToken } from './api.ts'
import { DiffDialog } from './Diff.tsx'
import { Ficha } from './Ficha.tsx'
import { FlowEditor } from './FlowEditor.tsx'
import { type Flow, openFlow, planFlow, saveFlow } from './flows.ts'
import { useLive } from './live.ts'
import {
  applyMutation,
  type MutationPlan,
  type MutationRequest,
  planMutation,
} from './mutations.ts'
import { Plano } from './Plano.tsx'
import { Sala } from './sala/Sala.tsx'
import './styles.css'
import type { Snapshot } from './types.ts'

const pct = (n: number) => `${Math.round(n * 100)}%`

type View = 'sala' | 'plano'

const App = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<View>('sala')

  const reload = useCallback(() => {
    fetchSnapshot().then(setSnapshot, (e: Error) => setError(e.message))
  }, [])
  useEffect(reload, [reload])

  // La actividad en vivo llega por WebSocket; si el servidor no la ofrece, la interfaz
  // funciona igual y solo se pierde la animación.
  const live = useLive(getToken(), reload)

  const [editing, setEditing] = useState(false)
  // `req` falta cuando lo que se va a guardar es un flujo entero, no una arista suelta.
  const [pending, setPending] = useState<{
    req?: MutationRequest
    plan: MutationPlan
    title: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [flow, setFlow] = useState<Flow | null>(null)
  const [flowPending, setFlowPending] = useState<{ flow: Flow; etag: string } | null>(null)

  /** Abre un comando en el lienzo, recuperando los pasos que ya tuviera escritos. */
  const editarFlujo = useCallback(async (commandId: string) => {
    try {
      const r = await openFlow(commandId)
      setFlow(r.flow)
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }, [])

  const nuevoFlujo = useCallback(() => {
    setFlow({ name: '', description: '', steps: [] })
  }, [])

  const prepararGuardadoFlujo = useCallback(async (f: Flow) => {
    try {
      const plan = await planFlow(f)
      setFlow(null)
      setFlowPending({ flow: f, etag: plan.etag })
      setPending({
        plan,
        title: `/${f.name} · ${f.steps.length} paso${f.steps.length === 1 ? '' : 's'}`,
      })
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }, [])

  /**
   * Arrastrar de un agente a una skill escribe la encomienda en el CUERPO del agente, que es
   * donde el usuario ya las tenía a mano. No se toca `skills:` del frontmatter: precargar es
   * otra decisión, más cara, y se ofrece aparte.
   */
  const onDrawEdge = useCallback(
    async (fromId: string, toId: string) => {
      if (!snapshot) return
      const agent = snapshot.catalog.agents.find((a) => a.id === fromId)
      const skill = snapshot.catalog.skills.find((sk) => sk.id === toId)
      if (!agent || !skill) return
      const actuales = snapshot.edges
        .filter((e) => e.from === fromId && e.kind === 'agent-uses-skill' && e.layer === 'declared')
        .map((e) => e.to.split('/').pop() ?? '')
        .filter(Boolean)
      if (actuales.includes(skill.name)) {
        setSaveError(`${agent.name} ya menciona ${skill.name} en su prompt.`)
        return
      }
      const req: MutationRequest = {
        kind: 'agent.skillMentions',
        entityId: fromId,
        value: [...new Set([...actuales, skill.name])],
      }
      try {
        const plan = await planMutation(req)
        setSaveError(null)
        setPending({ req, plan, title: `${agent.name} consultará ${skill.name}` })
      } catch (e) {
        setSaveError((e as Error).message)
      }
    },
    [snapshot],
  )

  /** Cualquier edición de la ficha: se planea, se enseña el diff y solo entonces se escribe. */
  const pedirMutacion = useCallback(async (req: MutationRequest, title: string) => {
    try {
      const plan = await planMutation(req)
      setSaveError(null)
      setFlowPending(null)
      setPending({ req, plan, title })
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }, [])

  const confirmar = useCallback(async () => {
    if (!pending) return
    setSaving(true)
    setSaveError(null)
    try {
      // El mismo diálogo de diff sirve para las dos clases de escritura: una arista del grafo
      // o un comando entero compilado desde el lienzo.
      if (flowPending) await saveFlow(flowPending.flow, flowPending.etag)
      else if (pending.req) await applyMutation({ ...pending.req, etag: pending.plan.etag })
      setPending(null)
      setFlowPending(null)
      reload()
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [pending, flowPending, reload])

  if (error) return <div className="loading">{error}</div>
  if (!snapshot) return <div className="loading">leyendo ~/.claude…</div>

  const s = snapshot.stats
  return (
    <div className="app">
      <header className="bar">
        <h1 className="marca">
          ai<span>-</span>office
        </h1>
        <div className="views">
          {(['sala', 'plano'] as const).map((v) => (
            <button
              key={v}
              type="button"
              data-on={view === v}
              onClick={() => {
                setView(v)
                if (v === 'sala') setEditing(false)
              }}
            >
              {v === 'sala' ? 'Sala' : 'Plano'}
            </button>
          ))}
        </div>
        {/* El número primero y el rótulo debajo: una barra de estado se lee de un vistazo o no
            se lee. Lo que está sin estrenar va en rojo porque es la lista de trabajo. */}
        <div className="lecturas">
          <div className="lectura">
            <b>{s.agents}</b>
            <span>agentes</span>
          </div>
          <div className="lectura alerta">
            <b>{s.agentsUnused}</b>
            <span>sin estrenar</span>
          </div>
          <div className="lectura">
            <b>{s.skills}</b>
            <span>skills</span>
          </div>
          <div className="lectura alerta">
            <b>{s.skillsUnused}</b>
            <span>sin usar</span>
          </div>
          <div className="lectura">
            <b>{s.commands}</b>
            <span>comandos</span>
          </div>
          <div className="lectura alerta">
            <b>{s.commands - s.commandsUsed}</b>
            <span>sin ejecutar</span>
          </div>
          <div className="lectura grande">
            <b>{pct(s.activeRatio)}</b>
            <span>ratio activo</span>
          </div>
        </div>
        <button
          type="button"
          className="modo"
          data-on={editing}
          onClick={() => setEditing((v) => !v)}
          title="Arrastra de un agente a una skill para escribir la relación en su prompt"
        >
          {editing ? 'editando' : 'editar grafo'}
        </button>
        <button
          type="button"
          className="modo"
          onClick={nuevoFlujo}
          title="Componer un slash command"
        >
          nuevo flujo
        </button>
        <span className="grow" />
        {live.sessions.length > 0 && (
          <span className="stat live">
            <span className="dot" /> {live.sessions.length} sesión
            {live.sessions.length === 1 ? '' : 'es'} en curso
          </span>
        )}
        <div className="lecturas">
          <div className="lectura">
            <b>{s.declaredAgentSkill}</b>
            <span>declaradas</span>
          </div>
          <div className="lectura">
            <b>{s.provenAgentSkill}</b>
            <span>demostradas</span>
          </div>
        </div>
      </header>
      <div className="layout">
        {view === 'sala' ? (
          <Sala
            snapshot={snapshot}
            selected={selected}
            onSelect={setSelected}
            lastTouch={live.lastTouch}
          />
        ) : (
          <Plano
            snapshot={snapshot}
            selected={selected}
            onSelect={setSelected}
            editing={editing}
            onDrawEdge={onDrawEdge}
          />
        )}
        <Ficha
          snapshot={snapshot}
          id={selected}
          onEditFlow={editarFlujo}
          onMutate={pedirMutacion}
        />
      </div>
      {flow && (
        <FlowEditor
          snapshot={snapshot}
          flow={flow}
          onCancel={() => setFlow(null)}
          onSave={prepararGuardadoFlujo}
        />
      )}
      {pending && (
        <DiffDialog
          plan={pending.plan}
          title={pending.title}
          busy={saving}
          error={saveError}
          onCancel={() => {
            setPending(null)
            setFlowPending(null)
            setSaveError(null)
          }}
          onConfirm={confirmar}
        />
      )}
      {!pending && saveError && (
        <div className="aviso-flotante" onClick={() => setSaveError(null)} role="presentation">
          {saveError}
        </div>
      )}
    </div>
  )
}

// Sin StrictMode a propósito: su doble montaje en desarrollo duplica la aplicación de Pixi
// y deja artefactos en el canvas.
createRoot(document.getElementById('root') as HTMLElement).render(<App />)
