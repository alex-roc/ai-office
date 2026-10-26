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
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import type { Edge, EdgeLayer, Snapshot } from './types.ts'

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

const LAYER_STYLE: Record<EdgeLayer, { color: string; dash: string; label: string }> = {
  declared: { color: 'var(--declared)', dash: '3 3', label: 'declarada en la prosa' },
  preloaded: { color: 'var(--accent)', dash: '1 0', label: 'precargada en `skills:`' },
  proven: { color: 'var(--proven)', dash: '1 0', label: 'demostrada en el historial' },
}

const KINDS_IN_GRAPH = new Set(['agent-uses-skill', 'command-invokes-agent'])

/**
 * Los colores van siempre como propiedad CSS, nunca como atributo de presentación: un
 * atributo SVG (`fill="var(--x)"`) no resuelve variables y el elemento se dibuja invisible.
 */
const shapeStyle = (fill: string, strokeWidth = 1): CSSProperties => ({
  fill,
  stroke: 'var(--ink)',
  strokeWidth,
})

export const Plano = ({
  snapshot,
  selected,
  onSelect,
  editing = false,
  onDrawEdge,
}: {
  snapshot: Snapshot
  selected: string | null
  onSelect: (id: string | null) => void
  /** En modo edición, arrastrar de un agente a una skill propone escribir la relación. */
  editing?: boolean
  onDrawEdge?: (fromAgentId: string, toSkillId: string) => void
}) => {
  const [layers, setLayers] = useState<Record<EdgeLayer, boolean>>({
    declared: true,
    preloaded: true,
    proven: true,
  })
  const [size, setSize] = useState({ w: 1000, h: 700 })
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /**
   * El layout se calcula de una vez y se congela. Con ~90 nodos converge en milisegundos,
   * y así el resultado es determinista (el mismo grafo se ve siempre igual) y React no
   * re-renderiza en cada frame: el pan y el zoom son lo único interactivo.
   */
  const { nodes, links, bounds } = useMemo(() => {
    const act = snapshot.activity
    const W = size.w || 1000
    const H = size.h || 700
    const place = (kind: Node['kind'], i: number, total: number) => ({
      // Semilla por columnas: comandos a la izquierda, agentes al centro, skills a la derecha.
      x: kind === 'command' ? W * 0.12 : kind === 'skill' ? W * 0.85 : W * 0.5,
      y: H * (0.08 + (0.84 * i) / Math.max(1, total - 1)),
    })

    const agents = snapshot.catalog.agents
    const skills = snapshot.catalog.skills
    const commands = snapshot.catalog.commands

    const nodeList: Node[] = [
      {
        id: snapshot.mainThreadId,
        name: 'hilo principal',
        kind: 'main',
        uses: snapshot.stats.mainThreadSkills,
        unused: false,
        ...place('main', 0, 1),
      },
      ...agents.map((a, i) => ({
        id: a.id,
        name: a.name,
        kind: 'agent' as const,
        uses: act[a.id]?.uses ?? 0,
        unused: !act[a.id]?.uses,
        ...place('agent', i, agents.length),
      })),
      ...skills.map((sk, i) => ({
        id: sk.id,
        name: sk.name,
        kind: 'skill' as const,
        uses: act[sk.id]?.uses ?? 0,
        unused: !act[sk.id]?.uses,
        ...place('skill', i, skills.length),
      })),
      ...commands.map((c, i) => ({
        id: c.id,
        name: c.name,
        kind: 'command' as const,
        uses: 0,
        unused: true,
        ...place('command', i, commands.length),
      })),
    ]

    const byId = new Map(nodeList.map((n) => [n.id, n]))
    const linkList: Link[] = []
    for (const e of snapshot.edges) {
      if (!KINDS_IN_GRAPH.has(e.kind)) continue
      const from = byId.get(e.from)
      const to = byId.get(e.to)
      if (!from || !to) continue
      linkList.push({ source: from, target: to, edge: e })
    }

    const sim = forceSimulation(nodeList)
      .force(
        'link',
        forceLink<Node, Link>(linkList)
          .id((d) => d.id)
          .distance((l) => (l.edge.layer === 'proven' ? 80 : 150))
          .strength((l) => (l.edge.layer === 'proven' ? 0.45 : 0.06)),
      )
      .force('charge', forceManyBody().strength(-260))
      .force('collide', forceCollide(22))
      .force(
        'x',
        forceX<Node>((d) =>
          d.kind === 'command' ? W * 0.12 : d.kind === 'skill' ? W * 0.85 : W * 0.5,
        ).strength(0.5),
      )
      .force('y', forceY<Node>((d) => d.y ?? H / 2).strength(0.12))
      .force('center', forceCenter(W / 2, H / 2).strength(0.05))
      .stop()

    for (let i = 0; i < 400; i++) sim.tick()

    // Encuadre: el texto crece hacia la derecha del nodo, así que el margen no es simétrico.
    const xs = nodeList.map((n) => n.x ?? 0)
    const ys = nodeList.map((n) => n.y ?? 0)
    const bounds = {
      minX: Math.min(...xs) - 20,
      maxX: Math.max(...xs) + 170,
      minY: Math.min(...ys) - 24,
      maxY: Math.max(...ys) + 24,
    }
    return { nodes: nodeList, links: linkList, bounds }
  }, [snapshot, size.w, size.h])

  // Se encuadra una vez por layout; a partir de ahí manda el usuario.
  const fitKey = `${size.w}x${size.h}x${snapshot.stats.builtAt ?? 0}`
  const fitted = useRef<string>('')
  useEffect(() => {
    if (fitted.current === fitKey || !size.w || !size.h) return
    fitted.current = fitKey
    const w = bounds.maxX - bounds.minX
    const h = bounds.maxY - bounds.minY
    if (w <= 0 || h <= 0) return
    const k = Math.min(size.w / w, size.h / h, 1.4)
    setView({
      k,
      x: (size.w - w * k) / 2 - bounds.minX * k,
      y: (size.h - h * k) / 2 - bounds.minY * k,
    })
  }, [fitKey, bounds, size.w, size.h])

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

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const k = Math.min(3, Math.max(0.35, view.k * (e.deltaY > 0 ? 0.92 : 1.08)))
    setView((v) => ({ ...v, k }))
  }

  const drag = useRef<{ x: number; y: number } | null>(null)
  // Arrastre de arista: nace en un agente y solo puede terminar en una skill.
  const [linking, setLinking] = useState<{ from: Node; x: number; y: number } | null>(null)

  const toRoomCoords = (e: { clientX: number; clientY: number }) => {
    const rect = boxRef.current?.getBoundingClientRect()
    return {
      x: (e.clientX - (rect?.left ?? 0) - view.x) / view.k,
      y: (e.clientY - (rect?.top ?? 0) - view.y) / view.k,
    }
  }

  return (
    <div className="canvas" ref={boxRef}>
      <svg
        onWheel={onWheel}
        onPointerDown={(e) => {
          if (linking) return
          drag.current = { x: e.clientX - view.x, y: e.clientY - view.y }
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (linking) {
            const p = toRoomCoords(e)
            setLinking({ ...linking, x: p.x, y: p.y })
            return
          }
          if (!drag.current) return
          setView((v) => ({ ...v, x: e.clientX - drag.current!.x, y: e.clientY - drag.current!.y }))
        }}
        onPointerUp={() => {
          drag.current = null
          setLinking(null)
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null)
        }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {links.map((l, i) => {
            if (!layers[l.edge.layer]) return null
            const s = l.source as Node
            const t = l.target as Node
            if (s.x === undefined || t.x === undefined) return null
            const style = LAYER_STYLE[l.edge.layer]
            const dim = connected && !(connected.has(s.id) && connected.has(t.id))
            return (
              <line
                key={`${l.edge.layer}-${s.id}-${t.id}-${i}`}
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
              x1={linking.from.x}
              y1={linking.from.y}
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
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                opacity={dim ? 0.18 : 1}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(n.id)
                }}
                onPointerDown={(e) => {
                  if (!editing || (n.kind !== 'agent' && n.kind !== 'main')) return
                  e.stopPropagation()
                  setLinking({ from: n, x: n.x ?? 0, y: n.y ?? 0 })
                }}
                onPointerUp={(e) => {
                  if (!linking || n.kind !== 'skill') return
                  e.stopPropagation()
                  onDrawEdge?.(linking.from.id, n.id)
                  setLinking(null)
                }}
                style={{
                  cursor:
                    editing && (n.kind === 'agent' || n.kind === 'skill') ? 'crosshair' : 'pointer',
                }}
              >
                {n.kind === 'skill' ? (
                  <rect x={-r} y={-r} width={r * 2} height={r * 2} style={shapeStyle(fill)} />
                ) : n.kind === 'command' ? (
                  <rect
                    x={-r - 2}
                    y={-r + 1}
                    width={(r + 2) * 2}
                    height={r * 1.6}
                    rx={2}
                    style={shapeStyle(fill)}
                  />
                ) : (
                  <circle r={r} style={shapeStyle(fill, n.kind === 'main' ? 2 : 1)} />
                )}
                <text
                  x={r + 5}
                  y={4}
                  style={{
                    fontSize: n.kind === 'main' ? 13 : 11,
                    fill: n.unused ? 'var(--muted)' : 'var(--ink)',
                    fontWeight: n.id === selected ? 700 : 400,
                    paintOrder: 'stroke',
                    stroke: 'var(--bg)',
                    strokeWidth: 3,
                  }}
                >
                  {n.name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      <div style={{ position: 'absolute', left: 12, bottom: 10 }}>
        <div className="legend">
          {(Object.keys(LAYER_STYLE) as EdgeLayer[]).map((layer) => (
            <button
              key={layer}
              type="button"
              data-on={layers[layer]}
              onClick={() => setLayers((l) => ({ ...l, [layer]: !l[layer] }))}
            >
              <span
                className="swatch"
                style={{
                  borderTopColor: LAYER_STYLE[layer].color,
                  borderTopStyle: layer === 'declared' ? 'dashed' : 'solid',
                }}
              />
              {LAYER_STYLE[layer].label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
