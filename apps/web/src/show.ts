import { esDePlugin, pluginsDe, servidoresMcpDe } from './alcance.ts'
import type { EntityScope, Planta, Sala, Snapshot } from './types.ts'

/**
 * Qué familias de cosas dibujan la Sala y el Plano ("Show" de la cabecera). El Registro NO pasa
 * por aquí: siempre enseña todo, que es para lo que sirve.
 *
 * Los valores guardados llegan de `config.json` (todos opcionales); lo que falta lo decide
 * `showPorDefecto`. Puro y sin React: se prueba en Node.
 */

export interface Show {
  agents: boolean
  skills: boolean
  commands: boolean
  plugins: boolean
  mcp: boolean
}

export const CLAVES_SHOW = ['agents', 'skills', 'commands', 'plugins', 'mcp'] as const

/**
 * Hasta cuántas piezas de plugin se dibujan por defecto. Un plugin grande trae decenas de skills y
 * agentes: encendidos de entrada taparían la oficina del usuario, que es lo que vino a ver.
 */
export const MAX_ITEMS_PLUGIN = 12

/** Piezas (agentes, skills y comandos) de los plugins HABILITADOS: lo que se dibujaría si se activan. */
export const itemsDePlugins = (s: Snapshot): number =>
  pluginsDe(s)
    .filter((p) => p.enabled)
    .reduce((n, p) => n + p.agents.length + p.skills.length + p.commands.length, 0)

export const showPorDefecto = (s: Snapshot): Show => ({
  agents: true,
  skills: true,
  commands: true,
  plugins: itemsDePlugins(s) <= MAX_ITEMS_PLUGIN,
  mcp: true,
})

/** Lo guardado manda; lo que falta toma el valor por defecto. */
export const resolverShow = (s: Snapshot, guardado?: Partial<Show> | null): Show => {
  const base = showPorDefecto(s)
  const out = { ...base }
  for (const k of CLAVES_SHOW) {
    const v = guardado?.[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

const filtrarSala = (sala: Sala, hay: (id: string) => boolean): Sala => ({
  ...sala,
  agents: sala.agents.filter(hay),
  skills: sala.skills.filter(hay),
  commands: sala.commands.filter(hay),
})

const filtrarPlanta = (planta: Planta | undefined, hay: (id: string) => boolean): Planta => ({
  salas: (planta?.salas ?? [])
    .map((s) => filtrarSala(s, hay))
    // Un despacho al que se le han quitado todos sus ocupantes saldría vacío y ocuparía una celda.
    .filter((s) => s.agents.length + s.skills.length + s.commands.length > 0),
  archivoComun: (planta?.archivoComun ?? []).filter(hay),
  deposito: (planta?.deposito ?? []).filter(hay),
  tablonComun: (planta?.tablonComun ?? []).filter(hay),
  tablonHuerfano: (planta?.tablonHuerfano ?? []).filter(hay),
})

/**
 * El snapshot que DIBUJAN la Sala y el Plano. Con `plugins` apagado desaparecen los plugins y todas
 * sus piezas; con `plugins` encendido solo salen los HABILITADOS (uno deshabilitado no carga nada,
 * y dibujarlo sería mentir sobre lo que ve Claude Code). `agents`, `skills` y `commands` se aplican
 * a todo, plugins incluidos.
 */
export const aplicarShow = (s: Snapshot, show: Show): Snapshot => {
  const habilitados = show.plugins ? pluginsDe(s).filter((p) => p.enabled) : []
  const deHabilitados = new Set(
    habilitados.flatMap((p) => [...p.agents, ...p.skills, ...p.commands]),
  )
  const pasa = <T extends { id: string; scope?: EntityScope }>(lista: T[], on: boolean): T[] =>
    on ? lista.filter((e) => !esDePlugin(e) || deHabilitados.has(e.id)) : []

  const catalog = {
    ...s.catalog,
    agents: pasa(s.catalog.agents, show.agents),
    skills: pasa(s.catalog.skills, show.skills),
    commands: pasa(s.catalog.commands, show.commands),
    plugins: habilitados,
    mcpServers: show.mcp ? servidoresMcpDe(s) : [],
  }
  const presentes = new Set([
    ...catalog.agents.map((e) => e.id),
    ...catalog.skills.map((e) => e.id),
    ...catalog.commands.map((e) => e.id),
  ])
  return { ...s, catalog, planta: filtrarPlanta(s.planta, (id) => presentes.has(id)) }
}
