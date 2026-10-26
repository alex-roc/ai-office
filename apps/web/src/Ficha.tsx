import { memo } from 'react'
import {
  ambitoDe,
  esDePlugin,
  esSoloLectura,
  estaTapada,
  etiquetaAmbito,
  nombreDePlugin,
  pluginDe,
  pluginsDe,
  quienTapa,
  servidoresMcpDe,
} from './alcance.ts'
import { type CapaUso, quienUsa } from './campos.ts'
import { agentesArchivados, estaArchivado } from './derivados.ts'
import { ActividadFilas, Aviso, Cita, Evidence, PorProyecto } from './FichaComun.tsx'
import {
  AccionesAgente,
  AccionesComando,
  AccionesSkill,
  type PedirLote,
  type PedirMutacion,
} from './FichaEdicion.tsx'
import { FichaMcp, FichaPlugin } from './FichaPlugins.tsx'
import { useT } from './i18n/react.ts'
import { porProyecto } from './ledger.ts'
import { conCodigo } from './Rico.tsx'
import { detalleTexto, nombreHilo, relDate, shortPath } from './texto.ts'
import type { Agent, Command, Skill, Snapshot } from './types.ts'
import { VisorArchivo } from './VisorArchivo.tsx'

const COLORES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']
const MODELOS = ['haiku', 'sonnet', 'opus']

/** Panel lateral: qué es esto, qué dice de sí mismo, y qué ha hecho de verdad. */

export type Vista = 'sala' | 'plano' | 'registro'

/** El visor de archivo abierto: de qué entidad, en qué línea, y un contador para volver a centrarlo. */
export interface EstadoVisor {
  id: string
  linea?: number
  disparo: number
}

/**
 * Las opciones de un selector más el valor actual si no está en la lista. Un modelo como
 * `opus[1m]` o un color que el archivo ya tenía no deben desaparecer ni mostrarse como "heredado":
 * el selector mentiría sobre lo que hay escrito en el archivo.
 */
const opcionesCon = (lista: string[], actual: string | null): string[] =>
  actual && !lista.includes(actual) ? [...lista, actual] : lista

const NOMBRE_CAPA = {
  proven: 'detail.who.proven',
  preloaded: 'detail.who.preloaded',
  declared: 'detail.who.declared',
  command: 'detail.who.commands',
} as const

/**
 * Quién usa una skill, en cuatro capas con su evidencia: lo que hicieron de verdad (con número de
 * usos), quién la precarga, a quién se lo dice su prompt y qué comandos la nombran. Cada línea lleva
 * a esa entidad.
 */
const QuienUsa = ({
  snapshot,
  skill,
  onSelect,
  onVisor,
}: {
  snapshot: Snapshot
  skill: Skill
  onSelect?: (id: string) => void
  onVisor?: (id: string, linea?: number) => void
}) => {
  const t = useT()
  const usos = quienUsa(snapshot, skill.id)
  const nombreDe = (id: string): string =>
    id === snapshot.mainThreadId
      ? nombreHilo()
      : ([...snapshot.catalog.agents, ...snapshot.catalog.commands].find((e) => e.id === id)
          ?.name ??
        id.split('/').pop() ??
        id)
  const capas = (['proven', 'preloaded', 'declared', 'command'] as CapaUso[]).filter((c) =>
    usos.some((u) => u.capa === c),
  )
  return (
    <section>
      <h3>{t('detail.who')}</h3>
      {capas.length === 0 && <p className="empty">{t('detail.who.none')}</p>}
      {capas.map((capa) => (
        <div key={capa}>
          <h3 className="subtitulo">{conCodigo(t(NOMBRE_CAPA[capa]))}</h3>
          {usos
            .filter((u) => u.capa === capa)
            .slice(0, 20)
            .map((u) => {
              const ev = u.edge.evidence[0]
              return (
                <div className="evidence" key={`${u.from}-${u.capa}`}>
                  <div className="uso-cabecera">
                    <button type="button" className="enlace" onClick={() => onSelect?.(u.from)}>
                      {u.capa === 'command' ? `/${nombreDe(u.from)}` : nombreDe(u.from)}
                    </button>
                    {capa === 'proven' && (
                      <span className="uso-cifras">
                        {t('count.uses', { n: u.edge.uses ?? 0 })} · {relDate(u.edge.lastUsedAt)}
                      </span>
                    )}
                  </div>
                  {ev?.excerpt && <div className="quote">“{ev.excerpt}”</div>}
                  {ev && <Cita snapshot={snapshot} ev={ev} onVisor={onVisor} />}
                </div>
              )
            })}
        </div>
      ))}
    </section>
  )
}

/** Qué se está viendo y cómo leerlo, según la vista ACTUAL: no se explican las líneas del Plano estando en la Sala. */
const Explicacion = ({ vista }: { vista: Vista }) => {
  const t = useT()
  return (
    <p className="empty">
      {t(
        vista === 'sala'
          ? 'detail.explain.office'
          : vista === 'plano'
            ? 'detail.explain.blueprint'
            : 'detail.explain.ledger',
      )}
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
  onMutate?: PedirMutacion
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
  onLote,
  onSelect,
  onAmbito,
  visor,
  onVisor,
  onCerrarVisor,
}: {
  snapshot: Snapshot
  id: string | null
  vista: Vista
  onEditFlow?: (commandId: string) => void
  /** Toda edición sale de aquí y pasa por el diálogo de diff antes de tocar el disco. */
  onMutate?: PedirMutacion
  /** Varias ediciones de una vez (asignar una skill a varios agentes): un solo diff combinado. */
  onLote?: PedirLote
  onSelect?: (id: string) => void
  /** Cambia el ámbito de trabajo (usuario o un proyecto): lo usa la ficha de un servidor MCP. */
  onAmbito?: (valor: string) => void
  visor?: EstadoVisor | null
  onVisor?: (id: string, linea?: number) => void
  onCerrarVisor?: () => void
}) => {
  const t = useT()
  if (!id) {
    return <FichaVacia snapshot={snapshot} vista={vista} onMutate={onMutate} onSelect={onSelect} />
  }

  // Un plugin y un servidor MCP tienen ficha propia: no son archivos que se editen con las
  // acciones de un agente, una skill o un comando.
  const plugin = pluginsDe(snapshot).find((p) => p.id === id)
  if (plugin) {
    return (
      <FichaPlugin
        key={plugin.id}
        snapshot={snapshot}
        plugin={plugin}
        onSelect={onSelect}
        onMutate={onMutate}
      />
    )
  }
  const servidor = servidoresMcpDe(snapshot).find((m) => m.id === id)
  if (servidor) {
    return (
      <FichaMcp
        key={servidor.id}
        snapshot={snapshot}
        servidor={servidor}
        onSelect={onSelect}
        onMutate={onMutate}
        onAmbito={onAmbito}
        onVisor={onVisor}
      />
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
  const visorEntidad = visor
    ? [...snapshot.catalog.agents, ...snapshot.catalog.skills, ...snapshot.catalog.commands].find(
        (e) => e.id === visor.id,
      )
    : undefined
  const archivado = agente ? estaArchivado(agente) : false
  // Lo de un plugin son copias que una actualización sobrescribe, y lo tapado no se carga: en los
  // dos casos no se ofrecen las acciones de edición, y la ficha lo dice con su enlace.
  const soloLectura = entity ? esSoloLectura(entity) : false
  const duenoPlugin = entity ? pluginDe(snapshot, entity) : undefined
  const tapa = entity ? quienTapa(entity) : undefined
  const tapadora = entity?.shadowedBy

  return (
    <aside className="side" aria-label={t('detail.aria.of', { name })}>
      <div className="kind">
        {kind}
        {entity && ambitoDe(entity) !== 'user' ? ` · ${etiquetaAmbito(entity)}` : ''}
        {archivado ? t('detail.archivedTag') : ''}
      </div>
      <h2>{name}</h2>
      {entity?.description && <p className="desc">{entity.description.slice(0, 400)}</p>}

      {entity && esDePlugin(entity) && (
        <Aviso
          enlace={duenoPlugin ? t('detail.plugin.open') : undefined}
          onEnlace={duenoPlugin ? () => onSelect?.(duenoPlugin.id) : undefined}
        >
          {t('detail.fromPlugin', { plugin: nombreDePlugin(entity.plugin ?? '?') })}
        </Aviso>
      )}
      {entity && estaTapada(entity) && (
        <Aviso
          clase="tapada"
          enlace={tapadora ? t('detail.shadowed.open') : undefined}
          onEnlace={tapadora ? () => onSelect?.(tapadora) : undefined}
        >
          {t('detail.shadowed', {
            by: tapa ? `${tapa.name} (${etiquetaAmbito({ scope: tapa.scope })})` : '?',
          })}
        </Aviso>
      )}

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
          <ActividadFilas snapshot={snapshot} act={act} />
        )}
      </section>
      <PorProyecto datos={porProyecto(act)} />

      {agente && onMutate && !archivado && !soloLectura && (
        <section>
          <h3>{t('detail.edit')}</h3>
          <AccionesAgente agente={agente} snapshot={snapshot} onMutate={onMutate} />
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

      {agente && onMutate && archivado && !soloLectura && (
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

      {entity?.kind === 'skill' && onMutate && onLote && !soloLectura && (
        <section>
          <h3>{t('detail.edit')}</h3>
          <AccionesSkill
            skill={entity as Skill}
            snapshot={snapshot}
            vacios={snapshot.vocabularyGaps[id] ?? []}
            onMutate={onMutate}
            onLote={onLote}
          />
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

      {entity?.kind === 'command' && (onMutate || onEditFlow) && !soloLectura && (
        <section>
          <h3>{t('detail.edit')}</h3>
          {onMutate && (
            <AccionesComando comando={entity as Command} snapshot={snapshot} onMutate={onMutate} />
          )}
          {onEditFlow && (
            <button type="button" className="anadir" onClick={() => onEditFlow(entity.id)}>
              {t('detail.openFlow')}
            </button>
          )}
          <p className="nota">{t('detail.openFlow.note')}</p>
        </section>
      )}

      {entity?.kind === 'skill' && (
        <QuienUsa
          snapshot={snapshot}
          skill={entity as Skill}
          onSelect={onSelect}
          onVisor={onVisor}
        />
      )}

      <Evidence
        snapshot={snapshot}
        edges={out.filter((e) => e.layer === 'proven')}
        title={t('detail.ev.proven')}
        onVisor={onVisor}
      />
      <Evidence
        snapshot={snapshot}
        edges={out.filter((e) => e.layer === 'declared' && e.kind === 'agent-uses-mcp')}
        title={conCodigo(t('detail.ev.mcp'))}
        onVisor={onVisor}
      />
      <Evidence
        snapshot={snapshot}
        edges={out.filter((e) => e.layer === 'preloaded')}
        title={conCodigo(t('detail.ev.preloaded'))}
        onVisor={onVisor}
      />
      <Evidence
        snapshot={snapshot}
        edges={out.filter((e) => e.layer === 'declared' && e.kind === 'agent-uses-skill')}
        title={t('detail.ev.declared')}
        onVisor={onVisor}
      />
      <Evidence
        snapshot={snapshot}
        edges={out.filter((e) => e.kind === 'command-invokes-agent')}
        title={t('detail.ev.callsAgents')}
        onVisor={onVisor}
      />
      <Evidence
        snapshot={snapshot}
        edges={out.filter((e) => e.kind === 'command-invokes-skill')}
        title={t('detail.ev.callsSkills')}
        onVisor={onVisor}
      />
      <Evidence
        snapshot={snapshot}
        edges={incoming.filter((e) => e.kind === 'command-invokes-agent')}
        title={t('detail.ev.commands')}
        lado="from"
        onVisor={onVisor}
      />
      <Evidence
        snapshot={snapshot}
        edges={incoming.filter((e) => e.kind === 'skill-declares-client')}
        title={t('detail.ev.skills')}
        lado="from"
        onVisor={onVisor}
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
          {onVisor && (
            <button
              type="button"
              className="anadir"
              aria-expanded={visor?.id === entity.id}
              onClick={() => (visor?.id === entity.id ? onCerrarVisor?.() : onVisor(entity.id))}
            >
              {t(visor?.id === entity.id ? 'viewer.hide' : 'viewer.show')}
            </button>
          )}
        </section>
      )}

      {visor && visorEntidad && onCerrarVisor && (
        <VisorArchivo
          entidad={visorEntidad}
          linea={visor.linea}
          disparo={visor.disparo}
          onCerrar={onCerrarVisor}
        />
      )}
    </aside>
  )
}

export const Ficha = memo(FichaImpl)
