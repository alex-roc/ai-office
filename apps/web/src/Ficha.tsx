import type { MutationRequest } from './mutations.ts'
import type { Agent, Command, Edge, Skill, Snapshot } from './types.ts'

const COLORES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'] as const
const MODELOS = ['inherit', 'haiku', 'sonnet', 'opus'] as const

/** Panel lateral: qué es esto, qué dice de sí mismo, y qué ha hecho de verdad. */

const GRADE_LABEL: Record<string, string> = {
  unused: 'sin estrenar',
  tried: 'estrenada',
  practicing: 'en práctica',
  certified: 'acreditada',
}

const relDate = (ts: number | null | undefined): string => {
  if (!ts) return 'nunca'
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  if (days < 365) return `hace ${Math.round(days / 30)} meses`
  return `hace ${Math.round(days / 365)} años`
}

const shortPath = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')

const Evidence = ({ edges, title }: { edges: Edge[]; title: string }) => {
  if (edges.length === 0) return null
  return (
    <section>
      <h3>{title}</h3>
      {edges.slice(0, 12).map((e, i) => {
        const ev = e.evidence[0]
        return (
          <div className="evidence" key={`${e.from}-${e.to}-${i}`}>
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

export const Ficha = ({
  snapshot,
  id,
  onEditFlow,
  onMutate,
}: {
  snapshot: Snapshot
  id: string | null
  onEditFlow?: (commandId: string) => void
  /** Toda edición sale de aquí y pasa por el diálogo de diff antes de tocar el disco. */
  onMutate?: (req: MutationRequest, title: string) => void
}) => {
  if (!id) {
    return (
      <aside className="side">
        <p className="empty">
          Cada línea del plano sale de un archivo tuyo. Las punteadas son lo que tus prompts dicen
          que debería pasar; las sólidas, lo que los transcripts demuestran que pasó.
        </p>
        <section>
          <h3>lo que se lee</h3>
          {snapshot.catalog.roots.map((r) => (
            <div className="evidence" key={r}>
              <code>{shortPath(r)}</code>
            </div>
          ))}
        </section>
      </aside>
    )
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
      <aside className="side">
        <p className="empty">Esta entidad aparece en el historial pero ya no existe en disco.</p>
      </aside>
    )
  }

  const name = isMain ? 'hilo principal' : (entity?.name ?? id)
  const kind = isMain ? 'tú, en directo' : (entity?.kind ?? '')

  return (
    <aside className="side">
      <div className="kind">{kind}</div>
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
                  {GRADE_LABEL[act?.grade ?? 'unused']}
                </span>
              </span>
            </div>
          </>
        )}
      </section>

      {entity?.kind === 'agent' && onMutate && (
        <section>
          <h3>editar</h3>
          <div className="editor">
            <label>
              color
              <select
                value={(entity as Agent).color ?? ''}
                onChange={(e) =>
                  onMutate(
                    { kind: 'agent.color', entityId: entity.id, value: e.target.value || null },
                    `color de ${entity.name}`,
                  )
                }
              >
                <option value="">sin asignar</option>
                {COLORES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              modelo
              <select
                value={(entity as Agent).model ?? ''}
                onChange={(e) =>
                  onMutate(
                    { kind: 'agent.model', entityId: entity.id, value: e.target.value || null },
                    `modelo de ${entity.name}`,
                  )
                }
              >
                <option value="">heredado</option>
                {MODELOS.map((m) => (
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
              onMutate({ kind: 'agent.archive', entityId: entity.id }, `archivar ${entity.name}`)
            }
          >
            archivar este agente
          </button>
          <p className="nota">
            Archivar lo mueve a <code>agents/.archivo/</code>. No se borra nada y se puede deshacer.
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

      {entity?.kind === 'agent' && (
        <section>
          <h3>definición</h3>
          <div className="row">
            <span>modelo</span>
            <span>{(entity as Agent).model ?? 'heredado'}</span>
          </div>
          <div className="row">
            <span>color</span>
            <span>{(entity as Agent).color ?? 'sin asignar'}</span>
          </div>
          <div className="row">
            <span>tools</span>
            <span>{(entity as Agent).tools?.length ?? 'todas'}</span>
          </div>
          <div className="row">
            <span>skills precargadas</span>
            <span>{(entity as Agent).preloadedSkills.length}</span>
          </div>
          <div className="row">
            <span>tamaño del prompt</span>
            <span>~{(entity as Agent).bodyTokens.toLocaleString('es')} tokens</span>
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
              <h3 style={{ marginTop: '.8rem' }}>palabras que nunca has escrito</h3>
              <p className="desc" style={{ fontSize: 12 }}>
                {snapshot.vocabularyGaps[id]?.join(', ')}
              </p>
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
        title="precargadas en `skills:`"
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
              <div className="quote" style={{ fontSize: 12 }}>
                visible como {shortPath(entity.source.path)}
              </div>
            )}
          </div>
        </section>
      )}
    </aside>
  )
}
