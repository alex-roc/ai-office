import { useCallback, useEffect, useRef, useState } from 'react'
import { conCodigo } from './Rico.tsx'

/**
 * Avisos efímeros: confirmación tras guardar (`ok`), información (`info`, p. ej. "ya menciona X")
 * y errores (`error`). Los errores no se retiran solos: hay que leerlos. Todos llevan botón de
 * cerrar, y el rol ARIA distingue lo que debe interrumpir al lector de pantalla (`alert`) de lo
 * que solo se anuncia (`status`).
 */

export type TipoAviso = 'ok' | 'info' | 'error'

export interface Aviso {
  id: number
  tipo: TipoAviso
  texto: string
}

const DURACION_MS: Record<TipoAviso, number | null> = { ok: 4500, info: 6500, error: null }
const MAXIMO = 4

export const useAvisos = () => {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguiente = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const cerrar = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    setAvisos((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const avisar = useCallback(
    (tipo: TipoAviso, texto: string) => {
      const id = siguiente.current++
      setAvisos((prev) =>
        [...prev.filter((a) => a.texto !== texto), { id, tipo, texto }].slice(-MAXIMO),
      )
      const ms = DURACION_MS[tipo]
      if (ms)
        timers.current.set(
          id,
          setTimeout(() => cerrar(id), ms),
        )
    },
    [cerrar],
  )

  useEffect(() => {
    const mapa = timers.current
    return () => {
      for (const t of mapa.values()) clearTimeout(t)
    }
  }, [])

  return { avisos, avisar, cerrar }
}

export const Avisos = ({
  avisos,
  onCerrar,
}: {
  avisos: Aviso[]
  onCerrar: (id: number) => void
}) => (
  <div className="avisos">
    {avisos.map((a) => (
      <div
        key={a.id}
        className={`aviso-flotante ${a.tipo}`}
        role={a.tipo === 'error' ? 'alert' : 'status'}
      >
        <span>{conCodigo(a.texto)}</span>
        <button type="button" onClick={() => onCerrar(a.id)} aria-label="Cerrar el aviso">
          ✕
        </button>
      </div>
    ))}
  </div>
)
