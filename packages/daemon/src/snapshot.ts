import { agruparEnSalas, type Catalog, type Edge, type Planta } from '@ai-office/core'
import {
  activityByTarget,
  buildDeclaredGraph,
  buildProvenGraph,
  type EntityActivity,
  MAIN_THREAD_ID,
  scanCatalog,
  scanHistory,
  scanTranscripts,
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
  activity: Record<string, EntityActivity>
  stats: {
    agents: number
    skills: number
    commands: number
    agentsUnused: number
    skillsUnused: number
    commandsUsed: number
    activeRatio: number
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

export const buildSnapshot = async (): Promise<Snapshot> => {
  const t0 = Date.now()
  const catalog = await scanCatalog()
  const [scan, history] = await Promise.all([scanTranscripts(), scanHistory()])

  const declared = buildDeclaredGraph(catalog)
  const proven = buildProvenGraph(scan.invocations, catalog)
  const edges = [...declared, ...proven]
  const activityMap = activityByTarget(proven)

  const skillsUnused = catalog.skills.filter((s) => !activityMap.get(s.id)?.uses)
  const agentsUnused = catalog.agents.filter((a) => !activityMap.get(a.id)?.uses)
  const skillsActive = catalog.skills.filter((s) => activityMap.get(s.id)?.active).length
  const descriptionTokens = catalog.skills.reduce((a, s) => a + s.descriptionTokens, 0)

  const vocabularyGaps: Record<string, string[]> = {}
  for (const s of catalog.skills) {
    if (!s.description) continue
    vocabularyGaps[s.id] = vocabularyGap(s.description, history.vocab).missing.slice(0, 12)
  }

  return {
    catalog,
    edges,
    activity: Object.fromEntries(activityMap),
    vocabularyGaps,
    // Solo con el grafo DECLARADO: la planta describe cómo está organizado el trabajo según lo
    // que dicen los archivos, no según lo que haya pasado. Mezclar el historial movería a un
    // agente de despacho por haberlo usado una vez, y la planta dejaría de ser estable.
    planta: agruparEnSalas(catalog, declared),
    mainThreadId: MAIN_THREAD_ID,
    stats: {
      agents: catalog.agents.length,
      skills: catalog.skills.length,
      commands: catalog.commands.length,
      agentsUnused: agentsUnused.length,
      skillsUnused: skillsUnused.length,
      commandsUsed: catalog.commands.filter((c) => history.commandUse.has(c.name)).length,
      activeRatio: catalog.skills.length ? skillsActive / catalog.skills.length : 0,
      descriptionTokens,
      deadDescriptionTokens: skillsUnused.reduce((a, s) => a + s.descriptionTokens, 0),
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
