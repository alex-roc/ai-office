import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Avisos, useAvisos } from './Avisos.tsx'
import { Ayuda, Bienvenida } from './Ayuda.tsx'
import { fetchSnapshot, getToken, subscribeToken } from './api.ts'
import { Buscador } from './Buscador.tsx'
import { Cabecera } from './Cabecera.tsx'
import { hayDialogoAbierto } from './Dialogo.tsx'
import { DiffDialog } from './Diff.tsx'
import { erroresDeEscaneo, sinArchivados } from './derivados.ts'
import { ApiError, mensajeDeError } from './errores.ts'
import { Ficha, type Vista } from './Ficha.tsx'
import { FlowEditor } from './FlowEditor.tsx'
import { type Flow, openFlow, planFlow, saveFlow } from './flows.ts'
import { useLiveConnection, useLiveSelector } from './live.ts'
import {
  applyMutation,
  type MutationPlan,
  type MutationRequest,
  planMutation,
} from './mutations.ts'
import { Plano } from './Plano.tsx'
import { conCodigo } from './Rico.tsx'
import { Sala } from './sala/Sala.tsx'
import { plural } from './texto.ts'
import type { Snapshot } from './types.ts'
import type { ControlVista } from './vista.ts'

/** Lo que espera confirmación en el diálogo de diff: una arista suelta o un comando entero. */
interface Pendiente {
  req?: MutationRequest
  /** Presente cuando lo que se va a guardar es un flujo entero. */
  flow?: Flow
  plan: MutationPlan
  title: string
}

/** Pantalla cuando aún no hay snapshot y no se pudo conseguir: qué pasó y cómo arreglarlo. */
const PantallaError = ({
  mensaje,
  cargando,
  onReintentar,
}: {
  mensaje: string
  cargando: boolean
  onReintentar: () => void
}) => (
  <div className="pantalla-error" role="alert">
    <h1>No se pudo leer tu configuración</h1>
    <p>{conCodigo(mensaje)}</p>
    <ol>
      <li>
        Arranca el daemon: <code>ai-office</code>, o <code>pnpm dev</code> dentro del repo.
      </li>
      <li>
        Abre el enlace que imprime, que acaba en <code>#t=…</code>: lleva el token. También puedes
        pegarlo en esta pestaña; se recargará sola.
      </li>
      <li>El token cambia en cada arranque del daemon, así que un enlace viejo deja de valer.</li>
    </ol>
    <button type="button" className="primario" onClick={onReintentar} disabled={cargando}>
      {cargando ? 'Reintentando…' : 'Reintentar'}
    </button>
  </div>
)

const App = () => {
  const token = useSyncExternalStore(subscribeToken, getToken)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('sala')
  const [editing, setEditing] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const { avisos, avisar, cerrar } = useAvisos()

  const salaRef = useRef<ControlVista>(null)
  const planoRef = useRef<ControlVista>(null)
  const controlActivo = useCallback(
    () => (vista === 'sala' ? salaRef.current : planoRef.current),
    [vista],
  )
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  // --- Carga del snapshot ---------------------------------------------------------------------
  // Un error ya no reemplaza la aplicación: se conserva el último snapshot bueno y el fallo sale
  // en una banda con "reintentar". Solo si nunca hubo snapshot hay pantalla de error. La
  // secuencia descarta respuestas viejas: un reintento lento no debe pisar a uno más reciente.
  const secuencia = useRef(0)
  const errorRef = useRef<string | null>(null)
  errorRef.current = error
  const reload = useCallback(() => {
    const n = ++secuencia.current
    setCargando(true)
    fetchSnapshot().then(
      (s) => {
        if (n !== secuencia.current) return
        setSnapshot(s)
        setError(null)
        setCargando(false)
      },
      (e: unknown) => {
        if (n !== secuencia.current) return
        setError(mensajeDeError(e))
        setCargando(false)
      },
    )
  }, [])
  useEffect(reload, [reload])
  // Pegar un enlace nuevo con otro token (el daemon genera uno en cada arranque): recargar ya.
  useEffect(() => subscribeToken(reload), [reload])

  // La actividad en vivo llega por WebSocket; si el servidor no la ofrece, la interfaz
  // funciona igual y solo se pierde la animación. No devuelve estado: un evento en vivo no
  // re-renderiza `App`, solo a quien lee el contador (ver `live.ts`).
  useLiveConnection(token, reload)
  // Si el daemon vuelve (el WebSocket se reconecta) y la carga había fallado, se reintenta sola.
  const conectado = useLiveSelector((s) => s.connected)
  useEffect(() => {
    if (conectado && errorRef.current) reload()
  }, [conectado, reload])

  // La Sala y el editor no ven los agentes archivados; la ficha y el buscador, sí.
  const dibujado = useMemo(() => (snapshot ? sinArchivados(snapshot) : null), [snapshot])

  // --- Escrituras -----------------------------------------------------------------------------
  const [flow, setFlow] = useState<{ flow: Flow; clave: number } | null>(null)
  const [pending, setPending] = useState<Pendiente | null>(null)
  const [saving, setSaving] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)

  /** Abre un comando en el lienzo, recuperando los pasos que ya tuviera escritos. */
  const editarFlujo = useCallback(
    async (commandId: string) => {
      try {
        const r = await openFlow(commandId)
        setFlow((prev) => ({ flow: r.flow, clave: (prev?.clave ?? 0) + 1 }))
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [avisar],
  )

  const nuevoFlujo = useCallback(() => {
    setFlow((prev) => ({
      flow: { name: '', description: '', steps: [] },
      clave: (prev?.clave ?? 0) + 1,
    }))
  }, [])

  /**
   * El editor NO se cierra al pedir el diff: el diálogo de diff se abre encima. Cancelar el diff,
   * o un conflicto de etag al guardar, devuelven al editor con todo lo escrito intacto; solo un
   * guardado con éxito lo cierra.
   */
  const prepararGuardadoFlujo = useCallback(
    async (f: Flow) => {
      try {
        const plan = await planFlow(f)
        setDiffError(null)
        setPending({
          flow: f,
          plan,
          title: `/${f.name} · ${plural(f.steps.length, 'paso', 'pasos')}`,
        })
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [avisar],
  )

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
      if (!agent) {
        avisar(
          'info',
          'Solo un agente tiene un prompt donde escribir la relación. Arrastra desde un agente.',
        )
        return
      }
      if (!skill) return
      const actuales = snapshot.edges
        .filter((e) => e.from === fromId && e.kind === 'agent-uses-skill' && e.layer === 'declared')
        .map((e) => e.to.split('/').pop() ?? '')
        .filter(Boolean)
      if (actuales.includes(skill.name)) {
        // No es un fallo: la relación ya está escrita y no hay nada que hacer.
        avisar('info', `${agent.name} ya menciona ${skill.name} en su prompt.`)
        return
      }
      const req: MutationRequest = {
        kind: 'agent.skillMentions',
        entityId: fromId,
        value: [...new Set([...actuales, skill.name])],
      }
      try {
        const plan = await planMutation(req)
        setDiffError(null)
        setPending({ req, plan, title: `${agent.name} consultará ${skill.name}` })
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [snapshot, avisar],
  )

  /** Cualquier edición de la ficha: se planea, se enseña el diff y solo entonces se escribe. */
  const pedirMutacion = useCallback(
    async (req: MutationRequest, title: string) => {
      try {
        const plan = await planMutation(req)
        setDiffError(null)
        setPending({ req, plan, title })
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [avisar],
  )

  const cancelarDiff = useCallback(() => {
    setPending(null)
    setDiffError(null)
  }, [])

  const confirmar = useCallback(async () => {
    if (!pending) return
    setSaving(true)
    setDiffError(null)
    try {
      // El mismo diálogo de diff sirve para las dos clases de escritura: una arista del grafo
      // o un comando entero compilado desde el lienzo.
      if (pending.flow) {
        await saveFlow(pending.flow, pending.plan.etag)
        setFlow(null)
        avisar('ok', `Guardado el comando /${pending.flow.name}.`)
      } else if (pending.req) {
        await applyMutation({ ...pending.req, etag: pending.plan.etag })
        const { kind, entityId } = pending.req
        if (kind === 'agent.archive') {
          // Un agente archivado deja de dibujarse: seguir mostrando su ficha como si estuviera
          // ahí despistaba.
          if (selectedRef.current === entityId) setSelected(null)
          avisar('ok', 'Agente archivado. Puedes restaurarlo desde la ficha vacía.')
        } else if (kind === 'agent.unarchive') {
          avisar('ok', 'Agente restaurado.')
        } else {
          avisar('ok', `Guardado: ${pending.title}.`)
        }
      }
      setPending(null)
      reload()
    } catch (e) {
      if (e instanceof ApiError && e.clase === 'conflicto') {
        // El archivo cambió desde que se calculó el diff: se vuelve a lo que había (el editor,
        // con todo intacto) y se avisa. Reintentar vuelve a pedir un plan con el etag nuevo.
        setPending(null)
        avisar('error', e.message)
        reload()
      } else {
        setDiffError(mensajeDeError(e))
      }
    } finally {
      setSaving(false)
    }
  }, [pending, avisar, reload])

  // --- Vistas, búsqueda y teclado -------------------------------------------------------------
  const elegirVista = useCallback((v: Vista) => {
    setVista(v)
    if (v !== 'plano') setEditing(false)
    // Lo seleccionado en una vista se encuentra en la otra: se centra si tiene representación.
    const id = selectedRef.current
    if (id) (v === 'sala' ? salaRef : planoRef).current?.centrarEn(id)
  }, [])

  const elegirDelBuscador = useCallback(
    (id: string) => {
      setBuscando(false)
      setSelected(id)
      const ok = controlActivo()?.centrarEn(id)
      if (ok === false) {
        avisar(
          'info',
          `La ${vista === 'sala' ? 'Sala' : 'vista actual'} no dibuja esto (los agentes archivados, por ejemplo). Mira su ficha a la derecha.`,
        )
      }
    },
    [controlActivo, avisar, vista],
  )

  const avisoInfo = useCallback((texto: string) => avisar('info', texto), [avisar])

  const encuadrar = useCallback(() => controlActivo()?.encuadrar(), [controlActivo])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      // Con un diálogo abierto el teclado es suyo (Esc, Tab, flechas del buscador).
      if (hayDialogoAbierto()) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      switch (e.key) {
        case '1':
          elegirVista('sala')
          break
        case '2':
          elegirVista('plano')
          break
        case '+':
        case '=':
          controlActivo()?.zoom(1)
          break
        case '-':
        case '_':
          controlActivo()?.zoom(-1)
          break
        case '0':
          controlActivo()?.encuadrar()
          break
        case '/':
          e.preventDefault()
          setBuscando(true)
          break
        case '?':
          setAyuda(true)
          break
        case 'Escape':
          if (selectedRef.current) setSelected(null)
          break
        default:
          return
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [elegirVista, controlActivo])

  // --- Pintado --------------------------------------------------------------------------------
  if (!snapshot || !dibujado) {
    if (error) return <PantallaError mensaje={error} cargando={cargando} onReintentar={reload} />
    return <div className="loading">leyendo ~/.claude…</div>
  }

  const erroresEscaneo = erroresDeEscaneo(snapshot)

  return (
    <div className="app">
      <Cabecera
        snapshot={snapshot}
        vista={vista}
        onVista={elegirVista}
        editing={editing}
        onEditing={setEditing}
        onNuevoFlujo={nuevoFlujo}
        onEncuadrar={encuadrar}
        onBuscar={() => setBuscando(true)}
        onAyuda={() => setAyuda(true)}
      />
      {error && (
        <div className="banda error" role="alert">
          <span>{conCodigo(error)}</span>
          <button type="button" onClick={reload} disabled={cargando}>
            {cargando ? 'reintentando…' : 'reintentar'}
          </button>
        </div>
      )}
      {erroresEscaneo.length > 0 && (
        <details className="banda escaneo">
          <summary>
            {plural(
              erroresEscaneo.length,
              'archivo no se pudo leer',
              'archivos no se pudieron leer',
            )}{' '}
            y falta en lo que ves
          </summary>
          <ul>
            {erroresEscaneo.map((m) => (
              <li key={m}>
                <code>{m}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      <Bienvenida onAyuda={() => setAyuda(true)} />
      <main className="layout">
        {/* Las dos vistas viven montadas a la vez y se alterna su visibilidad: destruir y
            recrear Pixi en cada cambio tardaba y perdía la cámara. */}
        <div className="escenario">
          <div className="vista" data-activa={vista === 'sala'} aria-hidden={vista !== 'sala'}>
            <Sala
              ref={salaRef}
              snapshot={dibujado}
              selected={selected}
              onSelect={setSelected}
              activa={vista === 'sala'}
            />
          </div>
          <div className="vista" data-activa={vista === 'plano'} aria-hidden={vista !== 'plano'}>
            <Plano
              ref={planoRef}
              snapshot={dibujado}
              selected={selected}
              onSelect={setSelected}
              editing={editing}
              onDrawEdge={onDrawEdge}
              onAviso={avisoInfo}
            />
          </div>
        </div>
        <Ficha
          snapshot={snapshot}
          id={selected}
          vista={vista}
          onEditFlow={editarFlujo}
          onMutate={pedirMutacion}
          onSelect={setSelected}
        />
      </main>
      {flow && (
        <FlowEditor
          key={flow.clave}
          snapshot={dibujado}
          flow={flow.flow}
          onCancel={() => setFlow(null)}
          onSave={prepararGuardadoFlujo}
        />
      )}
      {pending && (
        <DiffDialog
          plan={pending.plan}
          title={pending.title}
          busy={saving}
          error={diffError}
          onCancel={cancelarDiff}
          onConfirm={confirmar}
        />
      )}
      {buscando && (
        <Buscador
          snapshot={snapshot}
          onElegir={elegirDelBuscador}
          onCerrar={() => setBuscando(false)}
        />
      )}
      {ayuda && <Ayuda onCerrar={() => setAyuda(false)} />}
      <Avisos avisos={avisos} onCerrar={cerrar} />
    </div>
  )
}

export default App
