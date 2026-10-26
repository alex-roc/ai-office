import type { Agent, Catalog, Command, Skill } from '../model/entity.ts'
import type { Edge } from './types.ts'

/**
 * Reparte el catálogo en SALAS: los despachos de la planta.
 *
 * El criterio no es una lista de temas escrita a mano ("jurídico", "datos"). Un tema inventado
 * no puede citar su fuente, y esa es la regla que sostiene todo el producto. Aquí una sala sale
 * de dos hechos que ya están escritos en los archivos del usuario:
 *
 * 1. **Qué skills cita cada agente** en el cuerpo de su prompt.
 * 2. **Qué comandos lo convocan**: los 27 slash commands son repartos escritos a mano, o sea el
 *    organigrama que el propio usuario ya dibujó sin darse cuenta.
 *
 * Los dos rasgos se descuentan por IDF antes de comparar. Sin ese descuento no funciona: en una
 * instalación real media plantilla cita las mismas cuatro skills de contexto (`team-context`,
 * `style-guide`…) y un comando de revisión convoca a ocho, así que la similitud sin pesar mete a nueve
 * agentes en un único despacho gigante y la planta deja de existir. Lo que identifica a alguien
 * es lo que comparte con POCOS, no lo que comparte con todos.
 *
 * La sala se nombra con su rasgo más característico —una skill o un comando de verdad— y guarda
 * el motivo, para que la puerta pueda decir por qué están ahí dentro y no en otra parte.
 */

/** Umbral de fusión del aglomerativo. Calibrado sobre una instalación real de 19 agentes: por
 * debajo se funde todo en un bloque y por encima salen diecinueve despachos de una persona. */
const UMBRAL = 0.2

/** Una skill citada por más de esta fracción de la plantilla es contexto común, no identidad:
 * no se guarda en ningún despacho sino en el archivo central del pasillo. */
const FRACCION_COMUN = 0.34

export type TipoSala = 'skill' | 'command' | 'suelto'

export interface SalaRazon {
  tipo: 'skill' | 'command' | 'loose'
  nombre: string
  cuantos: number
  total: number
}

export interface Sala {
  id: string
  /** El rasgo que une a sus ocupantes: el nombre de una skill o de un comando reales. */
  nombre: string
  tipo: TipoSala
  /** Frase citable para la placa de la puerta, en inglés. Es el respaldo: la interfaz la redacta
   * en su idioma a partir de `razon`, que trae los mismos hechos en forma de datos. */
  motivo: string
  /** Por qué están ahí, como datos: `cuantos` de los `total` agentes comparten `nombre` (una skill
   * o un comando) o, en una sala suelta, no comparten nada (`nombre` vacío). */
  razon: SalaRazon
  agents: string[]
  skills: string[]
  commands: string[]
}

export interface Planta {
  salas: Sala[]
  /**
   * Skills que cita media planta: contexto común, de nadie en concreto. Van al archivo del
   * pasillo porque meterlas en un despacho sería mentir sobre quién las usa.
   */
  archivoComun: string[]
  /**
   * Skills que NO cita ningún agente. Es lo contrario del archivo común y por eso va aparte:
   * juntar "la usa todo el mundo" con "no la reclama nadie" en el mismo montón borraría de un
   * plumazo la distinción que sostiene el producto.
   */
  deposito: string[]
  /** Comandos cuyo reparto se extiende por varias salas: un comando de revisión convoca a ocho de tres
   * despachos distintos, así que no es de ninguno. */
  tablonComun: string[]
  /** Comandos que no nombran a ningún agente: nadie a quien convocar. */
  tablonHuerfano: string[]
}

/** Rasgos de un agente, ya prefijados para que una skill y un comando nunca colisionen. */
const rasgosDe = (catalog: Catalog, edges: Edge[]): Map<string, Set<string>> => {
  const out = new Map<string, Set<string>>()
  for (const a of catalog.agents) out.set(a.id, new Set())
  for (const e of edges) {
    if (e.kind === 'agent-uses-skill') out.get(e.from)?.add(`skill:${e.to}`)
    if (e.kind === 'command-invokes-agent') out.get(e.to)?.add(`cmd:${e.from}`)
  }
  return out
}

/**
 * Coseno sobre los rasgos pesados por IDF². Se eleva al cuadrado porque el peso entra una vez
 * por cada lado del producto escalar; es el tf-idf de toda la vida aplicado a un conjunto.
 */
const similitud = (
  a: Set<string> | undefined,
  b: Set<string> | undefined,
  idf: (r: string) => number,
): number => {
  if (!a?.size || !b?.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += idf(x) ** 2
  let na = 0
  for (const x of a) na += idf(x) ** 2
  let nb = 0
  for (const x of b) nb += idf(x) ** 2
  return na && nb ? inter / Math.sqrt(na * nb) : 0
}

/** Aglomerativo por enlace medio: funde los dos grupos más parecidos hasta que ninguno pasa el
 * umbral. Con veinte agentes el coste cúbico es irrelevante y evita depender de una semilla. */
const aglomerar = (
  ids: string[],
  rasgos: Map<string, Set<string>>,
  idf: (r: string) => number,
): string[][] => {
  let grupos = ids.map((id) => [id])
  for (;;) {
    let mejor = { i: -1, j: -1, s: UMBRAL }
    for (let i = 0; i < grupos.length; i++) {
      for (let j = i + 1; j < grupos.length; j++) {
        const gi = grupos[i] as string[]
        const gj = grupos[j] as string[]
        let total = 0
        for (const x of gi)
          for (const y of gj) total += similitud(rasgos.get(x), rasgos.get(y), idf)
        const media = total / (gi.length * gj.length)
        if (media > mejor.s) mejor = { i, j, s: media }
      }
    }
    if (mejor.i < 0) return grupos
    const fundido = [...(grupos[mejor.i] as string[]), ...(grupos[mejor.j] as string[])]
    grupos = grupos.filter((_, k) => k !== mejor.i && k !== mejor.j)
    grupos.push(fundido)
  }
}

const nombreDe = (id: string): string => id.split('/').pop() ?? id

/** La frase de la placa (en inglés: es el respaldo de `razon`). Se redacta aparte porque en un
 * despacho de una sola persona la versión en plural ("1 of its 1 agents") queda ridícula y resta
 * credibilidad a todo lo demás. */
const motivoDe = (esComando: boolean, nombre: string, cuantos: number, total: number): string => {
  if (total === 1) {
    return esComando
      ? `Summoned by /${nombre}, and by no other command.`
      : `Cites \`${nombre}\` in its prompt, and shares it with no one.`
  }
  const sujeto = cuantos === total ? `All ${total}` : `${cuantos} of ${total}`
  return esComando
    ? `${sujeto} are summoned by /${nombre}.`
    : `${sujeto} cite \`${nombre}\` in their prompt.`
}

export const agruparEnSalas = (completo: Catalog, edges: Edge[]): Planta => {
  // Un agente archivado no trabaja en ningún despacho: la planta solo reparte a los activos.
  const catalog = { ...completo, agents: completo.agents.filter((a) => !a.archived) }
  const rasgos = rasgosDe(catalog, edges)
  const total = Math.max(1, catalog.agents.length)

  const df = new Map<string, number>()
  for (const rs of rasgos.values()) for (const r of rs) df.set(r, (df.get(r) ?? 0) + 1)
  const idf = (r: string): number => Math.log(total / (df.get(r) ?? 1))

  const grupos = aglomerar(
    catalog.agents.map((a) => a.id),
    rasgos,
    idf,
  )

  // --- Nombre y motivo de cada sala --------------------------------------------------------

  const salas: Sala[] = grupos.map((agentes, i) => {
    const cuenta = new Map<string, number>()
    for (const a of agentes)
      for (const r of rasgos.get(a) ?? []) cuenta.set(r, (cuenta.get(r) ?? 0) + 1)
    // Lo más característico: lo que comparten muchos de los de dentro y pocos de los de fuera.
    // En una sala de una persona vale cualquier rasgo suyo; en una de varias, solo lo compartido.
    const candidato = [...cuenta.entries()]
      .filter(([, c]) => c > 1 || agentes.length === 1)
      .sort((x, y) => y[1] * idf(y[0]) - x[1] * idf(x[0]))[0]

    if (!candidato) {
      return {
        id: `sala/${i}`,
        nombre: 'unlinked',
        tipo: 'suelto' as const,
        motivo:
          agentes.length === 1
            ? 'Its prompt cites no skill and no command summons it.'
            : 'They share no skill and no command.',
        razon: { tipo: 'loose' as const, nombre: '', cuantos: 0, total: agentes.length },
        agents: agentes,
        skills: [],
        commands: [],
      }
    }
    const [rasgo, cuantos] = candidato
    const esComando = rasgo.startsWith('cmd:')
    const refId = rasgo.slice(esComando ? 4 : 6)
    const nombre = nombreDe(refId)
    return {
      id: `sala/${nombre}`,
      nombre: esComando ? `/${nombre}` : nombre,
      tipo: esComando ? ('command' as const) : ('skill' as const),
      motivo: motivoDe(esComando, nombre, cuantos, agentes.length),
      razon: {
        tipo: esComando ? ('command' as const) : ('skill' as const),
        nombre,
        cuantos,
        total: agentes.length,
      },
      agents: agentes,
      skills: [],
      commands: [],
    }
  })

  // --- Dónde guarda cada skill y dónde se clava cada comando --------------------------------

  const salaDe = new Map<string, number>()
  salas.forEach((s, i) => {
    for (const a of s.agents) salaDe.set(a, i)
  })

  const archivoComun: string[] = []
  const deposito: string[] = []
  const citantes = new Map<string, string[]>()
  for (const e of edges) {
    if (e.kind !== 'agent-uses-skill') continue
    if (!citantes.has(e.to)) citantes.set(e.to, [])
    citantes.get(e.to)?.push(e.from)
  }

  for (const skill of catalog.skills) {
    const quienes = citantes.get(skill.id) ?? []
    // Nadie la cita: no tiene despacho al que pertenecer, y eso es exactamente su problema.
    if (quienes.length === 0) {
      deposito.push(skill.id)
      continue
    }
    // La cita media planta: es contexto común y vive en el pasillo, no en un despacho.
    if (quienes.length / total > FRACCION_COMUN) {
      archivoComun.push(skill.id)
      continue
    }
    const votos = new Map<number, number>()
    for (const a of quienes) {
      const i = salaDe.get(a)
      if (i !== undefined) votos.set(i, (votos.get(i) ?? 0) + 1)
    }
    const ganadora = [...votos.entries()].sort((x, y) => y[1] - x[1])[0]
    if (ganadora) salas[ganadora[0]]?.skills.push(skill.id)
    else deposito.push(skill.id)
  }

  const tablonComun: string[] = []
  const tablonHuerfano: string[] = []
  const convocados = new Map<string, string[]>()
  for (const e of edges) {
    if (e.kind !== 'command-invokes-agent') continue
    if (!convocados.has(e.from)) convocados.set(e.from, [])
    convocados.get(e.from)?.push(e.to)
  }
  for (const cmd of catalog.commands) {
    const reparto = convocados.get(cmd.id) ?? []
    if (reparto.length === 0) {
      tablonHuerfano.push(cmd.id)
      continue
    }
    const votos = new Map<number, number>()
    for (const a of reparto) {
      const i = salaDe.get(a)
      if (i !== undefined) votos.set(i, (votos.get(i) ?? 0) + 1)
    }
    const ganadora = [...votos.entries()].sort((x, y) => y[1] - x[1])[0]
    // Un comando que reparte su convocatoria entre varias salas —uno de revisión que convoca a ocho— no es
    // de ninguna: se clava en el tablón del pasillo, que es donde de verdad está.
    if (ganadora && ganadora[1] > reparto.length / 2) salas[ganadora[0]]?.commands.push(cmd.id)
    else tablonComun.push(cmd.id)
  }

  // Las salas grandes primero: la planta se recorre de lo más poblado a lo más solitario.
  salas.sort((a, b) => b.agents.length - a.agents.length || a.nombre.localeCompare(b.nombre))
  return { salas, archivoComun, deposito, tablonComun, tablonHuerfano }
}

/** Azúcar para quien solo tiene las entidades sueltas y no un `Catalog` entero. */
export const catalogoMinimo = (agents: Agent[], skills: Skill[], commands: Command[]): Catalog => ({
  agents,
  skills,
  commands,
  mcpServers: [],
  projects: [],
  scannedAt: 0,
  roots: [],
})
