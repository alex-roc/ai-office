import { memo, type ReactNode } from 'react'
import { agentesArchivados, estaArchivado } from './derivados.ts'
import type { MutationRequest } from './mutations.ts'
import { gradoEtiqueta, NOMBRE_HILO, relDate, shortPath } from './texto.ts'
import type { Agent, Command, Edge, Skill, Snapshot } from './types.ts'

const COLORES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']
const MODELOS = ['haiku', 'sonnet', 'opus']

/** Panel lateral: qué es esto, qué dice de sí mismo, y qué ha hecho de verdad. */

export type Vista = 'sala' | 'plano'

/**
 * Las opciones de un selector más el valor actual si no está en la lista. Un modelo como
 * `opus[1m]` o un color que el archivo ya tenía no deben desaparecer ni mostrarse como "heredado":
 * el selector mentiría sobre lo que hay escrito en el archivo.
 */
const opcionesCon = (lista: string[], actual: string | null): string[] =>
  actual && !lista.includes(actual) ? [...lista, actual] : lista

const Evidence = ({ edges, title }: { edges: Edge[]; title: ReactNode }) => {
  if (edges.length === 0) return null
  return (
    <section>
      <h3>{title}</h3>
      {edges.slice(0, 12).map((e) => {
        const ev = e.evidence[0]
        return (
          <div className="evidence" key={`${e.from}-${e.to}-${e.kind}-${e.layer}`}>
            <div>{e.to.split('/').pop() ?? e.to}</div>
            {ev?.excerpt && <div className="quote">“{ev.excerpt}”</div>}
            {ev && (
              <code>
                {shortPath(ev.path)}
                {ev.line ? `:${ev.line}` : ''}
                {ev.field ? ` · campo ${ev.field}` : ''}
              </code>
            )}
          </div>
        )
      })}
    </section>
  )
}

/** Qué se está viendo y cómo leerlo, según la vista ACTUAL: no se explican las líneas del Plano estando en la Sala. */
const Explicacion = ({ vista }: { vista: Vista }) =>
  vista === 'sala' ? (
    <p className="empty">
      Cada figura, lomo y tarjeta de la Sala sale de un archivo tuyo. Una persona en gris es un
      agente al que nunca has delegado; el alto de un lomo es el grado de la skill y un lomo sin
      tejuelo dorado es una skill que nunca se ha usado. Pulsa cualquier cosa para ver su ficha.
    </p>
  ) : (
    <p className="empty">
      Cada línea del plano sale de un archivo tuyo. Las punteadas son lo que tus prompts dicen que
      debería pasar; las sólidas, lo que los transcripts demuestran que pasó.
    </p>
  )

const FichaVacia = ({
  snapshot,
  vista,
  onMutate,
  onSelect,
}: {
  snapshot: Snapshot
  vista: Vista
  onMutate?: (req: MutationRequest, title: string) => void
  onSelect?: (id: string) => void
}) => {
  const archivados = agentesArchivados(snapshot)
  return (
    <aside className="side" aria-label="Ficha">
      <Explicacion vista={vista} />
      <section>
        <h3>lo que se lee</h3>
        {snapshot.catalog.roots.map((r) => (
          <div className="evidence" key={r}>
            <code>{shortPath(r)}</code>
          </div>
        ))}
      </section>
      {archivados.length > 0 && (
        <section>
          <h3>archivados ({archivados.length})</h3>
          {archivados.map((a) => (
            <div className="fila-archivado" key={a.id}>
              <button type="button" className="enlace" onClick={() => onSelect?.(a.id)}>
                {a.name}
              </button>
              {onMutate && (
                <button
                  type="button"
                  className="chip"
                  onClick={() =>
                    onMutate({ kind: 'agent.unarchive', entityId: a.id }, `restaurar ${a.name}`)
                  }
                >
                  restaurar
                </button>
              )}
            </div>
          ))}
          <p className="nota">
            Viven en <code>agents/.archivo/</code> y no se dibujan en la Sala ni en el Plano.
          </p>
        </section>
      )}
    </aside>
  )
}

const FichaImpl = ({
  snapshot,
  id,
  vista,
  onEditFlow,
  onMutate,
  onSelect,
}: {
  snapshot: Snapshot
  id: string | null
  vista: Vista
  onEditFlow?: (commandId: string) => void
  /** Toda edición sale de aquí y pasa por el diálogo de diff antes de tocar el disco. */
  onMutate?: (req: MutationRequest, title: string) => void
  onSelect?: (id: string) => void
}) => {
  if (!id) {
    return <FichaVacia snapshot={snapshot} vista={vista} onMutate={onMutate} onSelect={onSelect} />
  }

  const entity: Agent | Skill | Command | undefined =
    snapshot.catalog.agents.find((a) => a.id === id) ??
    snapshot.catalog.skills.find((s) => s.id === id) ??
    snapshot.catalog.commands.find((c) => c.id === id)

  const act = snapshot.activity[id]
  const isMain = id === snapshot.mainThreadId
  const out = snapshot.edges.filter((e) => e.from === id)
  const incoming = snapshot.edges.filter((e) => e.to === id)

  if (!entity && !isMain) {
    return (
      <aside className="side" aria-label="Ficha">
        <p className="empty">Esta entidad aparece en el historial pero ya no existe en disco.</p>
      </aside>
    )
  }

  const name = isMain ? NOMBRE_HILO : (entity?.name ?? id)
  // El vocabulario de Claude Code, en español donde el término lo tiene (agente, comando).
  const NOMBRE_TIPO: Record<string, string> = {
    agent: 'agente',
    skill: 'skill',
    command: 'comando',
    mcp: 'servidor MCP',
  }
  const kind = isMain ? 'en directo' : (NOMBRE_TIPO[entity?.kind ?? ''] ?? entity?.kind ?? '')
  const agente = entity?.kind === 'agent' ? (entity as Agent) : null
  const archivado = agente ? estaArchivado(agente) : false

  return (
    <aside className="side" aria-label={`Ficha de ${name}`}>
      <div className="kind">
        {kind}
        {archivado ? ' · archivado' : ''}
      </div>
      <h2>{name}</h2>
      {entity?.description && <p className="desc">{entity.description.slice(0, 400)}</p>}

      <section>
        <h3>hoja de servicios</h3>
        {isMain ? (
          <div className="row">
            <span>skills que ha usado</span>
            <span>{snapshot.stats.mainThreadSkills}</span>
          </div>
        ) : (
          <>
            <div className="row">
              <span>usos registrados</span>
              <span>{act?.uses ?? 0}</span>
            </div>
            <div className="row">
              <span>sesiones · proyectos</span>
              <span>
                {act?.sessions ?? 0} · {act?.projects ?? 0}
              </span>
            </div>
            <div className="row">
              <span>última vez</span>
              <span>{relDate(act?.lastUsedAt)}</span>
            </div>
            <div className="row">
              <span>grado</span>
              <span>
                <span className={`badge ${act?.grade ?? 'unused'}`}>
                  {gradoEtiqueta(act?.grade)}
                </span>
              </span>
            </div>
          </>
        )}
      </section>

      {agente && onMutate && !archivado && (
        <section>
          <h3>editar</h3>
          <div className="editor">
            <label>
              color
              <select
                value={agente.color ?? ''}
                onChange={(e) =>
                  onMutate(
                    { kind: 'agent.color', entityId: agente.id, value: e.target.value || null },
                    `color de ${agente.name}`,
                  )
                }
              >
                <option value="">sin asignar</option>
                {opcionesCon(COLORES, agente.color).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              modelo
              <select
                // `inherit` es otra forma de escribir "heredado": las dos van a la misma opción.
                value={agente.model === 'inherit' ? '' : (agente.model ?? '')}
                onChange={(e) =>
                  onMutate(
                    { kind: 'agent.model', entityId: agente.id, value: e.target.value || null },
                    `modelo de ${agente.name}`,
                  )
                }
              >
                <option value="">heredado</option>
                {opcionesCon(MODELOS, agente.model === 'inherit' ? null : agente.model).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="anadir"
            onClick={() =>
              onMutate({ kind: 'agent.archive', entityId: agente.id }, `archivar ${agente.name}`)
            }
          >
            archivar este agente
          </button>
          <p className="nota">
            Archivar lo mueve a <code>agents/.archivo/</code>. No se borra nada y se puede deshacer.
          </p>
        </section>
      )}

      {agente && onMutate && archivado && (
        <section>
          <h3>archivado</h3>
          <button
            type="button"
            className="anadir"
            onClick={() =>
              onMutate({ kind: 'agent.unarchive', entityId: agente.id }, `restaurar ${agente.name}`)
            }
          >
            restaurar este agente
          </button>
          <p className="nota">
            Lo devuelve a <code>agents/</code>. Mientras esté archivado no aparece en la Sala.
          </p>
        </section>
      )}

      {entity?.kind === 'skill' && onMutate && (
        <section>
          <h3>editar</h3>
          <button
            type="button"
            className="anadir"
            onClick={() =>
              onMutate(
                {
                  kind: (entity as Skill).disabledForModel ? 'skill.unretire' : 'skill.retire',
                  entityId: entity.id,
                },
                `${(entity as Skill).disabledForModel ? 'reactivar' : 'jubilar'} ${entity.name}`,
              )
            }
          >
            {(entity as Skill).disabledForModel ? 'reactivar esta skill' : 'jubilar esta skill'}
          </button>
          <p className="nota">
            Jubilar escribe <code>disable-model-invocation</code>: deja de competir por la atención
            del modelo, tú puedes seguir invocándola a mano, y sube tu ratio activo.
          </p>
        </section>
      )}

      {agente && (
        <section>
          <h3>definición</h3>
          <div className="row">
            <span>modelo</span>
            <span>{agente.model ?? 'heredado'}</span>
          </div>
          <div className="row">
            <span>color</span>
            <span>{agente.color ?? 'sin asignar'}</span>
          </div>
          <div className="row">
            <span>tools</span>
            <span>{agente.tools?.length ?? 'todas'}</span>
          </div>
          <div className="row">
            <span>skills precargadas</span>
            <span>{agente.preloadedSkills.length}</span>
          </div>
          <div className="row">
            <span>tamaño del prompt</span>
            <span>~{agente.bodyTokens.toLocaleString('es')} tokens</span>
          </div>
        </section>
      )}

      {entity?.kind === 'skill' && (
        <section>
          <h3>definición</h3>
          <div className="row">
            <span>description</span>
            <span>~{(entity as Skill).descriptionTokens} tokens por sesión</span>
          </div>
          <div className="row">
            <span>cuerpo</span>
            <span>~{(entity as Skill).bodyTokens.toLocaleString('es')} tokens al invocarla</span>
          </div>
          <div className="row">
            <span>elegible por el modelo</span>
            <span>{(entity as Skill).disabledForModel ? 'no' : 'sí'}</span>
          </div>
          {snapshot.vocabularyGaps[id]?.length ? (
            <>
              <h3 className="subtitulo">palabras que nunca has escrito</h3>
              <p className="desc chico">{snapshot.vocabularyGaps[id]?.join(', ')}</p>
            </>
          ) : null}
        </section>
      )}

      {entity?.kind === 'command' && onEditFlow && (
        <section>
          <button type="button" className="anadir" onClick={() => onEditFlow(entity.id)}>
            abrir en el lienzo
          </button>
        </section>
      )}

      <Evidence edges={out.filter((e) => e.layer === 'proven')} title="lo que ha hecho" />
      <Evidence
        edges={out.filter((e) => e.layer === 'preloaded')}
        title={
          <>
            precargadas en <code>skills:</code>
          </>
        }
      />
      <Evidence
        edges={out.filter((e) => e.layer === 'declared' && e.kind === 'agent-uses-skill')}
        title="skills que su prompt le manda leer"
      />
      <Evidence
        edges={incoming.filter((e) => e.kind === 'command-invokes-agent')}
        title="comandos que lo convocan"
      />
      <Evidence
        edges={incoming.filter((e) => e.kind === 'skill-declares-client')}
        title="skills que lo nombran"
      />

      {entity && (
        <section>
          <h3>archivo</h3>
          <div className="evidence">
            <code>{shortPath(entity.source.realPath)}</code>
            {entity.source.symlink && (
              <div className="quote chico">visible como {shortPath(entity.source.path)}</div>
            )}
          </div>
        </section>
      )}
    </aside>
  )
}

export const Ficha = memo(FichaImpl)
