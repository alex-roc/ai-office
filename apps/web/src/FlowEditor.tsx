import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Flow, FlowStep } from './flows.ts'
import { previewFlow } from './flows.ts'
import type { Snapshot } from './types.ts'

/**
 * El lienzo de un slash command: quién interviene, en qué orden y qué consulta.
 *
 * Los pasos con la misma fase se ejecutan en paralelo. La vista previa enseña el Markdown real
 * que se va a escribir, porque el archivo generado tiene que ser indistinguible de uno escrito
 * a mano: es lo que el usuario leerá y editará dentro de seis meses.
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
  const [steps, setSteps] = useState<StepRow[]>(() => conUid(initial.steps))
  const [markdown, setMarkdown] = useState('')

  const flow: Flow = useMemo(
    () => ({ name, description, steps: sinUid(steps), notes: initial.notes }),
    [name, description, steps, initial.notes],
  )

  useEffect(() => {
    let vigente = true
    previewFlow(flow).then(
      (r) => {
        if (vigente) setMarkdown(r.markdown)
      },
      () => {
        if (vigente) setMarkdown('(no se pudo generar la vista previa)')
      },
    )
    return () => {
      vigente = false
    }
  }, [flow])

  const setStep = useCallback((i: number, patch: Partial<FlowStep>) => {
    setSteps((prev) => prev.map((s, j) => (i === j ? { ...s, ...patch } : s)))
  }, [])

  const mover = (i: number, delta: number) =>
    setSteps((prev) => {
      const arr = [...prev]
      const j = i + delta
      if (j < 0 || j >= arr.length) return prev
      const a = arr[i]
      const b = arr[j]
      if (!a || !b) return prev
      arr[i] = b
      arr[j] = a
      // Las fases se renumeran al orden visible para que el resultado no sorprenda.
      return arr.map((s, k) => ({ ...s, phase: k + 1 }))
    })

  const quitar = (i: number) => setSteps((prev) => prev.filter((_, j) => j !== i))

  const anadir = () =>
    setSteps((prev) => [
      ...prev,
      {
        uid: siguienteUid++,
        agent: snapshot.catalog.agents[0]?.name ?? '',
        task: '',
        phase: prev.length + 1,
      },
    ])

  /** Une un paso con el anterior en la misma fase: así es como se declara el paralelismo. */
  const conAnterior = (i: number) =>
    setSteps((prev) =>
      prev.map((s, j) => (j === i ? { ...s, phase: prev[i - 1]?.phase ?? s.phase } : s)),
    )

  const valido =
    name.trim().length > 0 && steps.length > 0 && steps.every((s) => s.agent && s.task.trim())

  return (
    <div className="modal-fondo" onClick={onCancel} role="presentation">
      <div
        className="modal ancho"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3>Flujo /{name || 'sin-nombre'}</h3>
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
            {steps.length === 0 && (
              <p className="empty">
                Sin pasos todavía. Un flujo es una secuencia de delegaciones: añade la primera.
              </p>
            )}
            {steps.map((step, i) => {
              const mismaFaseQueAnterior = i > 0 && step.phase === steps[i - 1]?.phase
              return (
                <div className="paso" key={step.uid}>
                  <div className="paso-cabecera">
                    <span className="fase">
                      {mismaFaseQueAnterior ? '↳ a la vez' : `fase ${step.phase ?? i + 1}`}
                    </span>
                    <div className="paso-acciones">
                      {i > 0 && !mismaFaseQueAnterior && (
                        <button
                          type="button"
                          onClick={() => conAnterior(i)}
                          title="Ejecutar a la vez que el paso anterior"
                        >
                          unir
                        </button>
                      )}
                      <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}>
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => mover(i, 1)}
                        disabled={i === steps.length - 1}
                      >
                        ↓
                      </button>
                      <button type="button" onClick={() => quitar(i)}>
                        ✕
                      </button>
                    </div>
                  </div>
                  <select
                    value={step.agent}
                    onChange={(e) => setStep(i, { agent: e.target.value })}
                  >
                    {snapshot.catalog.agents.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                        {snapshot.activity[a.id]?.uses ? '' : ' · sin estrenar'}
                      </option>
                    ))}
                  </select>
                  <input
                    value={step.task}
                    onChange={(e) => setStep(i, { task: e.target.value })}
                    placeholder="qué le encargas"
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      setStep(i, { skills: [...new Set([...(step.skills ?? []), e.target.value])] })
                    }}
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
                        >
                          {k} ✕
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
            <button type="button" className="anadir" onClick={anadir}>
              + añadir paso
            </button>
          </div>

          <div className="vista-previa">
            <h4>lo que se escribirá</h4>
            <pre>{markdown}</pre>
          </div>
        </div>

        <div className="acciones">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="primario"
            disabled={!valido}
            onClick={() => onSave(flow)}
          >
            Ver diff y guardar
          </button>
        </div>
      </div>
    </div>
  )
}
