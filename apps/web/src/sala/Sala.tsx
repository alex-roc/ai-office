import { memo, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useLang, useT } from '../i18n/react.ts'
import { onEvento } from '../live.ts'
import { conCodigo } from '../Rico.tsx'
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
const LEYENDA = [
  'office.legend.grey',
  'office.legend.spine',
  'office.legend.nolabel',
  'office.legend.shelves',
  'office.legend.card',
  'office.legend.plate',
  'office.legend.plugin',
  'office.legend.rack',
  'office.legend.shadowed',
] as const

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
  const t = useT()
  // Las texturas tardan unos segundos la primera vez (más en una máquina sin GPU): sin aviso, el
  // lienzo vacío parece un fallo.
  const [lista, setLista] = useState(false)
  const lang = useLang()
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
        setLista(true)
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: `lang` no se lee dentro, pero cambia los textos de Pixi
  useEffect(() => {
    const escena = escenaRef.current
    if (!escena) return
    // Se reencuadra solo si cambió el conjunto de entidades: encajar tras cada snapshot movía la
    // vista mientras el usuario la estaba mirando.
    // También al cambiar de idioma: placas, tooltips y rótulos son texto de Pixi y se regeneran
    // reconstruyendo la planta. Como el conjunto de entidades no cambia, la cámara se queda donde está.
    if (escena.aplicar(snapshot)) escena.encajar()
  }, [snapshot, lang])

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
      {!lista && <div className="sala-cargando">{t('office.loading')}</div>}
      <details className="leyenda-sala">
        <summary>{t('office.legend.summary')}</summary>
        <ul>
          {LEYENDA.map((k) => (
            <li key={k}>{conCodigo(t(k))}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}

export const Sala = memo(SalaImpl)
