import { t } from './i18n/index.ts'
import { shortPath } from './texto.ts'
import type { Agent, MeasuredOver, Snapshot } from './types.ts'

/**
 * Lecturas derivadas del snapshot que la interfaz necesita en varios sitios, y los campos
 * opcionales que el daemon añade en versiones recientes. Se leen de forma defensiva: un daemon
 * más antiguo que la interfaz (o al revés) no debe romper la pantalla por un campo que falta.
 */

interface CamposOpcionales {
  scanErrors?: string[]
  stats?: { skillsRetired?: number; historyWindowDays?: number | null }
}

export const estaArchivado = (a: Agent): boolean =>
  (a as Agent & { archived?: boolean }).archived === true

export const erroresDeEscaneo = (s: Snapshot): string[] =>
  (s as Snapshot & CamposOpcionales).scanErrors ?? []

/** `undefined` = el daemon no lo informa; `null` = sin límite (se leyó todo el historial). */
export const ventanaDeHistorial = (s: Snapshot): number | null | undefined =>
  (s.stats as CamposOpcionales['stats'])?.historyWindowDays

export const skillsJubiladas = (s: Snapshot): number | undefined =>
  (s.stats as CamposOpcionales['stats'])?.skillsRetired

export const agentesArchivados = (s: Snapshot): Agent[] => s.catalog.agents.filter(estaArchivado)

/**
 * El snapshot sin los agentes archivados, para lo que DIBUJA (Sala, Plano, editor de flujos): un
 * agente archivado ya no es parte de la oficina. La ficha y el buscador reciben el completo, para
 * poder listarlos y restaurarlos.
 *
 * Un despacho que solo tenía agentes archivados desaparece con ellos: quedaría vacío y, además,
 * ocuparía una celda de la planta.
 */
export const sinArchivados = (s: Snapshot): Snapshot => {
  const fuera = new Set(agentesArchivados(s).map((a) => a.id))
  if (fuera.size === 0) return s
  const salas = (s.planta?.salas ?? [])
    .map((sala) => ({ sala, agents: sala.agents.filter((id) => !fuera.has(id)) }))
    .filter(({ sala, agents }) => agents.length > 0 || sala.agents.length === 0)
    .map(({ sala, agents }) => ({ ...sala, agents }))
  return {
    ...s,
    catalog: { ...s.catalog, agents: s.catalog.agents.filter((a) => !fuera.has(a.id)) },
    planta: { ...s.planta, salas },
  }
}

/**
 * Clave del CONJUNTO de entidades dibujadas. Cambia cuando aparece o desaparece algo (un agente
 * nuevo, una skill borrada, uno archivado), no cuando solo cambian los números de uso. Es lo que
 * decide cuándo reencuadrar la cámara: encajar tras cada snapshot movía la vista bajo el ratón.
 */
export const claveDeConjunto = (s: Snapshot): string =>
  [
    s.catalog.agents.map((a) => a.id).join('|'),
    s.catalog.skills.map((k) => k.id).join('|'),
    s.catalog.commands.map((c) => c.id).join('|'),
    (s.catalog.plugins ?? []).map((p) => p.id).join('|'),
    (s.catalog.mcpServers ?? []).map((m) => m.id).join('|'),
    (s.planta?.salas ?? []).map((x) => `${x.id}:${x.agents.length}`).join('|'),
  ].join('#')

/**
 * La fuente de toda cifra de uso, tal como se cita en los tooltips: los transcripts de la raíz de
 * Claude Code y los días que conservan. Una sola redacción para la cabecera y el Registro.
 */
/** Sobre qué se midió la actividad; sin el campo (daemon antiguo), todo el historial. */
export const medidoSobre = (s: Snapshot): MeasuredOver => s.measuredOver ?? { kind: 'all' }

/** "this project · 24 sessions" o "all projects": lo que dice la etiqueta visible junto a las lecturas. */
export const medidoTexto = (s: Snapshot): string => {
  const m = medidoSobre(s)
  return m.kind === 'project'
    ? t('measure.project', { sessions: t('count.sessions', { n: m.sessions }) })
    : t('measure.all')
}

export const fuenteTranscripts = (s: Snapshot): string => {
  const [dirAgentes = '~/.claude/agents'] = s.catalog.roots
  const raiz = shortPath(dirAgentes.replace(/[\\/]agents[\\/]?$/, ''))
  const dias = ventanaDeHistorial(s)
  const ventana =
    dias === undefined
      ? ''
      : dias === null
        ? t('src.window.all')
        : t('src.window.days', { n: dias })
  const m = medidoSobre(s)
  const medido =
    m.kind === 'project'
      ? t('src.measured.project', { sessions: t('count.sessions', { n: m.sessions }) })
      : ''
  return t('src.transcripts', { root: raiz, window: ventana + medido })
}
