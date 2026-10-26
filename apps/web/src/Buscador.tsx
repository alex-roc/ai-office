import { useId, useMemo, useState } from 'react'
import { Dialogo } from './Dialogo.tsx'
import { estaArchivado } from './derivados.ts'
import { NOMBRE_HILO, normalizar, plural } from './texto.ts'
import type { Snapshot } from './types.ts'

/**
 * Buscador de entidades (`/`): un combobox accesible por teclado. Escribir filtra, las flechas
 * recorren, Intro selecciona y Esc cierra. Elegir algo lo selecciona Y lo centra en la vista
 * actual; es la forma de encontrar una skill entre cuarenta lomos o un nodo entre cien.
 */

interface Opcion {
  id: string
  nombre: string
  tipo: 'agente' | 'skill' | 'comando' | 'hilo'
  detalle: string
}

const MAXIMO = 40

const opcionesDe = (s: Snapshot): Opcion[] => [
  { id: s.mainThreadId, nombre: NOMBRE_HILO, tipo: 'hilo', detalle: 'tu sesión, sin subagente' },
  ...s.catalog.agents
    .filter((a) => !estaArchivado(a))
    .map((a) => ({ id: a.id, nombre: a.name, tipo: 'agente' as const, detalle: a.description })),
  ...s.catalog.skills.map((k) => ({
    id: k.id,
    nombre: k.name,
    tipo: 'skill' as const,
    detalle: k.description,
  })),
  ...s.catalog.commands.map((c) => ({
    id: c.id,
    nombre: `/${c.name}`,
    tipo: 'comando' as const,
    detalle: c.description,
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
  const idLista = useId()
  const todas = useMemo(() => opcionesDe(snapshot), [snapshot])
  const resultados = useMemo(() => filtrar(todas, consulta), [todas, consulta])
  const actual = resultados[Math.min(activa, resultados.length - 1)]
  const idOpcion = (i: number) => `${idLista}-${i}`

  return (
    <Dialogo titulo="Buscar agente, skill o comando" onCerrar={onCerrar} claseModal="buscador">
      <input
        className="buscador-campo"
        role="combobox"
        aria-expanded={resultados.length > 0}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={actual ? idOpcion(resultados.indexOf(actual)) : undefined}
        aria-label="Nombre de lo que buscas"
        placeholder="escribe un nombre…"
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
      <div className="buscador-lista" id={idLista} role="listbox" aria-label="Resultados">
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
            <span className={`etiqueta ${o.tipo}`}>{o.tipo}</span>
            <span className="nombre">{o.nombre}</span>
            <span className="detalle">{o.detalle.slice(0, 90)}</span>
          </div>
        ))}
      </div>
      <p className="nota-dialogo" role="status">
        {resultados.length === 0
          ? 'Nada coincide con lo escrito.'
          : `${plural(resultados.length, 'resultado', 'resultados')} · ↑↓ para moverte, Intro para elegir, Esc para cerrar`}
      </p>
    </Dialogo>
  )
}
