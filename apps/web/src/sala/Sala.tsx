import { memo, useEffect, useImperativeHandle, useRef } from 'react'
import { onEvento } from '../live.ts'
import type { Snapshot } from '../types.ts'
import type { RefVista } from '../vista.ts'
import { Escena } from './escena.ts'

/**
 * Envoltorio de React alrededor de la escena de Pixi.
 *
 * Este componente es deliberadamente tonto: monta la escena, le pasa el snapshot cuando cambia y
 * le reenvía la selección. No sabe nada de sprites, de cámara ni de animación, y no se vuelve a
 * renderizar cuando la sala se mueve. Todo lo que ocurre a 60 fps vive dentro de `Escena`.
 *
 * Vive montado todo el rato, incluso con el Plano delante: destruir y recrear la aplicación de
 * Pixi al cambiar de vista tardaba y perdía la cámara. Oculta, solo se pausa su bucle.
 */
const SalaImpl = ({
  snapshot,
  selected,
  onSelect,
  activa = true,
  ref,
}: {
  snapshot: Snapshot
  selected: string | null
  onSelect: (id: string | null) => void
  /** Falso mientras el Plano está delante: se pausa el bucle de animación. */
  activa?: boolean
  ref?: RefVista
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
  const activaRef = useRef(activa)
  activaRef.current = activa

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let vivo = true
    const escena = new Escena({ onSelect: (id) => onSelectRef.current(id) })
    escena.iniciar(host).then(
      () => {
        // Si el efecto se limpió mientras cargaban las texturas, `destruir()` ya desmontó la
        // escena (es idempotente y `iniciar()` se retira solo): no hay nada que aplicar.
        if (!vivo) return
        escenaRef.current = escena
        escena.aplicar(snapshotRef.current)
        escena.seleccionar(selectedRef.current)
        escena.encajar()
        escena.activar(activaRef.current)
      },
      (e) => console.error('No se pudo iniciar la Sala', e),
    )
    return () => {
      vivo = false
      escenaRef.current = null
      escena.destruir()
      host.replaceChildren()
    }
  }, [])

  useEffect(() => {
    const escena = escenaRef.current
    if (!escena) return
    // Se reencuadra solo si cambió el conjunto de entidades: encajar tras cada snapshot movía la
    // vista mientras el usuario la estaba mirando.
    if (escena.aplicar(snapshot)) escena.encajar()
  }, [snapshot])

  useEffect(() => {
    escenaRef.current?.seleccionar(selected)
  }, [selected])

  useEffect(() => {
    escenaRef.current?.activar(activa)
  }, [activa])

  // Los destellos llegan por WebSocket y no pasan por React: se reenvían directos a la escena.
  useEffect(
    () =>
      onEvento((e) => {
        if (e.entityId && Date.now() - e.ts < 1500) escenaRef.current?.destello(e.entityId)
      }),
    [],
  )

  useImperativeHandle(
    ref,
    () => ({
      encuadrar: () => escenaRef.current?.encajar(),
      zoom: (d) => escenaRef.current?.zoomPaso(d),
      centrarEn: (id) => escenaRef.current?.centrarEn(id) ?? false,
    }),
    [],
  )

  // La rueda va con un listener nativo no pasivo: así se puede impedir que el navegador haga
  // zoom de página con el pellizco del trackpad mientras se hace zoom en la sala.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const alRodar = (e: WheelEvent) => {
      e.preventDefault()
      const r = host.getBoundingClientRect()
      escenaRef.current?.rueda(e.deltaY, e.deltaMode, e.clientX - r.left, e.clientY - r.top)
    }
    host.addEventListener('wheel', alRodar, { passive: false })
    return () => host.removeEventListener('wheel', alRodar)
  }, [])

  const arrastre = useRef<{ x: number; y: number } | null>(null)

  return (
    <div className="canvas">
      <div
        className="sala-host"
        ref={hostRef}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          // Arrastrar el minimapa lleva la cámara a donde se señala; no debe además desplazarla.
          if (escenaRef.current?.enMinimapa(e.clientX - r.left, e.clientY - r.top)) return
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
      <details className="leyenda-sala">
        <summary>cómo leer la sala</summary>
        <ul>
          <li>
            <b>Persona en gris</b>: agente al que nunca has delegado. En color: ya ha trabajado.
          </li>
          <li>
            <b>Alto del lomo</b>: grado de la skill (sin estrenar, estrenada, en práctica,
            acreditada). El color es el agente que más la usa.
          </li>
          <li>
            <b>Lomo sin tejuelo dorado</b>: skill que nunca se ha usado.
          </li>
          <li>
            <b>Archivo común</b> (balda alta del vestíbulo): skills que cita media planta.{' '}
            <b>Depósito</b> (balda baja): skills que no cita ningún agente.
          </li>
          <li>
            <b>Tarjeta con chincheta roja</b>: comando que se ha ejecutado; gris, nunca.
          </li>
          <li>
            <b>Placa de la puerta</b>: pasa el ratón para ver por qué esos agentes comparten
            despacho.
          </li>
        </ul>
      </details>
    </div>
  )
}

export const Sala = memo(SalaImpl)
