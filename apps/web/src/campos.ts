import type { Agent, Command, Edge, Skill, Snapshot } from './types.ts'

/**
 * Lógica pura de edición: validar nombres, qué herramientas ofrecer, y qué lista de skills hay
 * que escribir en un agente cuando se asigna (o se retira) una skill desde cualquiera de los dos
 * lados. Sin React ni red: se prueba en Node.
 *
 * Los campos del archivo (`body`, `bodyStartLine`) llegan en el snapshot de un daemon reciente; se
 * leen de forma defensiva, como el resto de campos opcionales (ver `derivados.ts`).
 */

type ConArchivo = { body?: string; bodyStartLine?: number }

/** El cuerpo tal como está en el archivo, o `undefined` si el daemon no lo manda. */
export const cuerpoDe = (e: Agent | Skill | Command): string | undefined => (e as ConArchivo).body

/** Línea del archivo en la que empieza el cuerpo (1 = sin frontmatter), si el daemon la informa. */
export const lineaDeInicio = (e: Agent | Skill | Command): number | undefined =>
  (e as ConArchivo).bodyStartLine

// --- Nombres ------------------------------------------------------------------------------------

/** Lo que Claude Code admite como nombre de archivo de un agente, una skill o un comando. */
export const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9-]{0,63}$/

export type ErrorNombre = 'empty' | 'format' | 'exists'

/** `null` si el nombre sirve. `existentes` es lo que ya hay de ESE tipo (incluidos archivados). */
export const validarNombre = (nombre: string, existentes: Iterable<string>): ErrorNombre | null => {
  if (nombre === '') return 'empty'
  if (!NOMBRE_VALIDO.test(nombre)) return 'format'
  for (const e of existentes) if (e === nombre) return 'exists'
  return null
}

// --- Herramientas -------------------------------------------------------------------------------

/** Las herramientas de Claude Code que más se ponen en `tools:`; las MCP u otras ya escritas se suman. */
export const HERRAMIENTAS_HABITUALES = [
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Glob',
  'Grep',
  'Bash',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
  'TodoWrite',
  'Task',
  'Agent',
] as const

/** Las habituales más lo que el agente ya tenga y no esté en la lista (un `mcp__…`, por ejemplo). */
export const opcionesDeHerramientas = (actual: string[] | null): string[] => {
  const extra = (actual ?? []).filter(
    (h) => !(HERRAMIENTAS_HABITUALES as readonly string[]).includes(h),
  )
  return [...HERRAMIENTAS_HABITUALES, ...extra]
}

/**
 * Las marcadas en un orden estable: primero las que ya estaban, en su orden, y luego las nuevas en
 * el orden en que se ofrecen. Así añadir una herramienta no reordena las demás en el archivo.
 */
export const ordenarMarcadas = (
  inicial: string[],
  marcadas: ReadonlySet<string>,
  orden: string[],
): string[] => [
  ...inicial.filter((n) => marcadas.has(n)),
  ...orden.filter((n) => marcadas.has(n) && !inicial.includes(n)),
]

// --- Skills que un prompt cita ------------------------------------------------------------------

const INICIO = '<!-- ai-office:skills:inicio -->'
const FIN = '<!-- ai-office:skills:fin -->'

/**
 * Las skills de la sección GESTIONADA del cuerpo (la que escribe `agent.skillMentions`). Lo que el
 * usuario citó a mano fuera de ella no se puede retirar desde aquí: la mutación solo reescribe esa
 * sección. Devuelve `[]` si no hay sección.
 */
export const mencionesGestionadas = (body: string): string[] => {
  const i = body.indexOf(INICIO)
  if (i === -1) return []
  const desde = i + INICIO.length
  const j = body.indexOf(FIN, desde)
  if (j === -1) return []
  const nombres: string[] = []
  for (const linea of body.slice(desde, j).split('\n')) {
    const m = /^\s*-\s+\*\*([^*]+)\*\*/.exec(linea)
    if (m?.[1]) nombres.push(m[1])
  }
  return nombres
}

const nombreDeSkill = (id: string): string => id.split('/').pop() ?? id

/** Skills que el prompt de `agentId` cita en su prosa (capa declarada), por nombre. */
export const citadasPor = (edges: Edge[], agentId: string): string[] =>
  edges
    .filter((e) => e.from === agentId && e.kind === 'agent-uses-skill' && e.layer === 'declared')
    .map((e) => nombreDeSkill(e.to))

export interface CitasDeAgente {
  id: string
  name: string
  /** Lo que hay escrito en la sección gestionada: es lo único que se puede reescribir. */
  gestionadas: string[]
  /** Todo lo que el prompt cita (gestionado o a mano). */
  declaradas: string[]
}

/**
 * Las citas de un agente. Con `body` se separan las gestionadas de las escritas a mano; sin él
 * (un daemon antiguo) se trata todo lo declarado como gestionado, que es lo que hacía el arrastre
 * del Plano.
 */
export const citasDeAgente = (a: Agent, edges: Edge[]): CitasDeAgente => {
  const declaradas = citadasPor(edges, a.id)
  const body = cuerpoDe(a)
  return {
    id: a.id,
    name: a.name,
    gestionadas: body === undefined ? declaradas : mencionesGestionadas(body),
    declaradas,
  }
}

/** ¿Cita esa skill solo en prosa escrita a mano, donde esta interfaz no puede retirarla? */
export const soloEnProsa = (c: CitasDeAgente, skill: string): boolean =>
  c.declaradas.includes(skill) && !c.gestionadas.includes(skill)

/**
 * La lista COMPLETA que hay que escribir en la sección gestionada de un agente tras marcar o
 * desmarcar skills. Conserva el orden de lo que ya había y añade lo nuevo en el orden de
 * `orden`. Lo citado solo en prosa no se mueve: ni se duplica en la sección ni se quita.
 */
export const reconciliarCitas = (
  c: CitasDeAgente,
  marcadas: ReadonlySet<string>,
  orden: string[],
): string[] => {
  const quedan = c.gestionadas.filter((n) => marcadas.has(n))
  const nuevas = orden.filter(
    (n) => marcadas.has(n) && !c.gestionadas.includes(n) && !soloEnProsa(c, n),
  )
  return [...quedan, ...nuevas]
}

export interface CambioDeCitas {
  agentId: string
  agentName: string
  value: string[]
}

/**
 * Desde una skill: qué agentes hay que tocar para que la citen exactamente `marcados` (ids), y con
 * qué lista completa. Solo salen los agentes que cambian; para cada uno la lista resultante es la
 * gestionada de hoy con esta skill añadida o quitada, sin tocar lo demás.
 */
export const cambiosDeAsignacion = (
  skill: string,
  marcados: ReadonlySet<string>,
  agentes: CitasDeAgente[],
): CambioDeCitas[] => {
  const cambios: CambioDeCitas[] = []
  for (const a of agentes) {
    const quiere = marcados.has(a.id)
    const gestionada = a.gestionadas.includes(skill)
    if (quiere && !gestionada && !a.declaradas.includes(skill)) {
      cambios.push({ agentId: a.id, agentName: a.name, value: [...a.gestionadas, skill] })
    } else if (!quiere && gestionada) {
      cambios.push({
        agentId: a.id,
        agentName: a.name,
        value: a.gestionadas.filter((n) => n !== skill),
      })
    }
  }
  return cambios
}

// --- Quién usa una skill ------------------------------------------------------------------------

/** El tipo de relación entre una skill y quien la usa, en el orden en que se enseñan. */
export type CapaUso = 'proven' | 'preloaded' | 'declared' | 'command'

export interface UsoDeSkill {
  capa: CapaUso
  /** Quién: un agente, el hilo principal o un comando. */
  from: string
  edge: Edge
}

/** Todas las aristas que llegan a una skill y dicen quién la usa, agrupables por `capa`. */
export const quienUsa = (s: Snapshot, skillId: string): UsoDeSkill[] => {
  const orden: CapaUso[] = ['proven', 'preloaded', 'declared', 'command']
  const usos: UsoDeSkill[] = []
  for (const e of s.edges) {
    if (e.to !== skillId) continue
    if (e.kind === 'agent-uses-skill') usos.push({ capa: e.layer, from: e.from, edge: e })
    else if (e.kind === 'command-invokes-skill')
      usos.push({ capa: 'command', from: e.from, edge: e })
  }
  return usos.sort(
    (a, b) =>
      orden.indexOf(a.capa) - orden.indexOf(b.capa) || (b.edge.uses ?? 0) - (a.edge.uses ?? 0),
  )
}

/** La entidad cuyo archivo es `path` (real o visible): a dónde lleva una evidencia `archivo:línea`. */
export const entidadDeRuta = (s: Snapshot, path: string): Agent | Skill | Command | undefined => {
  const todas = [...s.catalog.agents, ...s.catalog.skills, ...s.catalog.commands]
  return todas.find((e) => e.source.realPath === path || e.source.path === path)
}
