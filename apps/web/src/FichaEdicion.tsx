import { type ReactNode, useState } from 'react'
import {
  type CitasDeAgente,
  cambiosDeAsignacion,
  citasDeAgente,
  cuerpoDe,
  opcionesDeHerramientas,
  reconciliarCitas,
  soloEnProsa,
} from './campos.ts'
import { estaArchivado } from './derivados.ts'
import { EditarLista, EditarTexto, type OpcionLista } from './Edicion.tsx'
import { useT } from './i18n/react.ts'
import type { MutationRequest } from './mutations.ts'
import type { Agent, Command, Skill, Snapshot } from './types.ts'

/**
 * Las acciones de edición de la ficha: una fila de botones que abren su diálogo. Ninguna escribe
 * nada por sí misma: piden el plan a `onMutate` / `onLote` (que abre el diff) y, si se guarda,
 * `alGuardar` cierra el diálogo. Los diálogos de edición se abren también en la demo, que rechaza la
 * escritura al pedir el plan.
 */

export type PedirMutacion = (req: MutationRequest, title: string, alGuardar?: () => void) => void
export type PedirLote = (
  items: { req: MutationRequest; title: string }[],
  title: string,
  alGuardar?: () => void,
) => void

interface Comun {
  snapshot: Snapshot
  onMutate: PedirMutacion
}

const Boton = ({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) => (
  <button type="button" className="chip" onClick={onClick} disabled={disabled} title={title}>
    {children}
  </button>
)

const nombresDeSkills = (s: Snapshot): string[] => s.catalog.skills.map((k) => k.name)

export const AccionesAgente = ({ agente, snapshot, onMutate }: Comun & { agente: Agent }) => {
  const t = useT()
  const [abierto, setAbierto] = useState<
    'descripcion' | 'cuerpo' | 'tools' | 'precargadas' | 'citas' | null
  >(null)
  const cerrar = () => setAbierto(null)
  const cuerpo = cuerpoDe(agente)
  const nombre = agente.name
  const skills = snapshot.catalog.skills
  const citas = citasDeAgente(agente, snapshot.edges)

  const opcionesPrecarga: OpcionLista[] = [
    ...skills.map((k) => ({
      valor: k.name,
      etiqueta: k.name,
      nota: t('edit.tokens', { n: k.bodyTokens }),
    })),
    // Una precargada que ya no existe en el catálogo: se ve (y se puede quitar), no desaparece.
    ...agente.preloadedSkills
      .filter((n) => !skills.some((k) => k.name === n))
      .map((n) => ({ valor: n, etiqueta: n, nota: t('edit.missing') })),
  ]
  const opcionesCitas: OpcionLista[] = skills.map((k) => ({
    valor: k.name,
    etiqueta: k.name,
    fija: soloEnProsa(citas, k.name),
    nota: soloEnProsa(citas, k.name) ? t('edit.byHand') : undefined,
  }))

  return (
    <>
      <div className="acciones-ficha">
        <Boton onClick={() => setAbierto('descripcion')}>{t('edit.btn.description')}</Boton>
        <Boton
          onClick={() => setAbierto('cuerpo')}
          disabled={cuerpo === undefined}
          title={cuerpo === undefined ? t('edit.noBody') : undefined}
        >
          {t('edit.btn.prompt')}
        </Boton>
        <Boton onClick={() => setAbierto('tools')}>{t('edit.btn.tools')}</Boton>
        <Boton onClick={() => setAbierto('precargadas')}>{t('edit.btn.preloaded')}</Boton>
        <Boton onClick={() => setAbierto('citas')}>{t('edit.btn.citations')}</Boton>
      </div>
      {abierto === 'descripcion' && (
        <EditarTexto
          titulo={t('diff.title.description', { name: nombre })}
          etiqueta={t('edit.field.description')}
          inicial={agente.description}
          variante="parrafo"
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              { kind: 'agent.description', entityId: agente.id, value: valor },
              t('diff.title.description', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
      {abierto === 'cuerpo' && cuerpo !== undefined && (
        <EditarTexto
          titulo={t('diff.title.prompt', { name: nombre })}
          etiqueta={t('edit.field.prompt')}
          inicial={cuerpo}
          variante="documento"
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              { kind: 'agent.body', entityId: agente.id, value: valor },
              t('diff.title.prompt', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
      {abierto === 'tools' && (
        <EditarLista
          titulo={t('diff.title.tools', { name: nombre })}
          leyenda={t('edit.tools.legend')}
          intro={t('edit.tools.intro')}
          opciones={opcionesDeHerramientas(agente.tools).map((h) => ({ valor: h, etiqueta: h }))}
          inicial={agente.tools ?? []}
          todas={{ etiqueta: t('edit.tools.all'), inicial: agente.tools === null }}
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              { kind: 'agent.tools', entityId: agente.id, value: valor },
              t('diff.title.tools', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
      {abierto === 'precargadas' && (
        <EditarLista
          titulo={t('diff.title.preloaded', { name: nombre })}
          leyenda={t('edit.preloaded.legend')}
          intro={t('edit.preloaded.intro')}
          opciones={opcionesPrecarga}
          inicial={agente.preloadedSkills}
          vacio={t('edit.noSkills')}
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              { kind: 'agent.preloadedSkills', entityId: agente.id, value: valor ?? [] },
              t('diff.title.preloaded', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
      {abierto === 'citas' && (
        <EditarLista
          titulo={t('diff.title.mentions', { name: nombre })}
          leyenda={t('edit.citations.legend')}
          intro={t('edit.citations.intro')}
          opciones={opcionesCitas}
          inicial={[...new Set([...citas.gestionadas, ...citas.declaradas])]}
          vacio={t('edit.noSkills')}
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              {
                kind: 'agent.skillMentions',
                entityId: agente.id,
                value: reconciliarCitas(citas, new Set(valor ?? []), nombresDeSkills(snapshot)),
              },
              t('diff.title.mentions', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
    </>
  )
}

export const AccionesSkill = ({
  skill,
  snapshot,
  vacios,
  onMutate,
  onLote,
}: Comun & {
  skill: Skill
  /** Las palabras que el usuario nunca ha tecleado: ayuda para reescribir la description. */
  vacios: string[]
  onLote: PedirLote
}) => {
  const t = useT()
  const [abierto, setAbierto] = useState<'descripcion' | 'cuerpo' | 'asignar' | null>(null)
  const cerrar = () => setAbierto(null)
  const cuerpo = cuerpoDe(skill)
  const nombre = skill.name
  const agentes = snapshot.catalog.agents.filter((a) => !estaArchivado(a))
  const citas: CitasDeAgente[] = agentes.map((a) => citasDeAgente(a, snapshot.edges))

  return (
    <>
      <div className="acciones-ficha">
        <Boton onClick={() => setAbierto('descripcion')}>{t('edit.btn.description')}</Boton>
        <Boton
          onClick={() => setAbierto('cuerpo')}
          disabled={cuerpo === undefined}
          title={cuerpo === undefined ? t('edit.noBody') : undefined}
        >
          {t('edit.btn.skillBody')}
        </Boton>
        <Boton onClick={() => setAbierto('asignar')}>{t('edit.btn.assign')}</Boton>
      </div>
      {abierto === 'descripcion' && (
        <EditarTexto
          titulo={t('diff.title.description', { name: nombre })}
          etiqueta={t('edit.field.description')}
          inicial={skill.description}
          variante="parrafo"
          nota={t('edit.description.cost', { n: skill.descriptionTokens })}
          ayuda={
            vacios.length > 0 ? (
              <aside className="ayuda-vocab">
                <h4>{t('detail.vocab')}</h4>
                <p>{vacios.join(', ')}</p>
                <p className="nota-dialogo">{t('edit.vocab.note')}</p>
              </aside>
            ) : undefined
          }
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              { kind: 'skill.description', entityId: skill.id, value: valor },
              t('diff.title.description', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
      {abierto === 'cuerpo' && cuerpo !== undefined && (
        <EditarTexto
          titulo={t('diff.title.skillBody', { name: nombre })}
          etiqueta={t('edit.field.skillBody')}
          inicial={cuerpo}
          variante="documento"
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              { kind: 'skill.body', entityId: skill.id, value: valor },
              t('diff.title.skillBody', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
      {abierto === 'asignar' && (
        <EditarLista
          titulo={t('edit.assign.title', { name: nombre })}
          leyenda={t('edit.assign.legend')}
          intro={t('edit.assign.intro')}
          opciones={citas.map((c) => ({
            valor: c.id,
            etiqueta: c.name,
            fija: soloEnProsa(c, nombre),
            nota: soloEnProsa(c, nombre) ? t('edit.byHand') : undefined,
          }))}
          inicial={citas.filter((c) => c.declaradas.includes(nombre)).map((c) => c.id)}
          vacio={t('edit.noAgents')}
          onCerrar={cerrar}
          onRevisar={(valor) => {
            const cambios = cambiosDeAsignacion(nombre, new Set(valor ?? []), citas)
            onLote(
              cambios.map((c) => ({
                req: { kind: 'agent.skillMentions', entityId: c.agentId, value: c.value },
                title: t('diff.title.assignOne', { agent: c.agentName, skill: nombre }),
              })),
              t('diff.title.assign', { skill: nombre, n: cambios.length }),
              cerrar,
            )
          }}
        />
      )}
    </>
  )
}

export const AccionesComando = ({ comando, onMutate }: Comun & { comando: Command }) => {
  const t = useT()
  const [abierto, setAbierto] = useState<'descripcion' | 'pista' | 'cuerpo' | null>(null)
  const cerrar = () => setAbierto(null)
  const cuerpo = cuerpoDe(comando)
  const pista = (comando as Command & { argumentHint?: string | null }).argumentHint ?? ''
  const nombre = comando.name
  return (
    <>
      <div className="acciones-ficha">
        <Boton onClick={() => setAbierto('descripcion')}>{t('edit.btn.description')}</Boton>
        <Boton onClick={() => setAbierto('pista')}>{t('edit.btn.hint')}</Boton>
        <Boton
          onClick={() => setAbierto('cuerpo')}
          disabled={cuerpo === undefined}
          title={cuerpo === undefined ? t('edit.noBody') : undefined}
        >
          {t('edit.btn.commandBody')}
        </Boton>
      </div>
      {abierto === 'descripcion' && (
        <EditarTexto
          titulo={t('diff.title.description', { name: nombre })}
          etiqueta={t('edit.field.description')}
          inicial={comando.description}
          variante="parrafo"
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              { kind: 'command.description', entityId: comando.id, value: valor },
              t('diff.title.description', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
      {abierto === 'pista' && (
        <EditarTexto
          titulo={t('diff.title.hint', { name: nombre })}
          etiqueta={t('edit.field.hint')}
          inicial={pista}
          variante="linea"
          nota={t('edit.hint.note')}
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              // Vacío = quitar la pista: el campo desaparece del frontmatter.
              { kind: 'command.argumentHint', entityId: comando.id, value: valor || null },
              t('diff.title.hint', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
      {abierto === 'cuerpo' && cuerpo !== undefined && (
        <EditarTexto
          titulo={t('diff.title.commandBody', { name: nombre })}
          etiqueta={t('edit.field.commandBody')}
          inicial={cuerpo}
          variante="documento"
          onCerrar={cerrar}
          onRevisar={(valor) =>
            onMutate(
              { kind: 'command.body', entityId: comando.id, value: valor },
              t('diff.title.commandBody', { name: nombre }),
              cerrar,
            )
          }
        />
      )}
    </>
  )
}
