import {
  agruparEnSalas,
  type Catalog,
  type Edge,
  type KnownProject,
  type Planta,
  type ScopeSelection,
} from '@ai-office/core'
import {
  activityByTarget,
  buildDeclaredGraph,
  buildProvenGraph,
  type CatalogScan,
  type EntityActivity,
  type HistoryScan,
  MAIN_THREAD_ID,
  type MeasuredOver,
  ownCatalog,
  pluginStats,
  readHistoryWindowDays,
  resolveScope,
  scanCatalogReport,
  scanHistory,
  scanKnownProjects,
  scanTranscripts,
  scopeHistory,
  skillStats,
  type TranscriptScan,
  vocabularyGap,
  withCurrentProject,
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
  /** El ámbito con el que se construyó: solo lo del usuario, o además lo de un proyecto. */
  scope: ScopeSelection
  /**
   * De qué se mide la actividad: `all` (ámbito de usuario: todo el historial) o `project` (solo las
   * invocaciones con directorio de trabajo dentro del proyecto, y cuántas sesiones lo componen).
   * Con `project`, "sin uso" quiere decir "sin uso en este proyecto".
   */
  measuredOver: MeasuredOver
  /** Proyectos conocidos (de `~/.claude.json` y de los transcripts); los que existen, primero. */
  knownProjects: KnownProject[]
  /** Archivos del catálogo que no se pudieron leer (symlink roto, .md ilegible), con el motivo. */
  scanErrors: string[]
  stats: {
    /** Agentes del usuario y del proyecto que Claude Code carga: no cuentan los archivados, los
     * tapados por otro ámbito ni los de plugins. */
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
    /** Plugins instalados y, de ellos, los habilitados y los habilitados sin ningún uso. */
    plugins: number
    pluginsEnabled: number
    pluginsUnused: number
    /** Tokens de las descriptions de las skills de plugins HABILITADOS (aparte de `descriptionTokens`). */
    pluginDescriptionTokens: number
    /** Servidores MCP y los sin uso. En ámbito de proyecto son los que se CARGAN (ni tapados, ni
     * desactivados, ni de un plugin apagado); en ámbito de usuario el estado por proyecto no se
     * conoce y cuenta como cargado todo lo que no está tapado: son los CONFIGURADOS. */
    mcpServers: number
    mcpUnused: number
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
  knownProjects: KnownProject[]
}

export const scanHistorical = async (): Promise<HistoricalData> => {
  const [scan, history, historyWindowDays, knownProjects] = await Promise.all([
    scanTranscripts(),
    scanHistory(),
    readHistoryWindowDays(),
    scanKnownProjects(),
  ])
  return { scan, history, historyWindowDays, knownProjects }
}

/** Une un catálogo recién escaneado con un historial ya calculado. */
export const assembleSnapshot = (
  { catalog, errors }: CatalogScan,
  { scan, history, historyWindowDays, knownProjects }: HistoricalData,
  scope: ScopeSelection = { kind: 'user' },
  t0 = Date.now(),
): Snapshot => {
  // Los archivados, los tapados por otro ámbito y lo de plugins viajan en el catálogo para poder
  // enseñarlos, pero las cifras y la planta cuentan solo lo que es del usuario y se carga.
  const own = ownCatalog(catalog)
  const liveAgents = own.agents

  // La actividad se mide solo sobre lo ocurrido dentro del ámbito (todo, o el proyecto). Se filtra
  // lo ya escaneado: el transcript no se vuelve a leer al cambiar de ámbito.
  const measured = scopeHistory(scan, history, scope)
  const declared = buildDeclaredGraph(catalog)
  const proven = buildProvenGraph(measured.invocations, catalog)
  const edges = [...declared, ...proven]
  const activityMap = activityByTarget(measured.invocations, catalog, {
    commandUse: measured.commandUse,
    singleProject: scope.kind === 'project',
  })

  const agentsUnused = liveAgents.filter((a) => !activityMap.get(a.id)?.uses)
  const skills = skillStats(own, activityMap)
  const plugins = pluginStats(catalog, activityMap)

  const vocabularyGaps: Record<string, string[]> = {}
  for (const s of catalog.skills) {
    if (!s.description || s.status === 'shadowed') continue
    vocabularyGaps[s.id] = vocabularyGap(s.description, history.vocab).missing.slice(0, 12)
  }

  return {
    catalog,
    edges,
    activity: Object.fromEntries(activityMap),
    scope,
    measuredOver: measured.measuredOver,
    knownProjects,
    scanErrors: errors,
    vocabularyGaps,
    // Solo con el grafo DECLARADO: la planta describe cómo está organizado el trabajo según lo
    // que dicen los archivos, no según lo que haya pasado. Mezclar el historial movería a un
    // agente de despacho por haberlo usado una vez, y la planta dejaría de ser estable.
    planta: agruparEnSalas(catalog, declared),
    mainThreadId: MAIN_THREAD_ID,
    stats: {
      agents: liveAgents.length,
      skills: own.skills.length,
      commands: own.commands.length,
      agentsUnused: agentsUnused.length,
      skillsUnused: skills.skillsUnused,
      skillsRetired: skills.skillsRetired,
      commandsUsed: own.commands.filter((c) => activityMap.get(c.id)?.uses).length,
      activeRatio: skills.activeRatio,
      historyWindowDays,
      ...plugins,
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

/**
 * Todo de una vez: lo que usa el primer arranque y `/api/refresh`. Sin ámbito explícito se usa el
 * de `config.json` (o el de usuario): quien lanza desde una carpeta la decide en la CLI, no aquí.
 */
export const buildSnapshot = async (scope?: ScopeSelection): Promise<Snapshot> => {
  const t0 = Date.now()
  const active = scope ?? (await resolveScope()).scope
  const [catalog, historical] = await Promise.all([scanCatalogReport(active), scanHistorical()])
  const knownProjects = await withCurrentProject(historical.knownProjects, active)
  return assembleSnapshot(catalog, { ...historical, knownProjects }, active, t0)
}
