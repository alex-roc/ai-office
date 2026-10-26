import { memo, type ReactNode } from 'react'
import { agentesArchivados, estaArchivado } from './derivados.ts'
import { useT } from './i18n/react.ts'
import type { MutationRequest } from './mutations.ts'
import { conCodigo } from './Rico.tsx'
import { detalleTexto, gradoEtiqueta, nombreHilo, relDate, shortPath } from './texto.ts'
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
  const t = useT()
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
                {ev.field ? t('detail.ev.field', { field: ev.field }) : ''}
              </code>
            )}
          </div>
        )
      })}
    </section>
  )
}

/** Qué se está viendo y cómo leerlo, según la vista ACTUAL: no se explican las líneas del Plano estando en la Sala. */
const Explicacion = ({ vista }: { vista: Vista }) => {
  const t = useT()
  return (
    <p className="empty">
      {t(vista === 'sala' ? 'detail.explain.office' : 'detail.explain.blueprint')}
    </p>
  )
}

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
  const t = useT()
  const archivados = agentesArchivados(snapshot)
  return (
    <aside className="side" aria-label={t('detail.aria')}>
      <Explicacion vista={vista} />
      <section>
        <h3>{t('detail.reads')}</h3>
        {snapshot.catalog.roots.map((r) => (
          <div className="evidence" key={r}>
            <code>{shortPath(r)}</code>
          </div>
        ))}
      </section>
      {archivados.length > 0 && (
        <section>
          <h3>{t('detail.archivedList', { n: archivados.length })}</h3>
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
                    onMutate(
                      { kind: 'agent.unarchive', entityId: a.id },
                      t('diff.title.restore', { name: a.name }),
                    )
                  }
                >
                  {t('detail.restore')}
                </button>
              )}
            </div>
          ))}
          <p className="nota">{conCodigo(t('detail.archivedNote'))}</p>
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
  const t = useT()
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
      <aside className="side" aria-label={t('detail.aria')}>
        <p className="empty">{t('detail.missing')}</p>
      </aside>
    )
  }

  const name = isMain ? nombreHilo() : (entity?.name ?? id)
  // El vocabulario de Claude Code: en español, agente y comando; en inglés, agent y command.
  const tipo = entity?.kind
  const kind = isMain
    ? t('kind.live')
    : tipo === 'agent' || tipo === 'skill' || tipo === 'command' || tipo === 'mcp'
      ? t(`kind.${tipo}`)
      : (tipo ?? '')
  const agente = entity?.kind === 'agent' ? (entity as Agent) : null
  const archivado = agente ? estaArchivado(agente) : false

  return (
    <aside className="side" aria-label={t('detail.aria.of', { name })}>
      <div className="kind">
        {kind}
        {archivado ? t('detail.archivedTag') : ''}
      </div>
      <h2>{name}</h2>
      {entity?.description && <p className="desc">{entity.description.slice(0, 400)}</p>}

      {entity && entity.problems.length > 0 && (
        <section>
          <h3>{t('detail.problems')}</h3>
          {entity.problems.map((p, i) => (
            <p className="nota" key={p}>
              {detalleTexto('problem', entity.problemDetails?.[i], p)}
            </p>
          ))}
        </section>
      )}

      <section>
        <h3>{t('detail.service')}</h3>
        {isMain ? (
          <div className="row">
            <span>{t('detail.mainSkills')}</span>
            <span>{snapshot.stats.mainThreadSkills}</span>
          </div>
        ) : (
          <>
            <div className="row">
              <span>{t('detail.uses')}</span>
              <span>{act?.uses ?? 0}</span>
            </div>
            <div className="row">
              <span>{t('detail.sessionsProjects')}</span>
              <span>
                {act?.sessions ?? 0} · {act?.projects ?? 0}
              </span>
            </div>
            <div className="row">
              <span>{t('detail.lastUsed')}</span>
              <span>{relDate(act?.lastUsedAt)}</span>
            </div>
            <div className="row">
              <span>{t('detail.grade')}</span>
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
          <h3>{t('detail.edit')}</h3>
          <div className="editor">
            <label>
              {t('detail.color')}
              <select
                value={agente.color ?? ''}
                onChange={(e) =>
                  onMutate(
                    { kind: 'agent.color', entityId: agente.id, value: e.target.value || null },
                    t('diff.title.color', { name: agente.name }),
                  )
                }
              >
                <option value="">{t('detail.color.none')}</option>
                {opcionesCon(COLORES, agente.color).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('detail.model')}
              <select
                // `inherit` es otra forma de escribir "heredado": las dos van a la misma opción.
                value={agente.model === 'inherit' ? '' : (agente.model ?? '')}
                onChange={(e) =>
                  onMutate(
                    { kind: 'agent.model', entityId: agente.id, value: e.target.value || null },
                    t('diff.title.model', { name: agente.name }),
                  )
                }
              >
                <option value="">{t('detail.model.inherit')}</option>
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
              onMutate(
                { kind: 'agent.archive', entityId: agente.id },
                t('diff.title.archive', { name: agente.name }),
              )
            }
          >
            {t('detail.archive.button')}
          </button>
          <p className="nota">{conCodigo(t('detail.archive.note'))}</p>
        </section>
      )}

      {agente && onMutate && archivado && (
        <section>
          <h3>{t('detail.archived')}</h3>
          <button
            type="button"
            className="anadir"
            onClick={() =>
              onMutate(
                { kind: 'agent.unarchive', entityId: agente.id },
                t('diff.title.restore', { name: agente.name }),
              )
            }
          >
            {t('detail.unarchive.button')}
          </button>
          <p className="nota">{conCodigo(t('detail.unarchive.note'))}</p>
        </section>
      )}

      {entity?.kind === 'skill' && onMutate && (
        <section>
          <h3>{t('detail.edit')}</h3>
          <button
            type="button"
            className="anadir"
            onClick={() =>
              onMutate(
                {
                  kind: (entity as Skill).disabledForModel ? 'skill.unretire' : 'skill.retire',
                  entityId: entity.id,
                },
                t(
                  (entity as Skill).disabledForModel ? 'diff.title.unretire' : 'diff.title.retire',
                  {
                    name: entity.name,
                  },
                ),
              )
            }
          >
            {t(
              (entity as Skill).disabledForModel
                ? 'detail.unretire.button'
                : 'detail.retire.button',
            )}
          </button>
          <p className="nota">{conCodigo(t('detail.retire.note'))}</p>
        </section>
      )}

      {agente && (
        <section>
          <h3>{t('detail.definition')}</h3>
          <div className="row">
            <span>{t('detail.model')}</span>
            <span>{agente.model ?? t('detail.model.inherit')}</span>
          </div>
          <div className="row">
            <span>{t('detail.color')}</span>
            <span>{agente.color ?? t('detail.color.none')}</span>
          </div>
          <div className="row">
            <span>{t('detail.def.tools')}</span>
            <span>{agente.tools?.length ?? t('detail.def.tools.all')}</span>
          </div>
          <div className="row">
            <span>{t('detail.def.preloaded')}</span>
            <span>{agente.preloadedSkills.length}</span>
          </div>
          <div className="row">
            <span>{t('detail.def.promptSize')}</span>
            <span>{t('detail.def.tokens', { n: agente.bodyTokens })}</span>
          </div>
        </section>
      )}

      {entity?.kind === 'skill' && (
        <section>
          <h3>{t('detail.definition')}</h3>
          <div className="row">
            <span>{t('detail.def.description')}</span>
            <span>
              {t('detail.def.descriptionTokens', { n: (entity as Skill).descriptionTokens })}
            </span>
          </div>
          <div className="row">
            <span>{t('detail.def.body')}</span>
            <span>{t('detail.def.bodyTokens', { n: (entity as Skill).bodyTokens })}</span>
          </div>
          <div className="row">
            <span>{t('detail.def.eligible')}</span>
            <span>{t((entity as Skill).disabledForModel ? 'detail.no' : 'detail.yes')}</span>
          </div>
          {snapshot.vocabularyGaps[id]?.length ? (
            <>
              <h3 className="subtitulo">{t('detail.vocab')}</h3>
              <p className="desc chico">{snapshot.vocabularyGaps[id]?.join(', ')}</p>
            </>
          ) : null}
        </section>
      )}

      {entity?.kind === 'command' && onEditFlow && (
        <section>
          <button type="button" className="anadir" onClick={() => onEditFlow(entity.id)}>
            {t('detail.openFlow')}
          </button>
        </section>
      )}

      <Evidence edges={out.filter((e) => e.layer === 'proven')} title={t('detail.ev.proven')} />
      <Evidence
        edges={out.filter((e) => e.layer === 'preloaded')}
        title={conCodigo(t('detail.ev.preloaded'))}
      />
      <Evidence
        edges={out.filter((e) => e.layer === 'declared' && e.kind === 'agent-uses-skill')}
        title={t('detail.ev.declared')}
      />
      <Evidence
        edges={incoming.filter((e) => e.kind === 'command-invokes-agent')}
        title={t('detail.ev.commands')}
      />
      <Evidence
        edges={incoming.filter((e) => e.kind === 'skill-declares-client')}
        title={t('detail.ev.skills')}
      />

      {entity && (
        <section>
          <h3>{t('detail.file')}</h3>
          <div className="evidence">
            <code>{shortPath(entity.source.realPath)}</code>
            {entity.source.symlink && (
              <div className="quote chico">
                {t('detail.visibleAs', { path: shortPath(entity.source.path) })}
              </div>
            )}
          </div>
        </section>
      )}
    </aside>
  )
}

export const Ficha = memo(FichaImpl)
