import { ambitoDe, estaTapada, quienTapa, type Tapadora } from '../alcance.ts'
import type {
  Activity,
  Agent,
  EntityScope,
  McpServer,
  Plugin,
  RazonSala,
  Sala,
  Snapshot,
  TipoSala,
} from '../types.ts'
import { type Archetype, archetypeOf } from './archetypes.ts'
import { FIGURA_DE, type Mueble, type Persona } from './catalogo-sprites.ts'
import { INDICE_PLUGIN } from './paleta.ts'

/**
 * Geometría de la PLANTA, en coordenadas de baldosa.
 *
 * La planta no es una sala grande: son despachos. El reparto en despachos NO se decide aquí
 * —lo calcula el daemon con `agruparEnSalas`, a partir de qué skills cita cada agente y qué
 * comandos lo convocan— y este módulo solo decide dónde cae cada cosa en el suelo.
 *
 * Lo que la posición significa, y que por eso no es decoración:
 *
 * - cada bahía es un despacho real, y su placa cita el rasgo que une a sus ocupantes;
 * - el vestíbulo del centro es el hilo principal (tú), con el archivo de las skills que usa
 *   media planta y el depósito de las que no reclama nadie;
 * - un agente en gris nunca ha sido delegado; la altura del lomo de una skill es su grado;
 * - una skill en el depósito no es que se use poco: es que ningún agente la cita;
 * - un despacho con la placa `plugin · nombre` es un plugin habilitado, con sus propias piezas;
 * - la sala de servidores tiene un rack por servidor MCP: luces encendidas si se ha usado, apagadas
 *   si nunca, y tenue si está deshabilitado.
 */

/**
 * Tamaño de un despacho, sin contar el pasillo.
 *
 * Generoso a propósito. Con celdas justas los escritorios se montaban unos encima de otros y un
 * despacho de seis parecía un vagón de metro.
 */
const CELDA = { cols: 9, rows: 7 }

/**
 * Ancho del pasillo, en baldosas, entre un despacho y el siguiente y alrededor de todos.
 *
 * Sin pasillo los despachos se tocaban y la planta se leía como una sola nave a rayas: el ojo
 * necesita suelo vacío para entender que dos cosas están separadas. Es el reparto de cualquier
 * planta de oficinas de videojuego —Theme Hospital, Project Highrise— y la razón por la que allí
 * un piso se entiende de un vistazo aunque tenga treinta habitaciones.
 *
 * El pasillo se dibuja solo: es el suelo que NO pertenece a ninguna bahía, así que sale con el
 * parqué del edificio mientras cada despacho lleva su moqueta.
 */
const PASILLO = 3

/** Ancho del hueco de la puerta, en baldosas. */
const PUERTA = 2
/** Margen entre la mampara y lo que hay dentro. */
const MARGEN = 0.6

export interface Seat {
  id: string
  name: string
  col: number
  row: number
  figura: Persona
  archetype: Archetype
  /** Índice 0-7 en los ocho valores válidos de `color:`, o null si el campo está vacío. */
  colorIndex: number | null
  unused: boolean
  uses: number
  grade: string
  /** Desfase de la animación de respiración, para que veinte figuras no respiren a la vez. */
  fase: number
  /** Tapada por otra de mayor precedencia: se dibuja tenue y su tooltip lo dice. */
  tapada?: Tapadora
}

export interface Lomo {
  id: string
  name: string
  col: number
  row: number
  /** Altura sobre el suelo a la que está la balda, en píxeles. */
  altura: number
  /** 1 a 4 según el grado: el techo es el techo, el uso nº 50 no hace más alto el lomo. */
  grado: number
  colorIndex: number | null
  duenio: string | null
  unused: boolean
  uses: number
  tapada?: Tapadora
}

export interface Tarjeta {
  id: string
  name: string
  col: number
  row: number
  /** Altura sobre el suelo, en píxeles. */
  altura: number
  used: boolean
  tapada?: Tapadora
}

/**
 * Un rack de la sala de servidores: un servidor MCP. El estado es dato, no decoración:
 * `busy` se ha usado, `idle` nunca, `off` está deshabilitado (en el proyecto o por su plugin).
 */
export interface Rack {
  id: string
  name: string
  col: number
  row: number
  estado: 'busy' | 'idle' | 'off'
  /** Luces encendidas de `LUCES_RACK`, según el grado de uso. */
  luces: number
  uses: number
  grade: string
  transport: McpServer['transport']
  scope: McpServer['scope']
}

/** Cuántas luces tiene un rack. */
export const LUCES_RACK = 5

/** Luces encendidas por grado: lo usado enciende al menos una, y el techo es el techo. */
const LUCES_POR_GRADO: Record<string, number> = {
  unused: 0,
  tried: 1,
  practicing: 3,
  certified: LUCES_RACK,
}

export interface Adorno {
  mueble: Mueble
  col: number
  row: number
}

/** Un despacho ya colocado en el suelo. */
export interface Bahia {
  id: string
  nombre: string
  tipo: TipoSala | 'hub' | 'servers'
  /**
   * El texto de la placa NO se guarda aquí: depende del idioma y la planta se calcula una vez. Se
   * lleva el dato (`razon`, o el `motivo` ya redactado de un daemon antiguo) y la escena redacta.
   */
  motivo: string
  razon?: RazonSala
  /** Rectángulo que ocupa, en baldosas (los bordes son la mampara). */
  col0: number
  row0: number
  col1: number
  row1: number
  agentes: Seat[]
  lomos: Lomo[]
  tarjetas: Tarjeta[]
  /** Solo en la sala de servidores. */
  racks: Rack[]
  /** Solo en el despacho de un plugin: el plugin al que corresponde. */
  plugin?: Plugin
  adornos: Adorno[]
  /** Índice de color de la moqueta, para distinguir un despacho del de al lado. */
  tono: number
  /**
   * Hueco de la puerta en la mampara de delante (la que corre a lo largo de `row1`). Sin un
   * hueco, un despacho cerrado por sus cuatro lados no se lee como un despacho: se lee como una
   * caja, y nadie entiende por dónde se entra.
   */
  puerta: { col0: number; col1: number }
}

export interface RoomLayout {
  bahias: Bahia[]
  /** Puesto del hilo principal, dentro del vestíbulo. */
  main: { col: number; row: number }
  /** Tamaño total de la planta, en baldosas. */
  cols: number
  filas: number
}

const COLOR_NAMES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']

export const colorIndexOf = (color: string | null): number | null => {
  if (!color) return null
  const i = COLOR_NAMES.indexOf(color)
  return i >= 0 ? i : null
}

const GRADO: Record<string, number> = { unused: 1, tried: 2, practicing: 3, certified: 4 }

/** Ancho y alto de la planta para una rejilla dada, pasillos incluidos (uno por medio y uno en
 * cada borde, que es lo que hace que ningún despacho quede pegado a la pared). */
const anchoDe = (columnas: number): number => columnas * CELDA.cols + (columnas + 1) * PASILLO
const altoDe = (filas: number): number => filas * CELDA.rows + (filas + 1) * PASILLO

/** Hash estable: la misma figura respira siempre con el mismo desfase. */
/** Hueco de la puerta, centrado en la mampara de delante. */
const puertaDe = (col0: number, col1: number): { col0: number; col1: number } => {
  const centro = (col0 + col1) / 2
  return { col0: centro - PUERTA / 2, col1: centro + PUERTA / 2 }
}

const fasear = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return ((h >>> 0) % 1000) / 1000
}

/** Altura de la balda de un despacho y la del archivo del vestíbulo. */
const BALDA = 58
const BALDA_ARCHIVO = 96
/** Altura a la que se clavan las tarjetas en una mampara. */
const TABLON = 30

export const buildLayout = (snapshot: Snapshot): RoomLayout => {
  const act = (id: string): Activity | undefined => snapshot.activity[id]
  const agentePorId = new Map(snapshot.catalog.agents.map((a) => [a.id, a] as const))
  const skillPorId = new Map(snapshot.catalog.skills.map((s) => [s.id, s] as const))
  const cmdPorId = new Map(snapshot.catalog.commands.map((c) => [c.id, c] as const))

  // Quién usa más cada skill, según las aristas ACREDITADAS. Decir en un prompt que usarás una
  // skill no la tiñe de tu color; haberla usado, sí.
  const duenios = new Map<string, { agentId: string; uses: number }>()
  for (const e of snapshot.edges) {
    if (e.kind !== 'agent-uses-skill' || e.layer !== 'proven') continue
    const previo = duenios.get(e.to)
    const usos = e.uses ?? 0
    if (!previo || usos > previo.uses) duenios.set(e.to, { agentId: e.from, uses: usos })
  }

  const asiento = (a: Agent, col: number, row: number): Seat => {
    const arquetipo = archetypeOf(a.description, a.name)
    const actividad = act(a.id)
    return {
      id: a.id,
      name: a.name,
      col,
      row,
      figura: FIGURA_DE[arquetipo],
      archetype: arquetipo,
      colorIndex: colorIndexOf(a.color),
      unused: !actividad?.uses,
      uses: actividad?.uses ?? 0,
      grade: actividad?.grade ?? 'unused',
      fase: fasear(a.id),
      tapada: quienTapa(a),
    }
  }

  const lomo = (id: string, col: number, row: number, altura: number): Lomo | null => {
    const s = skillPorId.get(id)
    if (!s) return null
    const a = act(id)
    const d = duenios.get(id)
    const agente = d ? agentePorId.get(d.agentId) : undefined
    return {
      id,
      name: s.name,
      col,
      row,
      altura,
      grado: GRADO[a?.grade ?? 'unused'] ?? 1,
      colorIndex: agente
        ? colorIndexOf(agente.color)
        : ambitoDe(s) === 'plugin'
          ? INDICE_PLUGIN
          : null,
      duenio: agente?.name ?? null,
      unused: !a?.uses,
      uses: a?.uses ?? 0,
      tapada: quienTapa(s),
    }
  }

  const tarjeta = (id: string, col: number, row: number, altura: number): Tarjeta | null => {
    const c = cmdPorId.get(id)
    // "Ejecutado" = el daemon vio ese comando usarse (`activity[id].uses`). Antes iba fijo a
    // `false` y todas las tarjetas salían grises con la chincheta de "nunca ejecutado".
    return c
      ? { id, name: c.name, col, row, altura, used: Boolean(act(id)?.uses), tapada: quienTapa(c) }
      : null
  }

  // --- La rejilla ---------------------------------------------------------------------------

  const salas = snapshot.planta?.salas ?? []
  // Un despacho por plugin (los que llegan en el snapshot: `aplicarShow` ya dejó solo los
  // habilitados) y una sala de servidores si hay alguno. Un plugin sin ninguna pieza dibujable
  // —solo un servidor MCP, o sus piezas ocultas por "Show"— no ocupa una celda.
  const hay = (id: string) => agentePorId.has(id) || skillPorId.has(id) || cmdPorId.has(id)
  const despachosPlugin = (snapshot.catalog.plugins ?? [])
    .map((p) => ({
      plugin: p,
      sala: {
        id: p.id,
        nombre: p.name,
        tipo: 'plugin',
        motivo: p.description ?? '',
        agents: p.agents.filter(hay),
        skills: p.skills.filter(hay),
        commands: p.commands.filter(hay),
      } satisfies Sala,
    }))
    .filter(({ sala }) => sala.agents.length + sala.skills.length + sala.commands.length > 0)
  const servidores = snapshot.catalog.mcpServers ?? []
  // Una celda por despacho más una para el vestíbulo. Se busca una rejilla lo más cuadrada
  // posible: en isométrico una planta cuadrada da un rombo 2:1 en pantalla, que es la forma que
  // mejor aprovecha una ventana apaisada.
  const celdas = salas.length + despachosPlugin.length + (servidores.length > 0 ? 1 : 0) + 1
  // En isométrico el rombo mide (cols + filas) de ancho y la mitad de alto, así que la forma de
  // la rejilla NO cambia la proporción en pantalla: solo el tamaño. La planta más pequeña es
  // entonces la que minimiza `cols + filas`, y como una celda es más ancha que alta, eso NO es
  // la rejilla cuadrada — con diez despachos, 2x5 ocupa 960 px y 4x3 ocupa 1024. Se busca a lo
  // bruto porque el número de despachos es siempre pequeño.
  let columnas = 1
  let mejor = Number.POSITIVE_INFINITY
  for (let c = 1; c <= celdas; c++) {
    const f = Math.ceil(celdas / c)
    const coste = anchoDe(c) + altoDe(f)
    if (coste < mejor) {
      mejor = coste
      columnas = c
    }
  }
  const filasRejilla = Math.ceil(celdas / columnas)
  // El vestíbulo va en el centro de la rejilla: es el único sitio desde el que se ve todo.
  const iHub = Math.floor(filasRejilla / 2) * columnas + Math.floor(columnas / 2)

  const cols = anchoDe(columnas)
  const filas = altoDe(filasRejilla)

  // Cada despacho arranca tras un pasillo, y entre uno y el siguiente va otro.
  const celda = (i: number) => ({
    col0: PASILLO + (i % columnas) * (CELDA.cols + PASILLO),
    row0: PASILLO + Math.floor(i / columnas) * (CELDA.rows + PASILLO),
  })

  const bahias: Bahia[] = []
  let siguiente = 0

  // --- Un despacho --------------------------------------------------------------------------

  const construirBahia = (sala: Sala, indiceCelda: number, tono: number): Bahia => {
    const { col0, row0 } = celda(indiceCelda)
    const col1 = col0 + CELDA.cols
    const row1 = row0 + CELDA.rows
    const x0 = col0 + MARGEN
    const y0 = row0 + MARGEN
    const anchoUtil = CELDA.cols - MARGEN * 2
    const altoUtil = CELDA.rows - MARGEN * 2

    // Los agentes se sientan en filas de tres. Con más de seis en un despacho se aprieta el
    // paso en vez de desbordar la mampara: la planta nunca se sale de su celda.
    const n = sala.agents.length
    const porFila = Math.min(3, Math.max(1, n))
    const filasAg = Math.ceil(n / porFila)
    const pasoCol = anchoUtil / Math.max(1, porFila)
    const pasoRow = Math.min(1.5, altoUtil / Math.max(1, filasAg))

    const agentes: Seat[] = []
    sala.agents.forEach((id, i) => {
      const a = agentePorId.get(id)
      if (!a) return
      const f = Math.floor(i / porFila)
      const c = i % porFila
      agentes.push(asiento(a, x0 + pasoCol * (c + 0.5), y0 + 0.9 + pasoRow * f))
    })

    // Las skills del despacho, en su balda: contra la mampara del fondo (row = row0).
    const lomos: Lomo[] = []
    const pasoLomo = anchoUtil / Math.max(1, sala.skills.length)
    sala.skills.forEach((id, i) => {
      const l = lomo(id, x0 + pasoLomo * (i + 0.5), row0 + 0.12, BALDA)
      if (l) lomos.push(l)
    })

    // Los comandos del despacho, clavados en la mampara de la izquierda (col = col0).
    const tarjetas: Tarjeta[] = []
    const pasoTarjeta = altoUtil / Math.max(1, sala.commands.length)
    sala.commands.forEach((id, i) => {
      const t = tarjeta(id, col0 + 0.12, y0 + pasoTarjeta * (i + 0.5), TABLON)
      if (t) tarjetas.push(t)
    })

    // Mobiliario de relleno. No es dato: es lo que evita que un despacho de una persona parezca
    // una nave abandonada con una mesa en medio. Se elige por ocupación —un despacho con sitio
    // libre tiene mesa de reuniones; uno lleno, archivadores— y se coloca siempre en el mismo
    // orden, así que la planta se ve igual en cada recarga.
    const relleno: Mueble[] =
      n <= 2
        ? ['mesa-redonda', 'taburete', 'estanteria-baja', 'taburete']
        : ['archivador', 'bandejas', 'estanteria-alta']
    const adornos: Adorno[] = [{ mueble: 'planta', col: col1 - 0.8, row: row1 - 0.8 }]
    relleno.forEach((mueble, i) => {
      // Pegados al borde libre del despacho: la banda de la derecha, que es la que nunca ocupan
      // los escritorios (crecen de izquierda a derecha desde el margen).
      const t = (i + 0.5) / relleno.length
      adornos.push({ mueble, col: col1 - 0.9, row: y0 + 0.3 + t * (altoUtil - 0.6) })
    })

    return {
      id: sala.id,
      nombre: sala.nombre,
      tipo: sala.tipo,
      motivo: sala.motivo,
      razon: sala.razon,
      col0,
      row0,
      col1,
      row1,
      agentes,
      lomos,
      tarjetas,
      racks: [],
      adornos,
      tono,
      puerta: puertaDe(col0, col1),
    }
  }

  // --- La sala de servidores ----------------------------------------------------------------

  const construirServidores = (indiceCelda: number, tono: number): Bahia => {
    const { col0, row0 } = celda(indiceCelda)
    const col1 = col0 + CELDA.cols
    const row1 = row0 + CELDA.rows
    const x0 = col0 + MARGEN
    const y0 = row0 + MARGEN
    const anchoUtil = CELDA.cols - MARGEN * 2
    const altoUtil = CELDA.rows - MARGEN * 2

    // Los racks van en filas de hasta cinco, de izquierda a derecha, como en un cuarto de máquinas.
    // Con muchos servidores se aprieta el paso en vez de desbordar la mampara.
    const porFila = Math.min(5, Math.max(1, servidores.length))
    const filasRack = Math.ceil(servidores.length / porFila)
    const pasoCol = anchoUtil / porFila
    const pasoRow = Math.min(2.2, (altoUtil - 1) / Math.max(1, filasRack))
    const racks: Rack[] = servidores.map((m, i) => {
      const a = act(m.id)
      const grade = a?.grade ?? 'unused'
      const apagado = m.enabled === false || estaTapada(m)
      return {
        id: m.id,
        name: m.name,
        col: x0 + pasoCol * ((i % porFila) + 0.5),
        row: y0 + 1.2 + pasoRow * Math.floor(i / porFila),
        estado: apagado ? 'off' : a?.uses ? 'busy' : 'idle',
        luces: LUCES_POR_GRADO[grade] ?? 0,
        uses: a?.uses ?? 0,
        grade,
        transport: m.transport,
        scope: m.scope,
      }
    })

    return {
      id: 'servers',
      nombre: 'servers',
      tipo: 'servers',
      motivo: '',
      col0,
      row0,
      col1,
      row1,
      agentes: [],
      lomos: [],
      tarjetas: [],
      racks,
      adornos: [{ mueble: 'planta', col: col1 - 0.8, row: row1 - 0.8 }],
      tono,
      puerta: puertaDe(col0, col1),
    }
  }

  // --- El vestíbulo -------------------------------------------------------------------------

  const construirHub = (): Bahia => {
    const { col0, row0 } = celda(iHub)
    const col1 = col0 + CELDA.cols
    const row1 = row0 + CELDA.rows
    const x0 = col0 + MARGEN
    const y0 = row0 + MARGEN
    const anchoUtil = CELDA.cols - MARGEN * 2
    const altoUtil = CELDA.rows - MARGEN * 2
    const planta = snapshot.planta

    // Archivo común arriba (lo que usa media planta) y depósito debajo (lo que no reclama nadie).
    // Están enfrentados a propósito: la comparación entre los dos montones es el producto.
    const lomos: Lomo[] = []
    const comunes = planta?.archivoComun ?? []
    const pasoComun = anchoUtil / Math.max(1, comunes.length)
    comunes.forEach((id, i) => {
      const l = lomo(id, x0 + pasoComun * (i + 0.5), row0 + 0.12, BALDA_ARCHIVO)
      if (l) lomos.push(l)
    })
    // Lo tapado por otro ámbito no está en ningún despacho —no se carga—, pero tampoco se esconde:
    // va al vestíbulo, tenue, con su tooltip diciendo quién lo tapa. Lo de un plugin se queda en
    // el despacho de su plugin.
    const tapadas = <T extends { id: string; status: string; scope?: EntityScope }>(l: T[]) =>
      l.filter((e) => estaTapada(e) && ambitoDe(e) !== 'plugin')
    const olvidadas = [
      ...(planta?.deposito ?? []),
      ...tapadas(snapshot.catalog.skills).map((k) => k.id),
    ]
    const pasoDep = anchoUtil / Math.max(1, olvidadas.length)
    olvidadas.forEach((id, i) => {
      const l = lomo(id, x0 + pasoDep * (i + 0.5), row0 + 0.12, BALDA_ARCHIVO - 40)
      if (l) lomos.push(l)
    })

    // Tablón del pasillo: los comandos que cruzan varias salas y los que no convocan a nadie.
    const tarjetas: Tarjeta[] = []
    const sueltos = [
      ...(planta?.tablonComun ?? []),
      ...(planta?.tablonHuerfano ?? []),
      ...tapadas(snapshot.catalog.commands).map((c) => c.id),
    ]
    const porNivel = Math.max(1, Math.ceil(sueltos.length / 2))
    const pasoT = altoUtil / porNivel
    sueltos.forEach((id, i) => {
      const t = tarjeta(
        id,
        col0 + 0.12,
        y0 + pasoT * ((i % porNivel) + 0.5),
        TABLON + Math.floor(i / porNivel) * 26,
      )
      if (t) tarjetas.push(t)
    })

    // Los agentes tapados esperan en la esquina de delante, sin despacho, apartados del puesto del
    // hilo principal (que ocupa el centro): hasta tres por fila, de derecha a izquierda.
    const banquillo = tapadas(snapshot.catalog.agents).filter((a) => !a.archived)
    const agentesTapados = banquillo.map((a, i) =>
      asiento(a, col1 - 1.5 - (i % 3) * 1.5, row1 - 1.3 - Math.floor(i / 3) * 1.4),
    )

    return {
      id: 'hub',
      // Nombre y motivo del vestíbulo salen del catálogo de idiomas al rotular (ver `Escena.placa`).
      nombre: 'hub',
      tipo: 'hub',
      motivo: '',
      col0,
      row0,
      col1,
      row1,
      agentes: agentesTapados,
      lomos,
      tarjetas,
      racks: [],
      adornos: [
        { mueble: 'dispensador', col: col1 - 0.7, row: row0 + 0.8 },
        { mueble: 'planta', col: col0 + 0.7, row: row1 - 0.7 },
      ],
      tono: -1,
      puerta: puertaDe(col0, col1),
    }
  }

  const celdaLibre = (): number => {
    if (siguiente === iHub) siguiente++
    return siguiente++
  }
  for (const sala of salas) bahias.push(construirBahia(sala, celdaLibre(), bahias.length))
  for (const { plugin, sala } of despachosPlugin) {
    bahias.push({ ...construirBahia(sala, celdaLibre(), bahias.length), plugin })
  }
  if (servidores.length > 0) bahias.push(construirServidores(celdaLibre(), bahias.length))
  const hub = construirHub()
  bahias.push(hub)

  return {
    bahias,
    main: { col: (hub.col0 + hub.col1) / 2, row: hub.row0 + CELDA.rows * 0.62 },
    cols,
    filas,
  }
}
