import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { etiquetaAmbito, type GrupoAmbito } from './alcance.ts'
import { fuenteTranscripts, medidoSobre, medidoTexto } from './derivados.ts'
import { fmtNum } from './i18n/index.ts'
import { useLang, useT } from './i18n/react.ts'
import {
  type ClaveOrden,
  type Direccion,
  direccionInicial,
  type FilaLedger,
  type FiltroAmbito,
  type FiltroTipo,
  filasLedger,
  filtrarFilas,
  ordenarFilas,
} from './ledger.ts'
import { Sparkline } from './Sparkline.tsx'
import { gradoEtiqueta, relDate, shortPath } from './texto.ts'
import type { Snapshot } from './types.ts'

/**
 * El Registro: la tabla de todo lo que hay, con lo que de verdad se ha usado. Ordenable por
 * cualquier columna, filtrable por tipo, por ámbito y por "solo sin usar", con búsqueda por
 * nombre. Siempre enseña todo —plugins y servidores MCP incluidos—: "Show" no lo afecta. Pulsar una
 * fila selecciona la entidad y su ficha aparece a la derecha, como en las otras dos vistas.
 *
 * Cada columna cita en su `title` el archivo y el campo de los que sale la cifra.
 */

const FILTROS: FiltroTipo[] = ['all', 'agent', 'skill', 'command', 'plugin', 'mcp']
const ROTULO_FILTRO = {
  all: 'ledger.filter.all',
  agent: 'ledger.filter.agents',
  skill: 'ledger.filter.skills',
  command: 'ledger.filter.commands',
  plugin: 'ledger.filter.plugins',
  mcp: 'ledger.filter.mcp',
} as const

const AMBITOS: FiltroAmbito[] = ['all', 'user', 'project', 'plugin']
const ROTULO_AMBITO: Record<FiltroAmbito, 'ledger.scope.all' | `ledger.scope.${GrupoAmbito}`> = {
  all: 'ledger.scope.all',
  user: 'ledger.scope.user',
  project: 'ledger.scope.project',
  plugin: 'ledger.scope.plugin',
}

interface Columna {
  clave: ClaveOrden
  rotulo: Parameters<ReturnType<typeof useT>>[0]
  fuente: Parameters<ReturnType<typeof useT>>[0]
  /** Cifras alineadas a la derecha. */
  num?: boolean
}

const COLUMNAS: Columna[] = [
  { clave: 'name', rotulo: 'ledger.col.name', fuente: 'ledger.src.name' },
  { clave: 'kind', rotulo: 'ledger.col.kind', fuente: 'ledger.src.kind' },
  { clave: 'scope', rotulo: 'ledger.col.scope', fuente: 'ledger.src.scope' },
  { clave: 'enabled', rotulo: 'ledger.col.enabled', fuente: 'ledger.src.enabled' },
  { clave: 'grade', rotulo: 'ledger.col.grade', fuente: 'ledger.src.grade' },
  { clave: 'uses', rotulo: 'ledger.col.uses', fuente: 'ledger.src.uses', num: true },
  { clave: 'sessions', rotulo: 'ledger.col.sessions', fuente: 'ledger.src.sessions', num: true },
  { clave: 'projects', rotulo: 'ledger.col.projects', fuente: 'ledger.src.projects', num: true },
  { clave: 'last', rotulo: 'ledger.col.last', fuente: 'ledger.src.last' },
  { clave: 'trend', rotulo: 'ledger.col.trend', fuente: 'ledger.src.trend' },
  { clave: 'cost', rotulo: 'ledger.col.cost', fuente: 'ledger.src.cost', num: true },
  { clave: 'cites', rotulo: 'ledger.col.cites', fuente: 'ledger.src.cites', num: true },
  { clave: 'calls', rotulo: 'ledger.col.calls', fuente: 'ledger.src.calls', num: true },
]

const Fila = ({
  fila,
  elegida,
  onSelect,
}: {
  fila: FilaLedger
  elegida: boolean
  onSelect: (id: string) => void
}) => {
  const t = useT()
  const ref = useRef<HTMLTableRowElement>(null)
  const herramientas = fila.tools
    ? t('ledger.tools', {
        tools: fila.tools
          .slice(0, 5)
          .map(([nombre, n]) => `${nombre} (${fmtNum(n)})`)
          .join(', '),
      })
    : undefined
  // Elegir algo desde otra vista o desde el buscador lo trae a la vista en la tabla.
  useEffect(() => {
    if (elegida) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [elegida])
  return (
    // El teclado lo cubre el botón del nombre: la fila entera es solo una zona de clic más grande.
    <tr
      ref={ref}
      data-elegida={elegida}
      data-tenue={fila.enabled === false}
      onClick={() => onSelect(fila.id)}
    >
      <th scope="row">
        <button
          type="button"
          className="enlace nombre-fila"
          aria-current={elegida ? 'true' : undefined}
          title={herramientas}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(fila.id)
          }}
        >
          {fila.name}
        </button>
        {fila.retired && <span className="etiqueta retirada"> {t('ledger.retired')}</span>}
        {fila.shadowedBy && (
          <span className="etiqueta retirada" title={t('ledger.shadowed.title')}>
            {' '}
            {t('ledger.shadowed')}
          </span>
        )}
      </th>
      <td>
        <span className={`etiqueta ${fila.kind}`}>{t(`kind.${fila.kind}`)}</span>
      </td>
      <td>
        <span className={`etiqueta ambito ${fila.scope}`}>
          {etiquetaAmbito({ scope: fila.scope, plugin: fila.origen ?? undefined })}
        </span>
      </td>
      <td>
        {fila.enabled === null ? (
          <span className="tenue" title={t('ledger.enabled.perProject')}>
            {t('ledger.enabled.perProject.short')}
          </span>
        ) : (
          <span className={fila.enabled ? 'si' : 'no'}>
            {t(fila.enabled ? 'detail.yes' : 'detail.no')}
          </span>
        )}
      </td>
      <td>
        <span className={`badge ${fila.grade}`}>{gradoEtiqueta(fila.grade)}</span>
      </td>
      <td className="num">
        {/* Un servidor MCP cita sus herramientas más usadas: es la cifra que lo explica. */}
        <span title={herramientas}>{fmtNum(fila.uses)}</span>
      </td>
      <td className="num">{fmtNum(fila.sessions)}</td>
      <td className="num">{fmtNum(fila.projects)}</td>
      <td>{relDate(fila.lastUsedAt)}</td>
      <td>
        {fila.weekly ? <Sparkline valores={fila.weekly} /> : <span className="tenue">—</span>}
      </td>
      <td className="num">
        {fila.descTokens === null ? (
          <span className="tenue">—</span>
        ) : (
          <span
            title={
              fila.retired
                ? t('ledger.cost.retired')
                : fila.enabled === false
                  ? t('ledger.cost.disabled')
                  : undefined
            }
          >
            {fmtNum(fila.descTokens)}
          </span>
        )}
      </td>
      <td className="num">
        {fila.cited === null ? (
          <span className="tenue">—</span>
        ) : (
          `${fmtNum(fila.cited)} / ${fmtNum(fila.proven ?? 0)}`
        )}
      </td>
      <td className="num">
        {fila.calls === null ? (
          <span className="tenue">—</span>
        ) : (
          <span title={fila.calls.join(', ') || undefined}>{fmtNum(fila.calls.length)}</span>
        )}
      </td>
    </tr>
  )
}

const LedgerImpl = ({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: Snapshot
  selected: string | null
  onSelect: (id: string) => void
}) => {
  const t = useT()
  useLang()
  const [tipo, setTipo] = useState<FiltroTipo>('all')
  const [ambito, setAmbito] = useState<FiltroAmbito>('all')
  const [soloSinUsar, setSoloSinUsar] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<{ clave: ClaveOrden; dir: Direccion }>({
    clave: 'uses',
    dir: 'desc',
  })

  const todas = useMemo(() => filasLedger(snapshot), [snapshot])
  const filas = useMemo(
    () =>
      ordenarFilas(
        filtrarFilas(todas, { tipo, ambito, soloSinUsar, busqueda }),
        orden.clave,
        orden.dir,
      ),
    [todas, tipo, ambito, soloSinUsar, busqueda, orden],
  )

  const transcripts = fuenteTranscripts(snapshot)
  const [
    dirAgentes = '~/.claude/agents',
    dirComandos = '~/.claude/commands',
    dirSkills = '~/.claude/skills',
  ] = snapshot.catalog.roots
  const fuentes = {
    agents: shortPath(dirAgentes),
    commands: shortPath(dirComandos),
    skills: shortPath(dirSkills),
    root: shortPath(dirAgentes.replace(/[\\/]agents[\\/]?$/, '')),
    transcripts,
  }

  const ordenarPor = (clave: ClaveOrden) =>
    setOrden((o) =>
      o.clave === clave
        ? { clave, dir: o.dir === 'asc' ? 'desc' : 'asc' }
        : { clave, dir: direccionInicial(clave) },
    )

  return (
    <section className="ledger" aria-label={t('ledger.aria')}>
      <div className="ledger-controles">
        <fieldset className="views" aria-label={t('ledger.filter.type')}>
          {FILTROS.map((f) => (
            <button
              key={f}
              type="button"
              data-on={tipo === f}
              aria-pressed={tipo === f}
              onClick={() => setTipo(f)}
            >
              {t(ROTULO_FILTRO[f])}
            </button>
          ))}
        </fieldset>
        <fieldset className="views" aria-label={t('ledger.filter.scope')}>
          {AMBITOS.map((a) => (
            <button
              key={a}
              type="button"
              data-on={ambito === a}
              aria-pressed={ambito === a}
              onClick={() => setAmbito(a)}
            >
              {t(ROTULO_AMBITO[a])}
            </button>
          ))}
        </fieldset>
        <label className="casilla simple">
          <input
            type="checkbox"
            checked={soloSinUsar}
            onChange={(e) => setSoloSinUsar(e.target.checked)}
          />
          <span title={t('ledger.unused.title', { transcripts })}>{t('ledger.unused')}</span>
        </label>
        <input
          className="buscador-campo ledger-buscar"
          type="search"
          value={busqueda}
          placeholder={t('ledger.search')}
          aria-label={t('ledger.search')}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <span
          className="ledger-medido"
          data-ambito={medidoSobre(snapshot).kind}
          title={t('measure.title', { transcripts })}
        >
          {t('measure.label')}: <b>{medidoTexto(snapshot)}</b>
        </span>
        <span className="ledger-cuenta" role="status">
          {t('ledger.count', { n: filas.length, total: todas.length })}
        </span>
      </div>
      <div className="ledger-tabla">
        <table>
          <caption className="solo-lectores">{t('ledger.aria')}</caption>
          <thead>
            <tr>
              {COLUMNAS.map((c) => (
                <th
                  key={c.clave}
                  scope="col"
                  className={c.num ? 'num' : undefined}
                  title={t(c.fuente, fuentes)}
                  aria-sort={
                    orden.clave === c.clave
                      ? orden.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button type="button" onClick={() => ordenarPor(c.clave)}>
                    {t(c.rotulo)}
                    <span aria-hidden="true" className="flecha">
                      {orden.clave === c.clave ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <Fila key={f.id} fila={f} elegida={f.id === selected} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <p className="empty ledger-vacio">{t('ledger.none')}</p>}
      </div>
    </section>
  )
}

export const Ledger = memo(LedgerImpl)
