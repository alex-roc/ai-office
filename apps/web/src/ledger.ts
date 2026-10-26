import {
  ambitoDe,
  estaTapada,
  type GrupoAmbito,
  grupoDeAmbito,
  nombreDePlugin,
  pluginsDe,
  servidoresMcpDe,
} from './alcance.ts'
import { estaArchivado } from './derivados.ts'
import { normalizar } from './texto.ts'
import type { Activity, EntityScope, Grade, Snapshot } from './types.ts'

/**
 * Lógica pura del Registro (Ledger): una fila por agente, skill, comando, plugin y servidor MCP,
 * con filtros y orden. Sin React: se prueba en Node. Toda cifra sale del snapshot (`activity`,
 * `edges`, `catalog`). El Registro enseña SIEMPRE todo: lo que apaga "Show" solo afecta a la Sala
 * y al Plano.
 */

export type TipoFila = 'agent' | 'skill' | 'command' | 'plugin' | 'mcp'
export type FiltroTipo = 'all' | TipoFila
export type FiltroAmbito = 'all' | GrupoAmbito

export interface FilaLedger {
  id: string
  kind: TipoFila
  name: string
  grade: Grade
  uses: number
  sessions: number
  projects: number
  lastUsedAt: number | null
  /** Doce semanas, la última es la actual; `null` si el daemon no las informa. */
  weekly: number[] | null
  /** Solo skills: tokens de su description, que se cargan en cada sesión. */
  descTokens: number | null
  /** Solo skills: jubilada (su description ya no se carga). */
  retired: boolean
  /** Solo agentes: skills que su prompt cita (declaradas + precargadas). */
  cited: number | null
  /** Solo agentes: skills que ha invocado de verdad. */
  proven: number | null
  /** Solo comandos: nombres de los agentes que llama. */
  calls: string[] | null
  /** De dónde sale: usuario, proyecto, plugin… */
  scope: EntityScope
  /** Nombre del plugin dueño (de la fila misma, si es un plugin, o de la entidad que trae). */
  origen: string | null
  /**
   * ¿Se carga? Un plugin o un servidor lo dicen ellos mismos (`null` = se decide por proyecto y el
   * ámbito de usuario no lo sabe); una entidad, si no está tapada ni es de un plugin apagado.
   */
  enabled: boolean | null
  /** Quién la tapa, si está tapada. */
  shadowedBy: string | null
  /** Solo servidores MCP: sus herramientas más usadas, de más a menos. */
  tools: [string, number][] | null
}

/** `weekly` y `byProject` llegan en un daemon reciente: se leen de forma defensiva. */
export const semanal = (a: Activity | undefined): number[] | null => {
  const w = (a as (Activity & { weekly?: number[] }) | undefined)?.weekly
  return Array.isArray(w) && w.length > 0 ? w : null
}

/** Usos por proyecto, de mayor a menor. Vacío si no hay datos. */
export const porProyecto = (a: Activity | undefined): [string, number][] => {
  const m = (a as (Activity & { byProject?: Record<string, number> }) | undefined)?.byProject
  return m ? Object.entries(m).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])) : []
}

/**
 * Las herramientas de un servidor MCP, de más a menos usadas (`byTool` de su actividad). Vacío si no
 * hay datos. `limite` recorta a las N primeras; sin él salen todas.
 */
export const herramientasTop = (a: Activity | undefined, limite?: number): [string, number][] => {
  const m = a?.byTool
  if (!m) return []
  const orden = Object.entries(m)
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
  return limite === undefined ? orden : orden.slice(0, limite)
}

const nombreDe = (id: string): string => id.split('/').pop() ?? id

export const filasLedger = (s: Snapshot): FilaLedger[] => {
  const base = (id: string, kind: TipoFila, name: string) => {
    const a = s.activity[id]
    return {
      id,
      kind,
      name,
      grade: a?.grade ?? ('unused' as Grade),
      uses: a?.uses ?? 0,
      sessions: a?.sessions ?? 0,
      projects: a?.projects ?? 0,
      lastUsedAt: a?.lastUsedAt ?? null,
      weekly: semanal(a),
    }
  }
  const plugins = pluginsDe(s)
  const apagado = new Set(plugins.filter((p) => !p.enabled).map((p) => p.key))
  /** Origen y estado de carga de una entidad de catálogo (agente, skill o comando). */
  const origen = (e: {
    scope?: EntityScope
    plugin?: string
    status: string
    shadowedBy?: string
  }) => ({
    scope: ambitoDe(e),
    origen: e.plugin ? nombreDePlugin(e.plugin) : null,
    enabled: !estaTapada(e) && !(e.plugin && apagado.has(e.plugin)),
    shadowedBy: e.shadowedBy ?? null,
    tools: null,
  })
  const filas: FilaLedger[] = []
  for (const a of s.catalog.agents) {
    if (estaArchivado(a)) continue
    const propias = s.edges.filter((e) => e.from === a.id && e.kind === 'agent-uses-skill')
    const unicas = (capas: string[]) =>
      new Set(propias.filter((e) => capas.includes(e.layer)).map((e) => e.to)).size
    filas.push({
      ...base(a.id, 'agent', a.name),
      descTokens: null,
      retired: false,
      cited: unicas(['declared', 'preloaded']),
      proven: unicas(['proven']),
      calls: null,
      ...origen(a),
    })
  }
  for (const k of s.catalog.skills) {
    filas.push({
      ...base(k.id, 'skill', k.name),
      descTokens: k.descriptionTokens,
      retired: k.disabledForModel,
      cited: null,
      proven: null,
      calls: null,
      ...origen(k),
    })
  }
  for (const c of s.catalog.commands) {
    const llama = new Set(
      s.edges.filter((e) => e.from === c.id && e.kind === 'command-invokes-agent').map((e) => e.to),
    )
    filas.push({
      ...base(c.id, 'command', c.name),
      descTokens: null,
      retired: false,
      cited: null,
      proven: null,
      calls: [...llama].map(nombreDe).sort(),
      ...origen(c),
    })
  }
  for (const p of plugins) {
    filas.push({
      ...base(p.id, 'plugin', p.key),
      // El coste de un plugin es el de las descriptions de sus skills, que se cargan en cada sesión.
      descTokens: p.descriptionTokens,
      retired: false,
      cited: null,
      proven: null,
      calls: null,
      scope: 'plugin',
      origen: p.name,
      enabled: p.enabled,
      shadowedBy: null,
      tools: null,
    })
  }
  for (const m of servidoresMcpDe(s)) {
    const herramientas = herramientasTop(s.activity[m.id])
    filas.push({
      ...base(m.id, 'mcp', m.name),
      descTokens: null,
      retired: false,
      cited: null,
      proven: null,
      calls: null,
      scope: m.scope,
      origen: m.plugin ? nombreDePlugin(m.plugin) : null,
      enabled: m.enabled,
      shadowedBy: m.shadowedBy ?? null,
      tools: herramientas.length > 0 ? herramientas : null,
    })
  }
  return filas
}

// --- Filtros y orden ---------------------------------------------------------------------------

export interface FiltroLedger {
  tipo: FiltroTipo
  /** Sin él, todos los ámbitos. `managed` (de ningún cubo) solo sale con "todos". */
  ambito?: FiltroAmbito
  soloSinUsar: boolean
  busqueda: string
}

export const filtrarFilas = (filas: FilaLedger[], f: FiltroLedger): FilaLedger[] => {
  const q = normalizar(f.busqueda.trim())
  const ambito = f.ambito ?? 'all'
  return filas.filter(
    (r) =>
      (f.tipo === 'all' || r.kind === f.tipo) &&
      (ambito === 'all' || grupoDeAmbito(r.scope) === ambito) &&
      (!f.soloSinUsar || r.uses === 0) &&
      (q === '' || normalizar(r.name).includes(q)),
  )
}

export type ClaveOrden =
  | 'name'
  | 'kind'
  | 'grade'
  | 'uses'
  | 'sessions'
  | 'projects'
  | 'last'
  | 'trend'
  | 'cost'
  | 'cites'
  | 'calls'
  | 'scope'
  | 'enabled'

export type Direccion = 'asc' | 'desc'

const RANGO_GRADO: Record<Grade, number> = { unused: 0, tried: 1, practicing: 2, certified: 3 }
const RANGO_TIPO: Record<TipoFila, number> = { agent: 0, skill: 1, command: 2, plugin: 3, mcp: 4 }

/** Lo que se compara en cada columna. `null` = la fila no tiene ese dato: siempre va al final. */
const valorDe = (r: FilaLedger, clave: ClaveOrden): number | string | null => {
  switch (clave) {
    case 'name':
      return r.name.toLowerCase()
    case 'kind':
      return RANGO_TIPO[r.kind]
    case 'grade':
      return RANGO_GRADO[r.grade]
    case 'uses':
      return r.uses
    case 'sessions':
      return r.sessions
    case 'projects':
      return r.projects
    case 'last':
      return r.lastUsedAt
    case 'trend':
      return r.weekly ? r.weekly.reduce((a, b) => a + b, 0) : null
    case 'cost':
      return r.descTokens
    case 'cites':
      return r.cited
    case 'calls':
      return r.calls ? r.calls.length : null
    case 'scope':
      return `${r.scope}:${r.origen ?? ''}`
    case 'enabled':
      return r.enabled === null ? null : r.enabled ? 1 : 0
  }
}

/** Orden estable: ante un empate manda el nombre, así la tabla no se baraja al refrescar. */
export const ordenarFilas = (
  filas: FilaLedger[],
  clave: ClaveOrden,
  dir: Direccion,
): FilaLedger[] => {
  const signo = dir === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    const va = valorDe(a, clave)
    const vb = valorDe(b, clave)
    if (va === null && vb !== null) return 1
    if (vb === null && va !== null) return -1
    if (va !== null && vb !== null && va !== vb) {
      const c =
        typeof va === 'string' || typeof vb === 'string'
          ? String(va).localeCompare(String(vb))
          : va < vb
            ? -1
            : 1
      return c * signo
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  })
}

/** El orden que se espera al pulsar una columna por primera vez: texto de A a Z, cifras de más a menos. */
export const direccionInicial = (clave: ClaveOrden): Direccion =>
  clave === 'name' || clave === 'kind' || clave === 'scope' ? 'asc' : 'desc'

// --- Sparkline ---------------------------------------------------------------------------------

export interface TrazoSpark {
  /** Atributo `d` de la línea. Vacío si no hay valores. */
  linea: string
  /** El último punto (la semana en curso), para marcarlo. */
  ultimo: { x: number; y: number } | null
}

const redondear = (n: number): number => Math.round(n * 100) / 100

/**
 * El trazo de una sparkline en un lienzo de `ancho` x `alto` con `margen` alrededor. Los valores se
 * reparten a intervalos iguales de izquierda a derecha y la escala es de 0 al máximo: si todo vale
 * cero, es una línea plana en la base, no una escala inventada. Un solo valor es un punto centrado.
 */
export const trazoSpark = (
  valores: number[],
  ancho: number,
  alto: number,
  margen = 2,
): TrazoSpark => {
  if (valores.length === 0) return { linea: '', ultimo: null }
  const max = Math.max(...valores, 0)
  const util = { w: ancho - 2 * margen, h: alto - 2 * margen }
  const puntos = valores.map((v, i) => ({
    x: redondear(valores.length === 1 ? ancho / 2 : margen + (util.w * i) / (valores.length - 1)),
    y: redondear(max === 0 ? alto - margen : margen + util.h * (1 - v / max)),
  }))
  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  return { linea, ultimo: puntos[puntos.length - 1] ?? null }
}
