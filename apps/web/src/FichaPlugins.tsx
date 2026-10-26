import { useState } from 'react'
import {
  ambitoActivo,
  etiquetaAmbito,
  hayProyecto,
  nombreDePlugin,
  pluginsDe,
  quienTapa,
} from './alcance.ts'
import { fuenteTranscripts } from './derivados.ts'
import { ActividadFilas, Aviso, Cita, PorHerramienta, PorProyecto } from './FichaComun.tsx'
import type { PedirMutacion } from './FichaEdicion.tsx'
import { useT } from './i18n/react.ts'
import { herramientasTop, porProyecto } from './ledger.ts'
import type { ValorAjustes } from './mutations.ts'
import { conCodigo } from './Rico.tsx'
import { SelectorAmbito } from './SelectorAmbito.tsx'
import { nombreHilo, relDate, shortPath } from './texto.ts'
import type { Edge, McpServer, Plugin, SettingsScope, Snapshot } from './types.ts'

/**
 * Las fichas de un plugin y de un servidor MCP. No son un archivo que se edite línea a línea como
 * un agente, una skill o un comando: lo único que se cambia es si están habilitados, y eso es un
 * valor en un archivo de ajustes, siempre con su diff. Toda cifra cita de dónde sale.
 */

const AJUSTES: SettingsScope[] = ['user', 'project', 'local']

/** Dónde se puede escribir: `project` y `local` solo existen dentro de un proyecto. */
const ajustesPosibles = (snapshot: Snapshot): SettingsScope[] =>
  hayProyecto(snapshot) ? AJUSTES : ['user']

/** Elegir en qué ajustes se escribe el cambio, con el archivo que cada opción toca. */
const SelectorAjustes = ({
  opciones,
  valor,
  onCambiar,
}: {
  opciones: SettingsScope[]
  valor: SettingsScope
  onCambiar: (v: SettingsScope) => void
}) => {
  const t = useT()
  return (
    <label className="campo-ajustes">
      <span>{t('detail.settings.where')}</span>
      <select value={valor} onChange={(e) => onCambiar(e.target.value as SettingsScope)}>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {t(`settings.${o}`)}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Un enlace a otra entidad, con la cifra que la acompaña. */
const FilaEntidad = ({
  nombre,
  usos,
  onSelect,
  id,
}: {
  id: string
  nombre: string
  usos: number
  onSelect?: (id: string) => void
}) => {
  const t = useT()
  return (
    <div className="fila-archivado">
      <button type="button" className="enlace" onClick={() => onSelect?.(id)}>
        {nombre}
      </button>
      <span className="uso-cifras">{t('count.uses', { n: usos })}</span>
    </div>
  )
}

export const FichaPlugin = ({
  snapshot,
  plugin,
  onSelect,
  onMutate,
}: {
  snapshot: Snapshot
  plugin: Plugin
  onSelect?: (id: string) => void
  onMutate?: PedirMutacion
}) => {
  const t = useT()
  const act = snapshot.activity[plugin.id]
  const opciones = ajustesPosibles(snapshot)
  // Se propone escribir donde ya está decidido: es lo que el usuario espera cambiar.
  const [donde, setDonde] = useState<SettingsScope>(
    plugin.enabledSource && opciones.includes(plugin.enabledSource as SettingsScope)
      ? (plugin.enabledSource as SettingsScope)
      : 'user',
  )
  const nombreDe = (id: string, lista: { id: string; name: string }[]) =>
    lista.find((e) => e.id === id)?.name ?? id.split('/').pop() ?? id
  const grupos: {
    titulo: Parameters<typeof t>[0]
    ids: string[]
    lista: { id: string; name: string }[]
  }[] = [
    { titulo: 'detail.plugin.agents', ids: plugin.agents, lista: snapshot.catalog.agents },
    { titulo: 'detail.plugin.skills', ids: plugin.skills, lista: snapshot.catalog.skills },
    { titulo: 'detail.plugin.commands', ids: plugin.commands, lista: snapshot.catalog.commands },
    {
      titulo: 'detail.plugin.mcp',
      ids: plugin.mcpServers,
      lista: snapshot.catalog.mcpServers ?? [],
    },
  ]
  const [dirAgentes = '~/.claude/agents'] = snapshot.catalog.roots
  const raiz = shortPath(dirAgentes.replace(/[\\/]agents[\\/]?$/, ''))
  const sigue = plugin.enabled ? 'detail.plugin.disable' : 'detail.plugin.enable'

  return (
    <aside className="side" aria-label={t('detail.aria.of', { name: plugin.name })}>
      <div className="kind">{t('kind.plugin')}</div>
      <h2>{plugin.name}</h2>
      {plugin.description && <p className="desc">{plugin.description.slice(0, 400)}</p>}

      <section>
        <h3>{t('detail.plugin.about')}</h3>
        <div className="row">
          <span>{t('detail.plugin.version')}</span>
          <span>{plugin.version}</span>
        </div>
        <div className="row">
          <span>{t('detail.plugin.marketplace')}</span>
          <span>{plugin.marketplace}</span>
        </div>
        <div className="row">
          <span>{t('detail.plugin.enabled')}</span>
          <span>
            <span className={`badge ${plugin.enabled ? 'certified' : 'unused'}`}>
              {t(plugin.enabled ? 'detail.yes' : 'detail.no')}
            </span>
          </span>
        </div>
        <div className="row" title={t('detail.plugin.source.src', { root: raiz })}>
          <span>{t('detail.plugin.source')}</span>
          <span>
            {plugin.enabledSource
              ? t(`settings.${plugin.enabledSource}.short`)
              : t('detail.plugin.source.none')}
          </span>
        </div>
        <div className="row" title={t('detail.plugin.cost.src')}>
          <span>{t('detail.plugin.cost')}</span>
          <span>
            {t('detail.def.tokens', { n: plugin.descriptionTokens })}
            {plugin.enabled ? '' : ` · ${t('detail.plugin.cost.off')}`}
          </span>
        </div>
      </section>

      <section>
        <h3>{t('detail.service')}</h3>
        <ActividadFilas snapshot={snapshot} act={act} />
      </section>
      <PorProyecto datos={porProyecto(act)} />

      {grupos
        .filter((g) => g.ids.length > 0)
        .map((g) => (
          <section key={g.titulo}>
            <h3>{t(g.titulo, { n: g.ids.length })}</h3>
            {g.ids.map((id) => (
              <FilaEntidad
                key={id}
                id={id}
                nombre={nombreDe(id, g.lista)}
                usos={snapshot.activity[id]?.uses ?? 0}
                onSelect={onSelect}
              />
            ))}
          </section>
        ))}

      {onMutate && (
        <section>
          <h3>{t('detail.edit')}</h3>
          <SelectorAjustes opciones={opciones} valor={donde} onCambiar={setDonde} />
          <button
            type="button"
            className="anadir"
            onClick={() =>
              onMutate(
                {
                  kind: plugin.enabled ? 'plugin.disable' : 'plugin.enable',
                  entityId: plugin.id,
                  value: { scope: donde } satisfies ValorAjustes,
                },
                t(plugin.enabled ? 'diff.title.plugin.disable' : 'diff.title.plugin.enable', {
                  name: plugin.name,
                  where: t(`settings.${donde}.short`),
                }),
              )
            }
          >
            {t(sigue)}
          </button>
          <p className="nota">{conCodigo(t('detail.plugin.reload'))}</p>
          {plugin.enabledSource === 'managed' && (
            <p className="nota">{conCodigo(t('detail.plugin.managed'))}</p>
          )}
          {!hayProyecto(snapshot) && (
            <p className="nota">{conCodigo(t('detail.plugin.userOnly'))}</p>
          )}
        </section>
      )}

      <section>
        <h3>{t('detail.file')}</h3>
        <div className="evidence">
          <code>{shortPath(plugin.installPath)}</code>
        </div>
        <p className="nota">{t('detail.plugin.readonly')}</p>
      </section>
    </aside>
  )
}

/** Quién usa un servidor: lo que sus agentes declaran en `tools:` y lo que de verdad llamaron. */
const QuienUsaMcp = ({
  snapshot,
  servidor,
  onSelect,
  onVisor,
}: {
  snapshot: Snapshot
  servidor: McpServer
  onSelect?: (id: string) => void
  onVisor?: (id: string, linea?: number) => void
}) => {
  const t = useT()
  const entrantes = snapshot.edges.filter(
    (e) => e.to === servidor.id && e.kind === 'agent-uses-mcp',
  )
  const nombreDe = (id: string): string =>
    id === snapshot.mainThreadId
      ? nombreHilo()
      : (snapshot.catalog.agents.find((a) => a.id === id)?.name ?? id.split('/').pop() ?? id)
  const capas: { capa: Edge['layer']; titulo: Parameters<typeof t>[0] }[] = [
    { capa: 'proven', titulo: 'detail.who.proven' },
    { capa: 'declared', titulo: 'detail.mcp.who.declared' },
  ]
  const hay = capas.filter((c) => entrantes.some((e) => e.layer === c.capa))
  return (
    <section>
      <h3>{t('detail.who')}</h3>
      {hay.length === 0 && <p className="empty">{t('detail.mcp.who.none')}</p>}
      {hay.map(({ capa, titulo }) => (
        <div key={capa}>
          <h3 className="subtitulo">{conCodigo(t(titulo))}</h3>
          {entrantes
            .filter((e) => e.layer === capa)
            .map((e) => (
              <div className="evidence" key={`${e.from}-${capa}`}>
                <div className="uso-cabecera">
                  <button type="button" className="enlace" onClick={() => onSelect?.(e.from)}>
                    {nombreDe(e.from)}
                  </button>
                  {capa === 'proven' && (
                    <span className="uso-cifras">
                      {t('count.uses', { n: e.uses ?? 0 })} · {relDate(e.lastUsedAt)}
                    </span>
                  )}
                </div>
                {/* La evidencia de lo acreditado son las herramientas más llamadas; la de lo
                    declarado, el `tools:` del propio agente, que se puede abrir en su línea. */}
                {capa === 'proven' ? (
                  <div className="quote chico">
                    {e.evidence
                      .map((ev) => ev.excerpt)
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                ) : (
                  e.evidence[0] && <Cita snapshot={snapshot} ev={e.evidence[0]} onVisor={onVisor} />
                )}
              </div>
            ))}
        </div>
      ))}
    </section>
  )
}

export const FichaMcp = ({
  snapshot,
  servidor,
  onSelect,
  onMutate,
  onAmbito,
  onVisor,
}: {
  snapshot: Snapshot
  servidor: McpServer
  onSelect?: (id: string) => void
  onMutate?: PedirMutacion
  onAmbito?: (valor: string) => void
  onVisor?: (id: string, linea?: number) => void
}) => {
  const t = useT()
  const act = snapshot.activity[servidor.id]
  const conProyecto = hayProyecto(snapshot)
  const duenoPlugin = servidor.plugin
    ? pluginsDe(snapshot).find((p) => p.key === servidor.plugin)
    : undefined
  const tapa = quienTapa(servidor)
  // Un servidor de `.mcp.json` se desactiva en unos ajustes a elegir; el resto, en `~/.claude.json`.
  const ajustable = servidor.scope === 'project'
  const habilitado = servidor.enabled !== false
  const [donde, setDonde] = useState<SettingsScope>(
    habilitado
      ? 'local'
      : (servidor.disabledIn?.find((s) => s === 'local') ?? servidor.disabledIn?.[0] ?? 'local'),
  )
  // Sin proyecto abierto `enabled` es `null` (no se puede saber), pero la sección sigue: explica por qué.
  const apagable = servidor.scope !== 'managed'
  const estado =
    servidor.enabled === null
      ? t('ledger.enabled.perProject.short')
      : t(servidor.enabled ? 'detail.yes' : 'detail.no')
  const entorno = servidor.envKeys
  const cabeceras = servidor.headerKeys
  const ambito = ambitoActivo(snapshot)

  return (
    <aside className="side" aria-label={t('detail.aria.of', { name: servidor.name })}>
      <div className="kind">
        {t('kind.mcp')} · {etiquetaAmbito(servidor)}
      </div>
      <h2>{servidor.name}</h2>
      {servidor.description && <p className="desc">{servidor.description.slice(0, 400)}</p>}

      {servidor.plugin && (
        <Aviso
          enlace={duenoPlugin ? t('detail.plugin.open') : undefined}
          onEnlace={duenoPlugin ? () => onSelect?.(duenoPlugin.id) : undefined}
        >
          {t('detail.fromPlugin', { plugin: nombreDePlugin(servidor.plugin) })}
        </Aviso>
      )}
      {tapa && (
        <Aviso clase="tapada">
          {t('detail.shadowed', {
            by: `${tapa.name} (${etiquetaAmbito({ scope: tapa.scope })})`,
          })}
        </Aviso>
      )}

      <section>
        <h3>{t('detail.mcp.about')}</h3>
        <div className="row">
          <span>{t('detail.mcp.scope')}</span>
          <span>{etiquetaAmbito(servidor)}</span>
        </div>
        <div className="row">
          <span>{t('detail.mcp.transport')}</span>
          <span>{servidor.transport}</span>
        </div>
        {servidor.command && (
          <div className="row">
            <span>{t('detail.mcp.command')}</span>
            <span>{servidor.command}</span>
          </div>
        )}
        {servidor.urlHost && (
          <div className="row">
            <span>{t('detail.mcp.host')}</span>
            <span>{servidor.urlHost}</span>
          </div>
        )}
        <div
          className="row"
          title={servidor.enabled === null ? t('ledger.enabled.perProject') : undefined}
        >
          <span>{t('detail.mcp.enabled')}</span>
          <span>{estado}</span>
        </div>
        {servidor.disabledIn && servidor.disabledIn.length > 0 && (
          <div className="row">
            <span>{t('detail.mcp.disabledIn')}</span>
            <span>{servidor.disabledIn.map((s) => t(`settings.${s}.short`)).join(', ')}</span>
          </div>
        )}
      </section>

      {(entorno.length > 0 || cabeceras.length > 0) && (
        <section>
          <h3>{t('detail.mcp.keys')}</h3>
          {entorno.length > 0 && (
            <>
              <h3 className="subtitulo">{t('detail.mcp.env')}</h3>
              <p className="claves">
                {entorno.map((k) => (
                  <code key={k}>{k}</code>
                ))}
              </p>
            </>
          )}
          {cabeceras.length > 0 && (
            <>
              <h3 className="subtitulo">{t('detail.mcp.headers')}</h3>
              <p className="claves">
                {cabeceras.map((k) => (
                  <code key={k}>{k}</code>
                ))}
              </p>
            </>
          )}
          <p className="nota">{t('detail.mcp.keys.note')}</p>
        </section>
      )}

      <section>
        <h3>{t('detail.service')}</h3>
        <ActividadFilas snapshot={snapshot} act={act} />
      </section>
      <PorHerramienta
        datos={herramientasTop(act)}
        fuente={t('detail.byTool.src', { transcripts: fuenteTranscripts(snapshot) })}
      />
      <PorProyecto datos={porProyecto(act)} />
      <QuienUsaMcp snapshot={snapshot} servidor={servidor} onSelect={onSelect} onVisor={onVisor} />

      {onMutate && apagable && (
        <section>
          <h3>{t('detail.edit')}</h3>
          {conProyecto ? (
            <>
              {ajustable && (
                <SelectorAjustes opciones={AJUSTES} valor={donde} onCambiar={setDonde} />
              )}
              <button
                type="button"
                className="anadir"
                onClick={() =>
                  onMutate(
                    {
                      kind: habilitado ? 'mcp.disable' : 'mcp.enable',
                      entityId: servidor.id,
                      ...(ajustable ? { value: { scope: donde } satisfies ValorAjustes } : {}),
                    },
                    t(habilitado ? 'diff.title.mcp.disable' : 'diff.title.mcp.enable', {
                      name: servidor.name,
                      project:
                        ambito.kind === 'project' ? (ambito.path.split(/[\\/]/).pop() ?? '') : '',
                    }),
                  )
                }
              >
                {t(habilitado ? 'detail.mcp.disable' : 'detail.mcp.enable')}
              </button>
              <p className="nota">{conCodigo(t('detail.mcp.perProject'))}</p>
            </>
          ) : (
            <>
              <p className="nota">{conCodigo(t('detail.mcp.needsProject'))}</p>
              {onAmbito && <SelectorAmbito snapshot={snapshot} onCambiar={onAmbito} />}
            </>
          )}
        </section>
      )}

      <section>
        <h3>{t('detail.file')}</h3>
        <div className="evidence">
          <code>{shortPath(servidor.source.realPath)}</code>
        </div>
        <p className="nota">{t('detail.mcp.fileNote')}</p>
      </section>
    </aside>
  )
}
