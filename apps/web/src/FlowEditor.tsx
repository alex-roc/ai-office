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
import { useLang, useT } from './i18n/react.ts'
import { conCodigo } from './Rico.tsx'
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
  const t = useT()
  const lang = useLang()
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: `lang` no se lee dentro, pero hay que volver a pedir la vista previa
  useEffect(() => {
    let vigente = true
    const espera = setTimeout(() => {
      previewFlow(flow).then(
        (r) => {
          if (vigente) setMarkdown(r.markdown)
        },
        (e) => {
          if (vigente) setMarkdown(`${t('flow.preview.failed')}\n\n${mensajeDeError(e)}`)
        },
      )
    }, ESPERA_PREVIA_MS)
    return () => {
      vigente = false
      clearTimeout(espera)
    }
    // `lang` no se lee dentro: solo vuelve a pedir la vista previa, que es el Markdown que se
    // escribiría y sale en el idioma de la interfaz.
  }, [flow, t, lang])

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
  if (name.trim().length === 0) faltas.push(t('flow.missing.name'))
  if (steps.length === 0) faltas.push(t('flow.missing.steps'))
  else if (steps.some((s) => !s.agent)) faltas.push(t('flow.missing.agent'))
  else if (steps.some((s) => !s.task.trim())) faltas.push(t('flow.missing.task'))
  const valido = faltas.length === 0

  return (
    <>
      <Dialogo
        titulo={t('flow.title', { name: name || t('flow.untitled') })}
        onCerrar={intentarCerrar}
        ancho
        inicial="input"
      >
        <div className="campos">
          <label>
            {t('flow.name')}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('flow.name.placeholder')}
            />
          </label>
          <label className="crece">
            {t('flow.description')}
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('flow.description.placeholder')}
            />
          </label>
        </div>

        <div className="lienzo">
          <div className="pasos">
            {sinAgentes && (
              <p className="aviso" role="status">
                {conCodigo(t('flow.noAgents'))}
              </p>
            )}
            {steps.length === 0 && !sinAgentes && <p className="empty">{t('flow.noSteps')}</p>}
            {steps.map((step, i) => {
              const aLaVez = vaConAnterior(steps, i)
              const conocido = agentes.some((a) => a.name === step.agent)
              return (
                <div className="paso" key={step.uid}>
                  <div className="paso-cabecera">
                    <span className="fase">
                      {aLaVez ? t('flow.parallel') : t('flow.phase', { n: step.phase ?? i + 1 })}
                    </span>
                    <div className="paso-acciones">
                      {i > 0 && !aLaVez && (
                        <button
                          type="button"
                          onClick={() => reordenar((p) => unirConAnterior(p, i))}
                          title={t('flow.join.title')}
                        >
                          {t('flow.join')}
                        </button>
                      )}
                      {aLaVez && (
                        <button
                          type="button"
                          onClick={() => reordenar((p) => separarDelGrupo(p, i))}
                          title={t('flow.split.title')}
                        >
                          {t('flow.split')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => reordenar((p) => moverPaso(p, i, -1))}
                        disabled={i === 0 && tamanoDeGrupo(steps, i) <= 1}
                        aria-label={t('flow.up.aria', { n: i + 1 })}
                        title={t('flow.up')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => reordenar((p) => moverPaso(p, i, 1))}
                        disabled={i === steps.length - 1 && tamanoDeGrupo(steps, i) <= 1}
                        aria-label={t('flow.down.aria', { n: i + 1 })}
                        title={t('flow.down')}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => quitar(i)}
                        aria-label={t('flow.remove.aria', { n: i + 1 })}
                        title={t('flow.remove')}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <select
                    value={step.agent}
                    onChange={(e) => setStep(i, { agent: e.target.value })}
                    aria-label={t('flow.agent.aria', { n: i + 1 })}
                  >
                    {!conocido && (
                      <option value={step.agent}>
                        {t('flow.agent.unknown', { agent: step.agent || t('flow.agent.none') })}
                      </option>
                    )}
                    {agentes.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                        {snapshot.activity[a.id]?.uses ? '' : ` · ${t('grade.unused')}`}
                      </option>
                    ))}
                  </select>
                  {!conocido && <p className="nota-paso">{t('flow.agent.unknownNote')}</p>}
                  <input
                    value={step.task}
                    onChange={(e) => setStep(i, { task: e.target.value })}
                    placeholder={t('flow.task.placeholder')}
                    aria-label={t('flow.task.aria', { n: i + 1 })}
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return
                      setStep(i, { skills: [...new Set([...(step.skills ?? []), e.target.value])] })
                    }}
                    aria-label={t('flow.skill.add.aria', { n: i + 1 })}
                  >
                    <option value="">{t('flow.skill.add')}</option>
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
                          title={t('flow.skill.remove')}
                          aria-label={t('flow.skill.remove.aria', { name: k })}
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
              {t('flow.add')}
            </button>
          </div>

          <div className="vista-previa">
            <h4>{t('flow.preview')}</h4>
            <pre>{markdown}</pre>
          </div>
        </div>

        {!valido && (
          <p className="nota-dialogo" id={idFaltas}>
            {t('flow.missing', { list: faltas.join('; ') })}
          </p>
        )}
        <div className="acciones">
          <button type="button" onClick={intentarCerrar}>
            {t('flow.cancel')}
          </button>
          <button
            type="button"
            className="primario"
            disabled={!valido}
            aria-describedby={valido ? undefined : idFaltas}
            onClick={() => onSave(flow)}
          >
            {t('flow.save')}
          </button>
        </div>
      </Dialogo>
      {confirmandoSalida && (
        <Confirmar
          titulo={t('flow.discard.title')}
          texto={t('flow.discard.text')}
          confirmar={t('flow.discard.confirm')}
          onConfirmar={onCancel}
          onCancelar={() => setConfirmandoSalida(false)}
        />
      )}
    </>
  )
}
