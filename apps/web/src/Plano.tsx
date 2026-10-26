import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Clave } from './i18n/index.ts'
import { useT } from './i18n/react.ts'
import { conCodigo } from './Rico.tsx'
import type { Edge, EdgeLayer, Snapshot } from './types.ts'
import type { RefVista } from './vista.ts'

/**
 * El Plano: el grafo de la configuración, con las tres capas superpuestas.
 *
 * La lectura que importa: las punteadas son lo que tus archivos dicen que debería pasar y las
 * sólidas lo que los transcripts demuestran que pasó. La distancia entre ambas es el trabajo
 * pendiente, y no se ve en ninguna otra herramienta.
 */

interface Node extends SimulationNodeDatum {
  id: string
  name: string
  kind: 'agent' | 'skill' | 'command' | 'main'
  uses: number
  unused: boolean
}

interface Link extends SimulationLinkDatum<Node> {
  edge: Edge
}

const LAYER_STYLE: Record<EdgeLayer, { color: string; dash: string; label: Clave }> = {
  declared: { color: 'var(--declared)', dash: '3 3', label: 'plano.layer.declared' },
  preloaded: { color: 'var(--accent)', dash: '1 0', label: 'plano.layer.preloaded' },
  proven: { color: 'var(--proven)', dash: '1 0', label: 'plano.layer.proven' },
}

const KINDS_IN_GRAPH = new Set(['agent-uses-skill', 'command-invokes-agent'])

const K_MIN = 0.35
const K_MAX = 3

/**
 * Los colores van siempre como propiedad CSS, nunca como atributo de presentación: un
 * atributo SVG (`fill="var(--x)"`) no resuelve variables y el elemento se dibuja invisible.
 */
const shapeStyle = (fill: string, strokeWidth = 1, selected = false): CSSProperties => ({
  fill,
  stroke: selected ? 'var(--accent)' : 'var(--ink)',
  strokeWidth: selected ? Math.max(strokeWidth, 2.5) : strokeWidth,
})

interface Disposicion {
  nodes: Node[]
  links: Link[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}

/** Nodos y aristas que se dibujan, con las posiciones a cero. Puro: lo que se ve depende solo del snapshot. */
const construirGrafo = (snapshot: Snapshot): { nodes: Node[]; links: Link[] } => {
  const act = snapshot.activity
  const nodes: Node[] = [
    {
      id: snapshot.mainThreadId,
      // El rótulo del hilo principal se traduce al pintar (`nombreDe`), no aquí: este grafo se
      // memoriza por snapshot y no debe depender del idioma.
      name: 'main',
      kind: 'main',
      uses: snapshot.stats.mainThreadSkills,
      unused: false,
    },
    ...snapshot.catalog.agents.map((a) => ({
      id: a.id,
      name: a.name,
      kind: 'agent' as const,
      uses: act[a.id]?.uses ?? 0,
      unused: !act[a.id]?.uses,
    })),
    ...snapshot.catalog.skills.map((sk) => ({
      id: sk.id,
      name: sk.name,
      kind: 'skill' as const,
      uses: act[sk.id]?.uses ?? 0,
      unused: !act[sk.id]?.uses,
    })),
    // Un comando "usado" es uno que el daemon ha visto ejecutarse: su actividad cuenta como la
    // de una skill. Antes se marcaba siempre como sin usar, aunque lo ejecutaras a diario.
    ...snapshot.catalog.commands.map((c) => ({
      id: c.id,
      name: c.name,
      kind: 'command' as const,
      uses: act[c.id]?.uses ?? 0,
      unused: !act[c.id]?.uses,
    })),
  ]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const links: Link[] = []
  for (const e of snapshot.edges) {
    if (!KINDS_IN_GRAPH.has(e.kind)) continue
    const from = byId.get(e.from)
    const to = byId.get(e.to)
    if (!from || !to) continue
    links.push({ source: from, target: to, edge: e })
  }
  return { nodes, links }
}

/** Qué cambia el DISEÑO: las entidades y sus aristas, no cuántas veces se ha usado cada una. */
const claveDeGrafo = (snapshot: Snapshot): string => {
  const { nodes, links } = construirGrafo(snapshot)
  return `${nodes.map((n) => n.id).join('|')}#${links
    .map((l) => `${(l.source as Node).id}>${(l.target as Node).id}:${l.edge.layer}`)
    .join('|')}`
}

/**
 * El layout se calcula de una vez y se congela. Con ~90 nodos converge en milisegundos,
 * y así el resultado es determinista (el mismo grafo se ve siempre igual) y React no
 * re-renderiza en cada frame: el pan y el zoom son lo único interactivo.
 */
const disponer = (snapshot: Snapshot, W: number, H: number): Disposicion => {
  const { nodes, links } = construirGrafo(snapshot)
  // Semilla por columnas: comandos a la izquierda, agentes al centro, skills a la derecha.
  const columna = (kind: Node['kind']) =>
    kind === 'command' ? 0.12 : kind === 'skill' ? 0.85 : 0.5
  const porTipo = new Map<Node['kind'], Node[]>()
  for (const n of nodes) porTipo.set(n.kind, [...(porTipo.get(n.kind) ?? []), n])
  for (const [kind, lista] of porTipo) {
    lista.forEach((n, i) => {
      n.x = W * columna(kind)
      n.y = H * (0.08 + (0.84 * i) / Math.max(1, lista.length - 1))
    })
  }

  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink<Node, Link>(links)
        .id((d) => d.id)
        .distance((l) => (l.edge.layer === 'proven' ? 80 : 150))
        .strength((l) => (l.edge.layer === 'proven' ? 0.45 : 0.06)),
    )
    .force('charge', forceManyBody().strength(-260))
    .force('collide', forceCollide(22))
    .force('x', forceX<Node>((d) => W * columna(d.kind)).strength(0.5))
    .force('y', forceY<Node>((d) => d.y ?? H / 2).strength(0.12))
    .force('center', forceCenter(W / 2, H / 2).strength(0.05))
    .stop()

  for (let i = 0; i < 400; i++) sim.tick()

  // Encuadre: el texto crece hacia la derecha del nodo, así que el margen no es simétrico.
  const xs = nodes.map((n) => n.x ?? 0)
  const ys = nodes.map((n) => n.y ?? 0)
  return {
    nodes,
    links,
    bounds: {
      minX: Math.min(...xs) - 20,
      maxX: Math.max(...xs) + 170,
      minY: Math.min(...ys) - 24,
      maxY: Math.max(...ys) + 24,
    },
  }
}

/** Devuelve el mismo `valor` mientras `clave` no cambie: así un `useMemo` no se recalcula por ruido. */
const useEstable = <T,>(valor: T, clave: string): T => {
  const guardado = useRef({ clave, valor })
  if (guardado.current.clave !== clave) guardado.current = { clave, valor }
  return guardado.current.valor
}

const PlanoImpl = ({
  snapshot,
  selected,
  onSelect,
  editing = false,
  onDrawEdge,
  onAviso,
  ref,
}: {
  snapshot: Snapshot
  selected: string | null
  onSelect: (id: string | null) => void
  /** En modo edición, arrastrar de un agente a una skill propone escribir la relación. */
  editing?: boolean
  onDrawEdge?: (fromAgentId: string, toSkillId: string) => void
  /** Explicaciones breves cuando un gesto no puede hacer lo que parece (no es un error). */
  onAviso?: (texto: string) => void
  ref?: RefVista
}) => {
  const t = useT()
  const nombreDe = (n: Node): string => (n.kind === 'main' ? t('main.thread') : n.name)
  const [layers, setLayers] = useState<Record<EdgeLayer, boolean>>({
    declared: true,
    preloaded: true,
    proven: true,
  })
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const sizeRef = useRef({ w: 1000, h: 700 })

  // La cámara vive en una ref, no en estado: un pan genera cientos de eventos por segundo y cada
  // uno re-renderizaría ~100 nodos. Se escribe directo al <g>, que React no vuelve a tocar
  // porque su `transform` no forma parte del JSX.
  const vista = useRef({ x: 0, y: 0, k: 1 })
  const aplicarVista = useCallback(() => {
    const v = vista.current
    gRef.current?.setAttribute('transform', `translate(${v.x},${v.y}) scale(${v.k})`)
  }, [])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        sizeRef.current = { w: width, h: height }
        setSize((prev) => (prev ? prev : { w: width, h: height }))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // El diseño solo se rehace si cambia el grafo (otra entidad, otra arista). Un redimensionado
  // de la ventana o un contador de usos nuevo no deben recolocar nada bajo el ratón.
  const clave = useMemo(() => claveDeGrafo(snapshot), [snapshot])
  const snapshotDelGrafo = useEstable(snapshot, clave)
  const medido = size !== null
  const disposicion = useMemo(
    () => (medido ? disponer(snapshotDelGrafo, sizeRef.current.w, sizeRef.current.h) : null),
    [snapshotDelGrafo, medido],
  )

  // Los nodos que se pintan se derivan del snapshot ACTUAL (usos, nombres) y las posiciones del
  // diseño congelado.
  const { nodes, links } = useMemo(() => {
    const ahora = construirGrafo(snapshot)
    const pos = new Map((disposicion?.nodes ?? []).map((n) => [n.id, n] as const))
    for (const n of ahora.nodes) {
      const p = pos.get(n.id)
      n.x = p?.x
      n.y = p?.y
    }
    const byId = new Map(ahora.nodes.map((n) => [n.id, n] as const))
    const enlaces = ahora.links.map((l) => ({
      ...l,
      source: byId.get((l.source as Node).id) as Node,
      target: byId.get((l.target as Node).id) as Node,
    }))
    return { nodes: ahora.nodes, links: enlaces }
  }, [snapshot, disposicion])

  const encuadrar = useCallback(() => {
    const b = disposicion?.bounds
    const { w: W, h: H } = sizeRef.current
    if (!b) return
    const w = b.maxX - b.minX
    const h = b.maxY - b.minY
    if (w <= 0 || h <= 0) return
    const k = Math.min(W / w, H / h, 1.4)
    vista.current = {
      k,
      x: (W - w * k) / 2 - b.minX * k,
      y: (H - h * k) / 2 - b.minY * k,
    }
    aplicarVista()
  }, [disposicion, aplicarVista])

  // Se encuadra al calcularse el diseño (primera vez o cambio del conjunto de entidades), y a
  // partir de ahí manda el usuario: reencuadrar tras cada snapshot movía el grafo mientras lo leías.
  useEffect(() => {
    encuadrar()
  }, [encuadrar])

  /** Zoom por un factor, manteniendo fijo el punto del mundo que está bajo `(cx, cy)`. */
  const zoomEn = useCallback(
    (factor: number, cx: number, cy: number) => {
      const v = vista.current
      const k = Math.min(K_MAX, Math.max(K_MIN, v.k * factor))
      const f = k / v.k
      vista.current = { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
      aplicarVista()
    },
    [aplicarVista],
  )

  useImperativeHandle(
    ref,
    () => ({
      encuadrar,
      zoom: (d) => zoomEn(d > 0 ? 1.25 : 0.8, sizeRef.current.w / 2, sizeRef.current.h / 2),
      centrarEn: (id) => {
        const n = nodes.find((x) => x.id === id)
        if (!n || n.x === undefined || n.y === undefined) return false
        const { w: W, h: H } = sizeRef.current
        const k = Math.max(vista.current.k, 0.9)
        vista.current = { k, x: W / 2 - n.x * k - 40, y: H / 2 - n.y * k }
        aplicarVista()
        return true
      },
    }),
    [encuadrar, zoomEn, aplicarVista, nodes],
  )

  // La rueda va con un listener NATIVO no pasivo: el `onWheel` de React es pasivo, y desde ahí
  // `preventDefault` no surte efecto (la página hacía scroll/zoom a la vez que el grafo).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const alRodar = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1
      // El pellizco del trackpad llega como rueda con ctrl: deltas pequeños, hay que amplificarlos.
      const sens = e.ctrlKey ? 0.01 : 0.0018
      zoomEn(Math.exp(-e.deltaY * px * sens), e.clientX - rect.left, e.clientY - rect.top)
    }
    svg.addEventListener('wheel', alRodar, { passive: false })
    return () => svg.removeEventListener('wheel', alRodar)
  }, [zoomEn])

  const connected = useMemo(() => {
    if (!selected) return null
    const set = new Set<string>([selected])
    for (const l of links) {
      const s = (l.source as Node).id
      const t = (l.target as Node).id
      if (s === selected) set.add(t)
      if (t === selected) set.add(s)
    }
    return set
  }, [selected, links])

  // Gestos del puntero. El pan arranca en cualquier sitio, pero solo "captura" el puntero al
  // superar unos píxeles: capturar de entrada redirigiría el `click` al svg y los nodos dejarían
  // de poder seleccionarse.
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  )
  // Arrastre de arista: nace en un agente y solo puede terminar en una skill.
  const [linking, setLinking] = useState<Node | null>(null)
  const linkingRef = useRef<Node | null>(null)
  const lineaRef = useRef<SVGLineElement>(null)

  const empezarArista = (n: Node) => {
    linkingRef.current = n
    setLinking(n)
  }
  const terminarArista = () => {
    linkingRef.current = null
    setLinking(null)
  }

  const aCoordenadas = (e: { clientX: number; clientY: number }) => {
    const rect = boxRef.current?.getBoundingClientRect()
    const v = vista.current
    return {
      x: (e.clientX - (rect?.left ?? 0) - v.x) / v.k,
      y: (e.clientY - (rect?.top ?? 0) - v.y) / v.k,
    }
  }

  const seleccionarConTeclado = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(id)
    }
  }

  return (
    <div className="canvas" ref={boxRef}>
      <svg
        ref={svgRef}
        aria-label={t('plano.aria')}
        onPointerDown={(e) => {
          if (linkingRef.current) return
          const v = vista.current
          drag.current = { px: e.clientX, py: e.clientY, vx: v.x, vy: v.y, moved: false }
        }}
        onPointerMove={(e) => {
          const l = linkingRef.current
          if (l) {
            const p = aCoordenadas(e)
            lineaRef.current?.setAttribute('x2', String(p.x))
            lineaRef.current?.setAttribute('y2', String(p.y))
            return
          }
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.px
          const dy = e.clientY - d.py
          if (!d.moved && Math.hypot(dx, dy) < 4) return
          if (!d.moved) {
            d.moved = true
            e.currentTarget.setPointerCapture?.(e.pointerId)
          }
          vista.current = { ...vista.current, x: d.vx + dx, y: d.vy + dy }
          aplicarVista()
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          terminarArista()
          // Un toque sin arrastre sobre el fondo deselecciona. Se decide aquí y no en `onClick`:
          // el svg no es un control, y el clic sobre un nodo ya lo atiende el nodo.
          if (d && !d.moved && e.target === e.currentTarget) onSelect(null)
        }}
        onPointerLeave={() => {
          drag.current = null
          terminarArista()
        }}
      >
        <title>{t('plano.aria')}</title>
        <g ref={gRef}>
          {links.map((l) => {
            if (!layers[l.edge.layer]) return null
            const s = l.source as Node
            const t = l.target as Node
            if (s.x === undefined || t.x === undefined) return null
            const style = LAYER_STYLE[l.edge.layer]
            const dim = connected && !(connected.has(s.id) && connected.has(t.id))
            return (
              <line
                key={`${l.edge.layer}-${l.edge.kind}-${s.id}-${t.id}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                style={{
                  stroke: style.color,
                  strokeWidth:
                    l.edge.layer === 'proven' ? Math.min(4, 1 + (l.edge.uses ?? 1) / 8) : 1,
                  strokeDasharray: style.dash,
                  opacity: dim ? 0.08 : l.edge.layer === 'declared' ? 0.55 : 0.9,
                }}
              />
            )
          })}
          {linking && (
            <line
              ref={lineaRef}
              x1={linking.x}
              y1={linking.y}
              x2={linking.x}
              y2={linking.y}
              style={{ stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: '4 3' }}
            />
          )}
          {nodes.map((n) => {
            if (n.x === undefined || n.y === undefined) return null
            const dim = connected && !connected.has(n.id)
            const r = n.kind === 'main' ? 13 : n.kind === 'agent' ? 9 : 6
            const fill = n.kind === 'main' ? 'var(--accent)' : n.unused ? 'var(--bg)' : 'var(--ink)'
            const esOrigen = n.kind === 'agent'
            const sel = n.id === selected
            return (
              // biome-ignore lint/a11y/useSemanticElements: dentro de un <svg> no puede haber un <button>; un <g role="button"> con tabIndex y teclado es el patrón.
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                opacity={dim ? 0.18 : 1}
                role="button"
                tabIndex={0}
                aria-label={t('plano.node.aria', { kind: t(`kind.${n.kind}`), name: nombreDe(n) })}
                aria-pressed={sel}
                onClick={(e) => {
                  e.stopPropagation()
                  // Un arrastre que termina sobre un nodo no es una selección.
                  if (!drag.current?.moved) onSelect(n.id)
                }}
                onKeyDown={(e) => seleccionarConTeclado(e, n.id)}
                onPointerDown={(e) => {
                  if (!editing) return
                  e.stopPropagation()
                  if (n.kind === 'main') {
                    // Antes no hacía nada y sin decir por qué. El hilo principal no es un archivo:
                    // no tiene un prompt donde escribir "consulta esta skill".
                    onAviso?.(t('plano.main'))
                    return
                  }
                  if (esOrigen) empezarArista(n)
                }}
                onPointerUp={(e) => {
                  const origen = linkingRef.current
                  if (!origen) return
                  e.stopPropagation()
                  if (n.kind === 'skill') onDrawEdge?.(origen.id, n.id)
                  else if (n.id !== origen.id) onAviso?.(t('plano.drop'))
                  terminarArista()
                }}
                style={{
                  cursor: editing
                    ? n.kind === 'skill' || esOrigen
                      ? 'crosshair'
                      : 'not-allowed'
                    : 'pointer',
                }}
              >
                <title>
                  {nombreDe(n)} ·{' '}
                  {n.kind === 'main'
                    ? t('count.skillsUsed', { n: n.uses })
                    : t('count.uses', { n: n.uses })}
                </title>
                {n.kind === 'skill' ? (
                  <rect
                    x={-r}
                    y={-r}
                    width={r * 2}
                    height={r * 2}
                    style={shapeStyle(fill, 1, sel)}
                  />
                ) : n.kind === 'command' ? (
                  <rect
                    x={-r - 2}
                    y={-r + 1}
                    width={(r + 2) * 2}
                    height={r * 1.6}
                    rx={2}
                    style={shapeStyle(fill, 1, sel)}
                  />
                ) : (
                  <circle r={r} style={shapeStyle(fill, n.kind === 'main' ? 2 : 1, sel)} />
                )}
                <text
                  x={r + 5}
                  y={4}
                  style={{
                    fontSize: n.kind === 'main' ? 13 : 11,
                    fill: n.unused ? 'var(--muted)' : 'var(--ink)',
                    fontWeight: sel ? 700 : 400,
                    paintOrder: 'stroke',
                    stroke: 'var(--bg)',
                    strokeWidth: 3,
                  }}
                >
                  {nombreDe(n)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      {editing && (
        <p className="pista-edicion" role="status">
          {t('plano.editHint')}
        </p>
      )}
      <div className="leyenda-plano">
        <div className="legend">
          {(Object.keys(LAYER_STYLE) as EdgeLayer[]).map((layer) => (
            <button
              key={layer}
              type="button"
              data-on={layers[layer]}
              aria-pressed={layers[layer]}
              onClick={() => setLayers((l) => ({ ...l, [layer]: !l[layer] }))}
            >
              <span
                className="swatch"
                style={{
                  borderTopColor: LAYER_STYLE[layer].color,
                  borderTopStyle: layer === 'declared' ? 'dashed' : 'solid',
                }}
              />
              {conCodigo(t(LAYER_STYLE[layer].label))}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export const Plano = memo(PlanoImpl)
