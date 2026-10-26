import type { ReactNode } from 'react'
import { entidadDeRuta } from './campos.ts'
import { fuenteTranscripts, medidoTexto } from './derivados.ts'
import { fmtNum } from './i18n/index.ts'
import { useT } from './i18n/react.ts'
import { semanal } from './ledger.ts'
import { Sparkline } from './Sparkline.tsx'
import { gradoEtiqueta, relDate, shortPath } from './texto.ts'
import type { Activity, Edge, Snapshot } from './types.ts'

/** Piezas de la ficha que comparten la de una entidad, la de un plugin y la de un servidor MCP. */

/**
 * Una cita `archivo:línea`. Si el archivo es de una entidad del catálogo se puede pulsar y abre el
 * visor en esa línea; si no (un transcript, por ejemplo) es solo texto.
 */
export const Cita = ({
  snapshot,
  ev,
  onVisor,
}: {
  snapshot: Snapshot
  ev: Edge['evidence'][number]
  onVisor?: (id: string, linea?: number) => void
}) => {
  const t = useT()
  const texto = `${shortPath(ev.path)}${ev.line ? `:${ev.line}` : ''}${
    ev.field ? t('detail.ev.field', { field: ev.field }) : ''
  }`
  const dueno = entidadDeRuta(snapshot, ev.path)
  if (!dueno || !onVisor) return <code>{texto}</code>
  return (
    <button
      type="button"
      className="cita"
      title={t('detail.cite.title')}
      onClick={() => onVisor(dueno.id, ev.line)}
    >
      {texto}
    </button>
  )
}

export const Evidence = ({
  snapshot,
  edges,
  title,
  onVisor,
}: {
  snapshot: Snapshot
  edges: Edge[]
  title: ReactNode
  onVisor?: (id: string, linea?: number) => void
}) => {
  const t = useT()
  if (edges.length === 0) return null
  return (
    <section>
      <h3>{title}</h3>
      {edges.slice(0, 12).map((e) => {
        const ev = e.evidence[0]
        const nombre = e.to.split('/').pop() ?? e.to
        return (
          <div className="evidence" key={`${e.from}-${e.to}-${e.kind}-${e.layer}`}>
            <div>
              {e.kind === 'agent-uses-mcp' ? t('detail.ev.mcpName', { name: nombre }) : nombre}
              {e.dangling && <span className="etiqueta retirada"> {t('detail.ev.dangling')}</span>}
            </div>
            {ev?.excerpt && <div className="quote">“{ev.excerpt}”</div>}
            {ev && <Cita snapshot={snapshot} ev={ev} onVisor={onVisor} />}
          </div>
        )
      })}
    </section>
  )
}

/** Reparto por proyecto: las barras son relativas al proyecto con más usos. */
export const PorProyecto = ({ datos }: { datos: [string, number][] }) => {
  const t = useT()
  if (datos.length === 0) return null
  const max = Math.max(...datos.map(([, n]) => n), 1)
  return (
    <section>
      <h3>{t('detail.byProject')}</h3>
      {datos.slice(0, 8).map(([proyecto, n]) => (
        <div className="fila-proyecto" key={proyecto} title={proyecto}>
          <span className="nombre-proyecto">{proyecto}</span>
          <span className="barra-proyecto" aria-hidden="true">
            <span style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
          </span>
          <span className="cifra-proyecto">{fmtNum(n)}</span>
        </div>
      ))}
      {datos.length > 8 && (
        <p className="nota">{t('detail.byProject.more', { n: datos.length - 8 })}</p>
      )}
    </section>
  )
}

/**
 * Las filas de servicio de algo que se ha usado: usos, sesiones y proyectos, última vez, grado y
 * tendencia semanal. Cada cifra sale de los transcripts, y la tendencia lo cita en su title.
 */
export const ActividadFilas = ({ snapshot, act }: { snapshot: Snapshot; act?: Activity }) => {
  const t = useT()
  const semanas = semanal(act)
  return (
    <>
      <div className="row" title={t('measure.title', { transcripts: fuenteTranscripts(snapshot) })}>
        <span>{t('measure.label')}</span>
        <span>{medidoTexto(snapshot)}</span>
      </div>
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
          <span className={`badge ${act?.grade ?? 'unused'}`}>{gradoEtiqueta(act?.grade)}</span>
        </span>
      </div>
      {semanas && (
        <div
          className="row"
          title={t('detail.trend.src', { transcripts: fuenteTranscripts(snapshot) })}
        >
          <span>{t('detail.trend')}</span>
          <span>
            <Sparkline valores={semanas} />
          </span>
        </div>
      )}
    </>
  )
}

/** Un aviso con su enlace opcional: "viene del plugin X", "tapada por Y". */
export const Aviso = ({
  children,
  enlace,
  onEnlace,
  clase = '',
}: {
  children: ReactNode
  enlace?: string
  onEnlace?: () => void
  clase?: string
}) => (
  <p className={`aviso-ficha ${clase}`} role="note">
    {children}
    {enlace && onEnlace && (
      <>
        {' '}
        <button type="button" className="enlace" onClick={onEnlace}>
          {enlace}
        </button>
      </>
    )}
  </p>
)

/** Las herramientas de un servidor MCP, de más a menos usadas, con barras relativas a la primera. */
export const PorHerramienta = ({
  datos,
  fuente,
}: {
  datos: [string, number][]
  /** De dónde salen las cifras: toda tabla cita su fuente. */
  fuente: string
}) => {
  const t = useT()
  if (datos.length === 0) return null
  const max = Math.max(...datos.map(([, n]) => n), 1)
  return (
    <section>
      <h3 title={fuente}>{t('detail.byTool')}</h3>
      {datos.slice(0, 10).map(([herramienta, n]) => (
        <div className="fila-proyecto" key={herramienta} title={herramienta}>
          <span className="nombre-proyecto">{herramienta}</span>
          <span className="barra-proyecto" aria-hidden="true">
            <span style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
          </span>
          <span className="cifra-proyecto">{fmtNum(n)}</span>
        </div>
      ))}
      {datos.length > 10 && (
        <p className="nota">{t('detail.byTool.more', { n: datos.length - 10 })}</p>
      )}
    </section>
  )
}
