import { agruparEnSalas, type Catalog, type Edge, type Planta } from '@ai-office/core'
import {
  activityByTarget,
  buildDeclaredGraph,
  buildProvenGraph,
  type CatalogScan,
  type EntityActivity,
  type HistoryScan,
  MAIN_THREAD_ID,
  readHistoryWindowDays,
  scanCatalogReport,
  scanHistory,
  scanTranscripts,
  skillStats,
  type TranscriptScan,
  vocabularyGap,
} from '@ai-office/providers'

/**
 * El estado completo que la interfaz necesita para dibujarse.
 *
 * Se construye en dos tiempos: primero el catálogo (rápido, de disco) para que la sala aparezca
 * enseguida, y luego el historial (varios segundos sobre gigabytes) que la puebla de pasado.
 */
export interface Snapshot {
  catalog: Catalog
  /** Grafo declarado (prosa y frontmatter) + acreditado (historial). */
  edges: Edge[]
  /** Actividad por id de entidad: skills, agentes y comandos (estos desde `history.jsonl` y la herramienta Skill). */
  activity: Record<string, EntityActivity>
  /** Archivos del catálogo que no se pudieron leer (symlink roto, .md ilegible), con el motivo. */
  scanErrors: string[]
  stats: {
    /** Agentes activos: los archivados (`agents/.archivo/`) no cuentan. */
    agents: number
    skills: number
    commands: number
    agentsUnused: number
    skillsUnused: number
    /** Skills jubiladas (`disable-model-invocation`): salen del denominador del ratio. */
    skillsRetired: number
    commandsUsed: number
    activeRatio: number
    /** Días que Claude Code conserva los transcripts (`cleanupPeriodDays`); `null` si no se sabe. */
    historyWindowDays: number | null
    descriptionTokens: number
    deadDescriptionTokens: number
    declaredAgentSkill: number
    preloadedAgentSkill: number
    provenAgentSkill: number
    mainThreadSkills: number
    historyPrompts: number
    transcriptFiles: number
    transcriptBytes: number
    builtAt: number
    buildMs: number
  }
  /** Términos de cada description que el usuario nunca ha escrito. Hecho, no pronóstico. */
  vocabularyGaps: Record<string, string[]>
  /** El reparto del catálogo en despachos. Se calcula aquí, no en la interfaz: es un dato
   * derivado del grafo, y así se puede probar en Node sin levantar un canvas. */
  planta: Planta
  mainThreadId: string
}

/**
 * Lo caro de calcular y que NO cambia cuando el usuario edita un archivo del catálogo: gigabytes
 * de transcripts, el historial tecleado y los ajustes. Se cachea aparte para que una mutación
 * reescanee el catálogo (milisegundos) sin releer el historial (segundos).
 */
export interface HistoricalData {
  scan: TranscriptScan
  history: HistoryScan
  historyWindowDays: number | null
}

export const scanHistorical = async (): Promise<HistoricalData> => {
  const [scan, history, historyWindowDays] = await Promise.all([
    scanTranscripts(),
    scanHistory(),
    readHistoryWindowDays(),
  ])
  return { scan, history, historyWindowDays }
}

/** Une un catálogo recién escaneado con un historial ya calculado. */
export const assembleSnapshot = (
  { catalog, errors }: CatalogScan,
  { scan, history, historyWindowDays }: HistoricalData,
  t0 = Date.now(),
): Snapshot => {
  // Los archivados viajan en `catalog.agents` para poder restaurarlos, pero no se cuentan ni
  // entran en ningún grafo (ver `buildDeclaredGraph`).
  const liveAgents = catalog.agents.filter((a) => !a.archived)

  const declared = buildDeclaredGraph(catalog)
  const proven = buildProvenGraph(scan.invocations, catalog)
  const edges = [...declared, ...proven]
  const activityMap = activityByTarget(scan.invocations, catalog, {
    commandUse: history.commandUse,
  })

  const agentsUnused = liveAgents.filter((a) => !activityMap.get(a.id)?.uses)
  const skills = skillStats(catalog, activityMap)

  const vocabularyGaps: Record<string, string[]> = {}
  for (const s of catalog.skills) {
    if (!s.description) continue
    vocabularyGaps[s.id] = vocabularyGap(s.description, history.vocab).missing.slice(0, 12)
  }

  return {
    catalog,
    edges,
    activity: Object.fromEntries(activityMap),
    scanErrors: errors,
    vocabularyGaps,
    // Solo con el grafo DECLARADO: la planta describe cómo está organizado el trabajo según lo
    // que dicen los archivos, no según lo que haya pasado. Mezclar el historial movería a un
    // agente de despacho por haberlo usado una vez, y la planta dejaría de ser estable.
    planta: agruparEnSalas(catalog, declared),
    mainThreadId: MAIN_THREAD_ID,
    stats: {
      agents: liveAgents.length,
      skills: catalog.skills.length,
      commands: catalog.commands.length,
      agentsUnused: agentsUnused.length,
      skillsUnused: skills.skillsUnused,
      skillsRetired: skills.skillsRetired,
      commandsUsed: catalog.commands.filter((c) => activityMap.get(c.id)?.uses).length,
      activeRatio: skills.activeRatio,
      historyWindowDays,
      descriptionTokens: skills.descriptionTokens,
      deadDescriptionTokens: skills.deadDescriptionTokens,
      declaredAgentSkill: declared.filter(
        (e) => e.kind === 'agent-uses-skill' && e.layer === 'declared',
      ).length,
      preloadedAgentSkill: declared.filter((e) => e.layer === 'preloaded').length,
      provenAgentSkill: proven.filter(
        (e) => e.kind === 'agent-uses-skill' && e.from !== MAIN_THREAD_ID,
      ).length,
      mainThreadSkills: proven.filter((e) => e.from === MAIN_THREAD_ID).length,
      historyPrompts: history.entries,
      transcriptFiles: scan.filesRead,
      transcriptBytes: scan.bytesRead,
      builtAt: Date.now(),
      buildMs: Date.now() - t0,
    },
  }
}

/** Todo de una vez: lo que usa el primer arranque y `/api/refresh`. */
export const buildSnapshot = async (): Promise<Snapshot> => {
  const t0 = Date.now()
  const [catalog, historical] = await Promise.all([scanCatalogReport(), scanHistorical()])
  return assembleSnapshot(catalog, historical, t0)
}
