import { estaArchivado } from './derivados.ts'
import { normalizar } from './texto.ts'
import type { Activity, Grade, Snapshot } from './types.ts'

/**
 * Lógica pura del Registro (Ledger): una fila por agente, skill y comando, con filtros y orden.
 * Sin React: se prueba en Node. Toda cifra sale del snapshot (`activity`, `edges`, `catalog`).
 */

export type TipoFila = 'agent' | 'skill' | 'command'
export type FiltroTipo = 'all' | TipoFila

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
    })
  }
  return filas
}

// --- Filtros y orden ---------------------------------------------------------------------------

export interface FiltroLedger {
  tipo: FiltroTipo
  soloSinUsar: boolean
  busqueda: string
}

export const filtrarFilas = (filas: FilaLedger[], f: FiltroLedger): FilaLedger[] => {
  const q = normalizar(f.busqueda.trim())
  return filas.filter(
    (r) =>
      (f.tipo === 'all' || r.kind === f.tipo) &&
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

export type Direccion = 'asc' | 'desc'

const RANGO_GRADO: Record<Grade, number> = { unused: 0, tried: 1, practicing: 2, certified: 3 }
const RANGO_TIPO: Record<TipoFila, number> = { agent: 0, skill: 1, command: 2 }

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
  clave === 'name' || clave === 'kind' ? 'asc' : 'desc'

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
