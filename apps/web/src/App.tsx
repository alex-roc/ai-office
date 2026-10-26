import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Avisos, useAvisos } from './Avisos.tsx'
import { Ayuda, Bienvenida } from './Ayuda.tsx'
import { fetchSnapshot, getToken, subscribeToken } from './api.ts'
import { Buscador } from './Buscador.tsx'
import { Cabecera } from './Cabecera.tsx'
import { Crear } from './Crear.tsx'
import { hayDialogoAbierto } from './Dialogo.tsx'
import { DiffDialog } from './Diff.tsx'
import { DEMO, urlInstalar } from './demo.ts'
import { erroresDeEscaneo, sinArchivados } from './derivados.ts'
import { ApiError, mensajeDeError } from './errores.ts'
import { type EstadoVisor, Ficha, type Vista } from './Ficha.tsx'
import type { PedirLote, PedirMutacion } from './FichaEdicion.tsx'
import { FlowEditor } from './FlowEditor.tsx'
import { type Flow, openFlow, planFlow, saveFlow } from './flows.ts'
import { useLang, useT } from './i18n/react.ts'
import { Ledger } from './Ledger.tsx'
import { useLiveConnection, useLiveSelector } from './live.ts'
import {
  applyMutation,
  type CreateRequest,
  createEntity,
  type MutationPlan,
  type MutationRequest,
  planCreate,
  planMutation,
} from './mutations.ts'
import { Plano } from './Plano.tsx'
import { conCodigo } from './Rico.tsx'
import { Sala } from './sala/Sala.tsx'
import type { Snapshot } from './types.ts'
import type { ControlVista } from './vista.ts'

/** Un cambio de un lote: se planea junto a los demás y se escribe en orden al confirmar. */
interface ItemLote {
  req: MutationRequest
  plan: MutationPlan
  title: string
}

/** Lo que espera confirmación en el diálogo de diff: una arista suelta, un comando entero, un lote o una creación. */
interface Pendiente {
  req?: MutationRequest
  /** Presente cuando lo que se va a guardar es un flujo entero. */
  flow?: Flow
  /** Presente cuando se va a crear un archivo nuevo. */
  crear?: CreateRequest
  /** Varios cambios en archivos distintos, con un solo diff y una sola confirmación. */
  lote?: ItemLote[]
  /** Qué hacer tras guardar con éxito (cerrar el diálogo de edición que pidió el diff). */
  alGuardar?: () => void
  plan: MutationPlan
  title: string
}

/** Pantalla cuando aún no hay snapshot y no se pudo conseguir: qué pasó y cómo arreglarlo. */
const PantallaError = ({
  error,
  cargando,
  onReintentar,
}: {
  error: unknown
  cargando: boolean
  onReintentar: () => void
}) => {
  const t = useT()
  return (
    <div className="pantalla-error" role="alert">
      <h1>{t('app.error.title')}</h1>
      <p>{conCodigo(mensajeDeError(error))}</p>
      <ol>
        <li>{conCodigo(t('app.error.step1'))}</li>
        <li>{conCodigo(t('app.error.step2'))}</li>
        <li>{conCodigo(t('app.error.step3'))}</li>
      </ol>
      <button type="button" className="primario" onClick={onReintentar} disabled={cargando}>
        {cargando ? t('app.retrying') : t('app.retry')}
      </button>
    </div>
  )
}

const App = () => {
  const t = useT()
  const lang = useLang()
  const token = useSyncExternalStore(subscribeToken, getToken)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  // El error se guarda sin traducir y se redacta al pintarlo: cambia de idioma con el conmutador.
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('sala')
  const [editing, setEditing] = useState(false)
  const [creando, setCreando] = useState<CreateRequest['kind'] | null>(null)
  const [visor, setVisor] = useState<EstadoVisor | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [ayuda, setAyuda] = useState(false)
  const { avisos, avisar, cerrar } = useAvisos()

  const salaRef = useRef<ControlVista>(null)
  const planoRef = useRef<ControlVista>(null)
  const controlActivo = useCallback(
    () => (vista === 'sala' ? salaRef.current : vista === 'plano' ? planoRef.current : null),
    [vista],
  )
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  // El visor de archivo pertenece a la ficha que lo abrió: al elegir otra cosa se cierra.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo reacciona a `selected`
  useEffect(() => setVisor(null), [selected])

  // --- Carga del snapshot ---------------------------------------------------------------------
  // Un error ya no reemplaza la aplicación: se conserva el último snapshot bueno y el fallo sale
  // en una banda con "reintentar". Solo si nunca hubo snapshot hay pantalla de error. La
  // secuencia descarta respuestas viejas: un reintento lento no debe pisar a uno más reciente.
  const secuencia = useRef(0)
  const errorRef = useRef<unknown>(null)
  errorRef.current = error
  const reload = useCallback((): Promise<void> => {
    const n = ++secuencia.current
    setCargando(true)
    return fetchSnapshot().then(
      (s) => {
        if (n !== secuencia.current) return
        setSnapshot(s)
        setError(null)
        setCargando(false)
      },
      (e: unknown) => {
        if (n !== secuencia.current) return
        setError(e)
        setCargando(false)
      },
    )
  }, [])
  // Para quien solo necesita disparar la recarga (efectos, WebSocket) sin esperar su resultado.
  const recargar = useCallback(() => {
    void reload()
  }, [reload])
  useEffect(recargar, [recargar])
  // Pegar un enlace nuevo con otro token (el daemon genera uno en cada arranque): recargar ya.
  useEffect(() => subscribeToken(recargar), [recargar])

  // La actividad en vivo llega por WebSocket; si el servidor no la ofrece, la interfaz
  // funciona igual y solo se pierde la animación. No devuelve estado: un evento en vivo no
  // re-renderiza `App`, solo a quien lee el contador (ver `live.ts`).
  useLiveConnection(token, recargar)
  // Si el daemon vuelve (el WebSocket se reconecta) y la carga había fallado, se reintenta sola.
  const conectado = useLiveSelector((s) => s.connected)
  useEffect(() => {
    if (conectado && errorRef.current) recargar()
  }, [conectado, recargar])

  // La Sala y el editor no ven los agentes archivados; la ficha y el buscador, sí.
  const dibujado = useMemo(() => (snapshot ? sinArchivados(snapshot) : null), [snapshot])

  // --- Escrituras -----------------------------------------------------------------------------
  const [flow, setFlow] = useState<{ flow: Flow; clave: number } | null>(null)
  const [pending, setPending] = useState<Pendiente | null>(null)
  const [saving, setSaving] = useState(false)
  const [diffError, setDiffError] = useState<unknown>(null)

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
          title: t('diff.title.flow', {
            name: f.name,
            steps: t('count.steps', { n: f.steps.length }),
          }),
        })
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [avisar, t],
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
        avisar('info', t('toast.agentOnly'))
        return
      }
      if (!skill) return
      const actuales = snapshot.edges
        .filter((e) => e.from === fromId && e.kind === 'agent-uses-skill' && e.layer === 'declared')
        .map((e) => e.to.split('/').pop() ?? '')
        .filter(Boolean)
      if (actuales.includes(skill.name)) {
        // No es un fallo: la relación ya está escrita y no hay nada que hacer.
        avisar('info', t('toast.alreadyMentions', { agent: agent.name, skill: skill.name }))
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
        setPending({
          req,
          plan,
          title: t('diff.title.consult', { agent: agent.name, skill: skill.name }),
        })
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [snapshot, avisar, t],
  )

  /** Cualquier edición de la ficha: se planea, se enseña el diff y solo entonces se escribe. */
  const pedirMutacion = useCallback<PedirMutacion>(
    async (req, title, alGuardar) => {
      try {
        const plan = await planMutation(req)
        setDiffError(null)
        setPending({ req, plan, title, alGuardar })
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [avisar],
  )

  /**
   * Varias mutaciones en archivos distintos (asignar una skill a varios agentes): se planean todas
   * antes de enseñar nada, y el diálogo las muestra juntas con un solo "guardar".
   */
  const pedirLote = useCallback<PedirLote>(
    async (items, title, alGuardar) => {
      if (items.length === 0) {
        avisar('info', t('toast.nothingToAssign'))
        return
      }
      try {
        const planes = await Promise.all(items.map((i) => planMutation(i.req)))
        const lote = items.map((i, n) => ({ ...i, plan: planes[n] as MutationPlan }))
        setDiffError(null)
        setPending({ lote, plan: (lote[0] as ItemLote).plan, title, alGuardar })
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [avisar, t],
  )

  /** Crear un agente, una skill o un comando: el plan enseña el diff y el diálogo sigue debajo. */
  const prepararCreacion = useCallback(
    async (req: CreateRequest) => {
      try {
        const plan = await planCreate(req)
        setDiffError(null)
        setPending({
          crear: req,
          plan: { ...plan, etag: '' },
          title: t('diff.title.create', { kind: t(`kind.${req.kind}`), name: req.name }),
        })
      } catch (e) {
        avisar('error', mensajeDeError(e))
      }
    },
    [avisar, t],
  )

  /** Abre el visor de archivo de una entidad (opcionalmente en una línea). */
  const abrirVisor = useCallback((id: string, linea?: number) => {
    setVisor((prev) => ({ id, linea, disparo: (prev?.disparo ?? 0) + 1 }))
  }, [])

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
        avisar('ok', t('toast.flowSaved', { name: pending.flow.name }))
      } else if (pending.crear) {
        const r = await createEntity(pending.crear)
        const nombre = pending.crear.name
        setPending(null)
        await reload()
        setCreando(null)
        setSelected(r.id)
        avisar('ok', t('toast.created', { name: nombre }))
        return
      } else if (pending.lote) {
        // En orden y uno a uno: son archivos distintos, cada uno con su etag. Si uno falla, lo ya
        // escrito se retira del diálogo y quedan los pendientes, con el error a la vista.
        const hechos = new Set<ItemLote>()
        try {
          for (const item of pending.lote) {
            if (item.plan.changed) await applyMutation({ ...item.req, etag: item.plan.etag })
            hechos.add(item)
          }
        } catch (e) {
          const restantes = pending.lote.filter((i) => !hechos.has(i))
          if (hechos.size > 0 && restantes.length > 0) {
            setPending({ ...pending, lote: restantes, plan: (restantes[0] as ItemLote).plan })
            reload()
          }
          throw e
        }
        avisar('ok', t('toast.saved', { title: pending.title }))
      } else if (pending.req) {
        await applyMutation({ ...pending.req, etag: pending.plan.etag })
        const { kind, entityId } = pending.req
        if (kind === 'agent.archive') {
          // Un agente archivado deja de dibujarse: seguir mostrando su ficha como si estuviera
          // ahí despistaba.
          if (selectedRef.current === entityId) setSelected(null)
          avisar('ok', t('toast.archived'))
        } else if (kind === 'agent.unarchive') {
          avisar('ok', t('toast.unarchived'))
        } else {
          avisar('ok', t('toast.saved', { title: pending.title }))
        }
      }
      setPending(null)
      pending.alGuardar?.()
      reload()
    } catch (e) {
      if (e instanceof ApiError && e.clase === 'conflicto') {
        // El archivo cambió desde que se calculó el diff: se vuelve a lo que había (el editor,
        // con todo intacto) y se avisa. Reintentar vuelve a pedir un plan con el etag nuevo.
        setPending(null)
        avisar('error', e.message)
        reload()
      } else {
        setDiffError(e)
      }
    } finally {
      setSaving(false)
    }
  }, [pending, avisar, reload, t])

  // --- Vistas, búsqueda y teclado -------------------------------------------------------------
  const elegirVista = useCallback((v: Vista) => {
    setVista(v)
    if (v !== 'plano') setEditing(false)
    // Lo seleccionado en una vista se encuentra en la otra: se centra si tiene representación.
    const id = selectedRef.current
    if (id && v !== 'registro') (v === 'sala' ? salaRef : planoRef).current?.centrarEn(id)
  }, [])

  const elegirDelBuscador = useCallback(
    (id: string) => {
      setBuscando(false)
      setSelected(id)
      const ok = controlActivo()?.centrarEn(id)
      if (ok === false) {
        avisar('info', t(vista === 'sala' ? 'toast.notDrawn.office' : 'toast.notDrawn.current'))
      }
    },
    [controlActivo, avisar, vista, t],
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
        case '3':
          elegirVista('registro')
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
    if (error) return <PantallaError error={error} cargando={cargando} onReintentar={reload} />
    return <div className="loading">{t(DEMO ? 'app.loading.demo' : 'app.loading')}</div>
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
        onNuevo={setCreando}
        onEncuadrar={encuadrar}
        onBuscar={() => setBuscando(true)}
        onAyuda={() => setAyuda(true)}
      />
      {DEMO && (
        <div className="banda demo" role="note">
          <span>{t('demo.band')}</span>
          <a href={urlInstalar(lang)}>{t('demo.install')}</a>
        </div>
      )}
      {error !== null && (
        <div className="banda error" role="alert">
          <span>{conCodigo(mensajeDeError(error))}</span>
          <button type="button" onClick={reload} disabled={cargando}>
            {cargando ? t('band.retrying') : t('band.retry')}
          </button>
        </div>
      )}
      {erroresEscaneo.length > 0 && (
        <details className="banda escaneo">
          <summary>{t('band.scan', { n: erroresEscaneo.length })}</summary>
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
          <div
            className="vista"
            data-activa={vista === 'registro'}
            aria-hidden={vista !== 'registro'}
          >
            <Ledger snapshot={snapshot} selected={selected} onSelect={setSelected} />
          </div>
        </div>
        <Ficha
          snapshot={snapshot}
          id={selected}
          vista={vista}
          onEditFlow={editarFlujo}
          onMutate={pedirMutacion}
          onLote={pedirLote}
          onSelect={setSelected}
          visor={visor}
          onVisor={abrirVisor}
          onCerrarVisor={() => setVisor(null)}
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
      {creando && (
        <Crear
          kind={creando}
          snapshot={snapshot}
          onCerrar={() => setCreando(null)}
          onRevisar={prepararCreacion}
          onFlujo={
            creando === 'command'
              ? () => {
                  setCreando(null)
                  nuevoFlujo()
                }
              : undefined
          }
        />
      )}
      {pending && (
        <DiffDialog
          plan={pending.plan}
          lote={pending.lote?.map((i) => ({ plan: i.plan, title: i.title }))}
          title={pending.title}
          busy={saving}
          error={diffError ? mensajeDeError(diffError) : null}
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
