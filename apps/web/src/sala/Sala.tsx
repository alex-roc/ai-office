import { useCallback, useEffect, useRef } from 'react'
import type { Snapshot } from '../types.ts'
import { Escena } from './escena.ts'

/**
 * Envoltorio de React alrededor de la escena de Pixi.
 *
 * Este componente es deliberadamente tonto: monta la escena, le pasa el snapshot cuando cambia y
 * le reenvía la selección. No sabe nada de sprites, de cámara ni de animación, y no se vuelve a
 * renderizar cuando la sala se mueve. Todo lo que ocurre a 60 fps vive dentro de `Escena`.
 */
export const Sala = ({
  snapshot,
  selected,
  onSelect,
  lastTouch = {},
}: {
  snapshot: Snapshot
  selected: string | null
  onSelect: (id: string | null) => void
  /** Momento en que cada entidad se usó por última vez en vivo, para el destello. */
  lastTouch?: Record<string, number>
}) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const escenaRef = useRef<Escena | null>(null)
  // La selección se lee desde el callback de Pixi, que se registra una sola vez: sin esta
  // referencia el callback capturaría el `onSelect` del primer render para siempre.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  // `iniciar()` es asíncrono (carga veinte texturas). El snapshot suele llegar ANTES de que
  // termine, y como después no vuelve a cambiar, el efecto de abajo no se repetiría nunca y la
  // sala se quedaría vacía. Se guarda el último aquí y se aplica en cuanto la escena existe.
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let vivo = true
    const escena = new Escena({ onSelect: (id) => onSelectRef.current(id) })
    escena.iniciar(host).then(() => {
      // El efecto puede haberse limpiado mientras se cargaban las texturas (StrictMode monta y
      // desmonta a propósito); sin esta guarda quedaría un canvas huérfano en el DOM.
      if (!vivo) {
        escena.destruir()
        return
      }
      escenaRef.current = escena
      escena.aplicar(snapshotRef.current)
      escena.seleccionar(selectedRef.current)
      escena.encajar()
    })
    return () => {
      vivo = false
      escenaRef.current = null
      escena.destruir()
      host.replaceChildren()
    }
  }, [])

  useEffect(() => {
    escenaRef.current?.aplicar(snapshot)
    escenaRef.current?.encajar()
  }, [snapshot])

  useEffect(() => {
    escenaRef.current?.seleccionar(selected)
  }, [selected])

  // Los destellos llegan por WebSocket como marcas de tiempo; se reenvían los recientes.
  useEffect(() => {
    const ahora = Date.now()
    for (const [id, cuando] of Object.entries(lastTouch)) {
      if (ahora - cuando < 1500) escenaRef.current?.destello(id)
    }
  }, [lastTouch])

  const arrastre = useRef<{ x: number; y: number } | null>(null)

  const onWheel = useCallback((e: React.WheelEvent) => {
    escenaRef.current?.zoom(e.deltaY)
  }, [])

  return (
    <div
      className="canvas"
      ref={hostRef}
      onWheel={onWheel}
      onPointerDown={(e) => {
        arrastre.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerMove={(e) => {
        const a = arrastre.current
        if (!a) return
        escenaRef.current?.desplazar(e.clientX - a.x, e.clientY - a.y)
        arrastre.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={() => {
        arrastre.current = null
      }}
      onPointerLeave={() => {
        arrastre.current = null
      }}
    />
  )
}
