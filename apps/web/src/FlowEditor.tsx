import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Confirmar, Dialogo } from './Dialogo.tsx'
import { mensajeDeError } from './errores.ts'
import {
  moverPaso,
  normalizarFases,
  separarDelGrupo,
  tamanoDeGrupo,
  unirConAnterior,
  vaConAnterior,
} from './fases.ts'
import type { Flow, FlowStep } from './flows.ts'
import { previewFlow } from './flows.ts'
import type { Snapshot } from './types.ts'

/**
 * El lienzo de un slash command: quién interviene, en qué orden y qué consulta.
 *
 * Los pasos con la misma fase se ejecutan en paralelo. La vista previa enseña el Markdown real
 * que se va a escribir, porque el archivo generado tiene que ser indistinguible de uno escrito
 * a mano: es lo que el usuario leerá y editará dentro de seis meses.
 *
 * La lógica de fases (mover sin deshacer los "a la vez", unir, separar) vive en `fases.ts`,
 * pura y con tests; aquí solo se pinta.
 */
/**
 * Identidad estable por paso, solo para React. No viaja al archivo: si la clave dependiera del
 * agente, cambiar el selector remontaría la fila y borraría la tarea que estabas escribiendo.
 */
interface StepRow extends FlowStep {
  uid: number
}

let siguienteUid = 1
const conUid = (steps: FlowStep[]): StepRow[] => steps.map((s) => ({ ...s, uid: siguienteUid++ }))
const sinUid = (steps: StepRow[]): FlowStep[] => steps.map(({ uid: _uid, ...rest }) => rest)

/** Espera antes de pedir la vista previa: una por pulsación de tecla saturaría al daemon. */
const ESPERA_PREVIA_MS = 300

/** Lo que el usuario puede editar, en una forma comparable para saber si hay cambios sin guardar. */
const huella = (f: Pick<Flow, 'name' | 'description' | 'steps'>): string =>
  JSON.stringify([f.name, f.description, f.steps])

export const FlowEditor = ({
  snapshot,
  flow: initial,
  onCancel,
  onSave,
}: {
  snapshot: Snapshot
  flow: Flow
  onCancel: () => void
  onSave: (flow: Flow) => void
}) => {
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description)
  const [steps, setSteps] = useState<StepRow[]>(() => conUid(normalizarFases(initial.steps)))
  const [markdown, setMarkdown] = useState('')
  const [confirmandoSalida, setConfirmandoSalida] = useState(false)
  const idFaltas = useId()

  // La referencia es lo que había al abrir, ya con las fases renumeradas: renumerar no cuenta
  // como una edición del usuario.
  const [base] = useState(() =>
    huella({
      name: initial.name,
      description: initial.description,
      steps: normalizarFases(initial.steps),
    }),
  )

  const flow: Flow = useMemo(
    () => ({ name, description, steps: sinUid(steps), notes: initial.notes }),
    [name, description, steps, initial.notes],
  )
  const sucio = huella(flow) !== base

  useEffect(() => {
    let vigente = true
    const t = setTimeout(() => {
      previewFlow(flow).then(
        (r) => {
          if (vigente) setMarkdown(r.markdown)
        },
        (e) => {
          if (vigente) setMarkdown(`(no se pudo generar la vista previa)\n\n${mensajeDeError(e)}`)
        },
      )
    }, ESPERA_PREVIA_MS)
    return () => {
      vigente = false
      clearTimeout(t)
    }
  }, [flow])

  /** Cerrar con cambios sin guardar pide confirmación; sin cambios, cierra directamente. */
  const intentarCerrar = useCallback(() => {
    if (sucio) setConfirmandoSalida(true)
    else onCancel()
  }, [sucio, onCancel])

  const setStep = useCallback((i: number, patch: Partial<FlowStep>) => {
    setSteps((prev) => prev.map((s, j) => (i === j ? { ...s, ...patch } : s)))
  }, [])

  /** Aplica una operación de `fases.ts` conservando la identidad (`uid`) de cada fila. */
  const reordenar = (op: (lista: StepRow[]) => StepRow[]) => setSteps((prev) => op(prev))

  const quitar = (i: number) => reordenar((prev) => normalizarFases(prev.filter((_, j) => j !== i)))

  const agentes = snapshot.catalog.agents
  const sinAgentes = agentes.length === 0

  const anadir = () =>
    reordenar((prev) =>
      normalizarFases([
        ...prev,
        { uid: siguienteUid++, agent: agentes[0]?.name ?? '', task: '', phase: prev.length + 1 },
      ]),
    )

  const faltas: string[] = []
  if (name.trim().length === 0) faltas.push('ponle un nombre al comando')
  if (steps.length === 0) faltas.push('añade al menos un paso')
  else if (steps.some((s) => !s.agent)) faltas.push('elige el agente de cada paso')
  else if (steps.some((s) => !s.task.trim())) faltas.push('escribe qué le encargas a cada agente')
  const valido = faltas.length === 0

  return (
    <>
      <Dialogo
        titulo={<>Flujo /{name || 'sin-nombre'}</>}
        onCerrar={intentarCerrar}
        ancho
        inicial="input"
      >
        <div className="campos">
          <label>
            nombre
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="revision-semanal"
            />
          </label>
          <label className="crece">
            descripción
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Qué hace este comando, para el menú de /"
            />
          </label>
        </div>

        <div className="lienzo">
          <div className="pasos">
            {sinAgentes && (
              <p className="aviso" role="status">
                No hay ningún agente en tu catálogo, y un flujo es una secuencia de delegaciones a
                agentes. Crea uno en <code>~/.claude/agents/</code> y vuelve a abrir el editor.
              </p>
            )}
            {steps.length === 0 && !sinAgentes && (
              <p className="empty">
                Sin pasos todavía. Un flujo es una secuencia de delegaciones: añade la primera.
              </p>
            )}
            {steps.map((step, i) => {
              const aLaVez = vaConAnterior(steps, i)
              const conocido = agentes.some((a) => a.name === step.agent)
              return (
                <div className="paso" key={step.uid}>
                  <div className="paso-cabecera">
                    <span className="fase">
                      {aLaVez ? '↳ a la vez' : `fase ${step.phase ?? i + 1}`}
                    </span>
                    <div className="paso-acciones">
                      {i > 0 && !aLaVez && (
                        <button
                          type="button"
                          onClick={() => reordenar((p) => unirConAnterior(p, i))}
                          title="Ejecutar a la vez que el paso anterior"
                        >
                          unir
                        </button>
                      )}
                      {aLaVez && (
                        <button
                          type="button"
                          onClick={() => reordenar((p) => separarDelGrupo(p, i))}
                          title="Sacar este paso del grupo: empieza una fase nueva, después del paso anterior"
                        >
                          separar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => reordenar((p) => moverPaso(p, i, -1))}
                        disabled={i === 0 && tamanoDeGrupo(steps, i) <= 1}
                        aria-label={`Subir el paso ${i + 1}`}
                        title="Subir"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => reordenar((p) => moverPaso(p, i, 1))}
                        disabled={i === steps.length - 1 && tamanoDeGrupo(steps, i) <= 1}
                        aria-label={`Bajar el paso ${i + 1}`}
                        title="Bajar"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => quitar(i)}
                        aria-label={`Quitar el paso ${i + 1}`}
                        title="Quitar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <select
                    value={step.agent}
                    onChange={(e) => setStep(i, { agent: e.target.value })}
                    aria-label={`Agente del paso ${i + 1}`}
                  >
                    {!conocido && (
                      <option value={step.agent}>
                        (desconocido: {step.agent || 'sin agente'})
                      </option>
                    )}
                    {agentes.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                        {snapshot.activity[a.id]?.uses ? '' : ' · sin estrenar'}
                      </option>
                    ))}
                  </select>
                  {!conocido && (
                    <p className="nota-paso">
                      Este paso nombra a un agente que no está en tu catálogo (¿lo borraste o lo
                      archivaste?). Elige otro o se escribirá tal cual.
                    </p>
                  )}
                  <input
                    value={step.task}
                    onChange={(e) => setStep(i, { task: e.target.value })}
                    placeholder="qué le encargas"
                    aria-label={`Tarea del paso ${i + 1}`}
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      setStep(i, { skills: [...new Set([...(step.skills ?? []), e.target.value])] })
                    }}
                    aria-label={`Añadir una skill al paso ${i + 1}`}
                  >
                    <option value="">+ skill que debe consultar</option>
                    {snapshot.catalog.skills.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {step.skills?.length ? (
                    <div className="chips">
                      {step.skills.map((k) => (
                        <button
                          type="button"
                          key={k}
                          className="chip"
                          onClick={() =>
                            setStep(i, { skills: step.skills?.filter((x) => x !== k) })
                          }
                          title="quitar"
                          aria-label={`Quitar la skill ${k}`}
                        >
                          {k} ✕
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
            <button type="button" className="anadir" onClick={anadir} disabled={sinAgentes}>
              + añadir paso
            </button>
          </div>

          <div className="vista-previa">
            <h4>lo que se escribirá</h4>
            <pre>{markdown}</pre>
          </div>
        </div>

        {!valido && (
          <p className="nota-dialogo" id={idFaltas}>
            Para guardar: {faltas.join('; ')}.
          </p>
        )}
        <div className="acciones">
          <button type="button" onClick={intentarCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="primario"
            disabled={!valido}
            aria-describedby={valido ? undefined : idFaltas}
            onClick={() => onSave(flow)}
          >
            Ver diff y guardar
          </button>
        </div>
      </Dialogo>
      {confirmandoSalida && (
        <Confirmar
          titulo="¿Descartar los cambios?"
          texto="Has editado este flujo y todavía no se ha guardado nada en disco. Si sales ahora se pierde lo que llevas."
          confirmar="Descartar y salir"
          onConfirmar={onCancel}
          onCancelar={() => setConfirmandoSalida(false)}
        />
      )}
    </>
  )
}
