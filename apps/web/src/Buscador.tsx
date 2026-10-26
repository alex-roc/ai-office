import { useId, useMemo, useState } from 'react'
import { ambitoDe, estaTapada, etiquetaAmbito, pluginsDe, servidoresMcpDe } from './alcance.ts'
import { Dialogo } from './Dialogo.tsx'
import { estaArchivado } from './derivados.ts'
import { type Lang, tr } from './i18n/index.ts'
import { useLang, useT } from './i18n/react.ts'
import { nombreHilo, normalizar } from './texto.ts'
import type { EntityBase, Snapshot } from './types.ts'

/**
 * Buscador de entidades (`/`): un combobox accesible por teclado. Escribir filtra, las flechas
 * recorren, Intro selecciona y Esc cierra. Elegir algo lo selecciona Y lo centra en la vista
 * actual; es la forma de encontrar una skill entre cuarenta lomos o un nodo entre cien.
 */

type TipoOpcion = 'agente' | 'skill' | 'comando' | 'hilo' | 'plugin' | 'mcp'

/** `tipo` es también la clase CSS de la etiqueta; lo que se lee sale de estas claves. */
const ROTULO_TIPO = {
  agente: 'kind.agent',
  skill: 'kind.skill',
  comando: 'kind.command',
  hilo: 'kind.main',
  plugin: 'kind.plugin',
  mcp: 'kind.mcp',
} as const

interface Opcion {
  id: string
  nombre: string
  tipo: TipoOpcion
  detalle: string
}

const MAXIMO = 40

/**
 * La descripción con su origen delante cuando no es del usuario (`project · …`, `plugin x · …`) o
 * está tapada: dos agentes con el mismo nombre, uno de usuario y otro de proyecto, no se pueden
 * distinguir por el nombre.
 */
const conOrigen = (e: EntityBase, lang: Lang): string => {
  const partes = [
    ambitoDe(e) !== 'user' ? etiquetaAmbito(e, lang) : '',
    estaTapada(e) ? tr(lang, 'ledger.shadowed') : '',
  ].filter(Boolean)
  return partes.length > 0 ? `${partes.join(' ')} · ${e.description}` : e.description
}

const opcionesDe = (s: Snapshot, lang: Lang): Opcion[] => [
  {
    id: s.mainThreadId,
    nombre: nombreHilo(lang),
    tipo: 'hilo',
    detalle: tr(lang, 'search.main.detail'),
  },
  ...s.catalog.agents
    .filter((a) => !estaArchivado(a))
    .map((a) => ({
      id: a.id,
      nombre: a.name,
      tipo: 'agente' as const,
      detalle: conOrigen(a, lang),
    })),
  ...s.catalog.skills.map((k) => ({
    id: k.id,
    nombre: k.name,
    tipo: 'skill' as const,
    detalle: conOrigen(k, lang),
  })),
  ...s.catalog.commands.map((c) => ({
    id: c.id,
    nombre: `/${c.name}`,
    tipo: 'comando' as const,
    detalle: conOrigen(c, lang),
  })),
  ...pluginsDe(s).map((p) => ({
    id: p.id,
    nombre: p.name,
    tipo: 'plugin' as const,
    detalle: p.description ?? p.key,
  })),
  ...servidoresMcpDe(s).map((m) => ({
    id: m.id,
    nombre: m.name,
    tipo: 'mcp' as const,
    detalle: m.urlHost ?? m.command ?? '',
  })),
]

/** Primero lo que EMPIEZA por lo escrito, luego lo que lo contiene en el nombre, luego en la descripción. */
const filtrar = (todas: Opcion[], consulta: string): Opcion[] => {
  const q = normalizar(consulta.trim().replace(/^\//, ''))
  if (!q) return todas.slice(0, MAXIMO)
  const puntuadas: { o: Opcion; p: number }[] = []
  for (const o of todas) {
    const nombre = normalizar(o.nombre.replace(/^\//, ''))
    if (nombre.startsWith(q)) puntuadas.push({ o, p: 0 })
    else if (nombre.includes(q)) puntuadas.push({ o, p: 1 })
    else if (normalizar(o.detalle).includes(q)) puntuadas.push({ o, p: 2 })
  }
  return puntuadas
    .sort((a, b) => a.p - b.p)
    .slice(0, MAXIMO)
    .map((x) => x.o)
}

export const Buscador = ({
  snapshot,
  onElegir,
  onCerrar,
}: {
  snapshot: Snapshot
  onElegir: (id: string) => void
  onCerrar: () => void
}) => {
  const [consulta, setConsulta] = useState('')
  const [activa, setActiva] = useState(0)
  const t = useT()
  const lang = useLang()
  const idLista = useId()
  const todas = useMemo(() => opcionesDe(snapshot, lang), [snapshot, lang])
  const resultados = useMemo(() => filtrar(todas, consulta), [todas, consulta])
  const actual = resultados[Math.min(activa, resultados.length - 1)]
  const idOpcion = (i: number) => `${idLista}-${i}`

  return (
    <Dialogo titulo={t('search.title')} onCerrar={onCerrar} claseModal="buscador">
      <input
        className="buscador-campo"
        role="combobox"
        aria-expanded={resultados.length > 0}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={actual ? idOpcion(resultados.indexOf(actual)) : undefined}
        aria-label={t('search.label')}
        placeholder={t('search.placeholder')}
        value={consulta}
        onChange={(e) => {
          setConsulta(e.target.value)
          setActiva(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiva((i) => Math.min(resultados.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiva((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter' && actual) {
            e.preventDefault()
            onElegir(actual.id)
          }
        }}
      />
      <div className="buscador-lista" id={idLista} role="listbox" aria-label={t('search.results')}>
        {resultados.map((o, i) => (
          <div
            key={o.id}
            id={idOpcion(i)}
            role="option"
            aria-selected={o === actual}
            tabIndex={-1}
            className={o === actual ? 'activa' : ''}
            // `mousedown` y no `click`: así el campo no pierde el foco antes de elegir.
            onMouseDown={(e) => {
              e.preventDefault()
              onElegir(o.id)
            }}
            onMouseMove={() => setActiva(i)}
          >
            <span className={`etiqueta ${o.tipo}`}>{t(ROTULO_TIPO[o.tipo])}</span>
            <span className="nombre">{o.nombre}</span>
            <span className="detalle">{o.detalle.slice(0, 90)}</span>
          </div>
        ))}
      </div>
      <p className="nota-dialogo" role="status">
        {resultados.length === 0 ? t('search.none') : t('search.count', { n: resultados.length })}
      </p>
    </Dialogo>
  )
}
