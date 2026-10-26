import { writeFile } from 'node:fs/promises'
import { GRADE_LABELS, type Lang } from '@ai-office/core'
import {
  activityByTarget,
  buildDeclaredGraph,
  buildProvenGraph,
  formatDecimal,
  formatNumber,
  liveCatalog,
  MAIN_THREAD_ID,
  ownCatalog,
  pluginStats,
  readHistoryWindowDays,
  renderPoster,
  resolveScope,
  type ScopeRequest,
  scanCatalogReport,
  scanHistory,
  scanTranscripts,
  scopeHistory,
  skillStats,
  vocabularyGap,
} from '@ai-office/providers'
import type { Messages } from '../i18n.ts'
import { bar, bold, cyan, dim, green, pct, red, relDate, yellow } from '../ui.ts'
import { scopeLine } from './start.ts'

const line = (label: string, value: string): string => `  ${label.padEnd(34)} ${value}`

/** Hasta cuántos nombres se listan en una línea del censo antes de resumir con `+k`. */
const names = (list: string[], max = 3): string =>
  list.length > max ? `${list.slice(0, max).join(', ')} +${list.length - max}` : list.join(', ')

export const census = async (
  ctx: { lang: Lang; t: Messages; scopeRequest?: ScopeRequest },
  posterPath?: string,
): Promise<void> => {
  const { lang } = ctx
  const t = ctx.t.census
  const n = (x: number) => formatNumber(x, lang)
  const t0 = Date.now()
  const resolved = await resolveScope(ctx.scopeRequest ?? { auto: true })
  const { catalog: full, errors } = await scanCatalogReport(resolved.scope)
  process.stderr.write(dim(`${t.reading}\r`))
  const scan = await scanTranscripts()
  const history = await scanHistory()
  const windowDays = await readHistoryWindowDays()
  process.stderr.write(`${' '.repeat(42)}\r`)

  // Lo que cuenta es lo del usuario y del proyecto que Claude Code carga: ni los archivados, ni lo
  // tapado por otro ámbito, ni lo de plugins (eso va en su propia sección).
  const catalog = ownCatalog(full)
  const declared = buildDeclaredGraph(full)
  // En ámbito de proyecto solo cuenta lo ocurrido dentro de él (en el de usuario, todo el historial).
  const measured = scopeHistory(scan, history, resolved.scope)
  const proven = buildProvenGraph(measured.invocations, full)
  // Los slash commands no dejan rastro como herramienta: se miran en el historial tecleado, y en
  // la herramienta Skill cuando el modelo los invoca.
  const activity = activityByTarget(measured.invocations, full, {
    commandUse: measured.commandUse,
    singleProject: resolved.scope.kind === 'project',
  })

  const sk = skillStats(catalog, activity)
  const agentsUnused = catalog.agents.filter((a) => !activity.get(a.id)?.uses)
  const commandsUsed = catalog.commands.filter((c) => activity.get(c.id)?.uses)
  // "Nunca" solo vale dentro de lo que Claude Code conserva de las sesiones.
  const window = windowDays ? t.sinceWindow(windowDays) : t.sinceAll
  const since = measured.measuredOver.kind === 'project' ? `${window} ${t.inThisProject}` : window

  console.log()
  console.log(bold(`  ${t.title}`))
  console.log(dim(`  ${scopeLine(resolved, ctx.t)}`))
  if (measured.measuredOver.kind === 'project') {
    console.log(dim(`  ${t.measuredOverProject(measured.measuredOver.sessions)}`))
  }
  console.log(dim(`  ${catalog.roots.join('\n  ')}`))
  console.log()
  console.log(
    line(
      t.agents,
      `${bold(n(catalog.agents.length))}   ${
        agentsUnused.length ? red(t.agentsIdle(agentsUnused.length, since)) : green(t.allActive)
      }`,
    ),
  )
  console.log(
    line(
      t.skills,
      `${bold(n(catalog.skills.length))}   ${
        sk.skillsUnused ? red(t.skillsIdle(sk.skillsUnused, since)) : green(t.allUsed)
      }${sk.skillsRetired ? dim(`   ${t.retired(sk.skillsRetired)}`) : ''}`,
    ),
  )
  console.log(
    line(
      t.commands,
      `${bold(n(catalog.commands.length))}   ${
        commandsUsed.length === 0 ? red(t.commandsNone) : t.commandsRun(commandsUsed.length)
      }`,
    ),
  )
  console.log()

  // Plugins y servidores MCP: secciones breves que solo salen si hay algo que contar.
  const ps = pluginStats(full, activity)
  if (full.plugins.length) {
    const idle = full.plugins.filter((p) => p.enabled && !activity.get(p.id)?.uses)
    console.log(bold(`  ${t.pluginsTitle}`))
    console.log(`    ${t.pluginsLine(ps.pluginsEnabled, ps.plugins, ps.pluginDescriptionTokens)}`)
    console.log(
      idle.length
        ? `    ${yellow(t.pluginsIdle(names(idle.map((p) => p.name)), since))}`
        : `    ${green(t.pluginsAllUsed)}`,
    )
    console.log()
  }
  const servers = liveCatalog(full).mcpServers
  if (servers.length) {
    const idle = servers.filter((s) => !activity.get(s.id)?.uses)
    const tools = servers
      .flatMap((s) =>
        Object.entries(activity.get(s.id)?.byTool ?? {}).map(([tool, k]) => ({
          label: `${s.name}.${tool}`,
          k,
        })),
      )
      .sort((a, b) => b.k - a.k)
      .slice(0, 3)
    console.log(bold(`  ${t.mcpTitle}`))
    console.log(`    ${t.mcpLine(ps.mcpServers, ps.mcpUnused)}`)
    if (idle.length) console.log(`    ${yellow(t.mcpIdle(names(idle.map((s) => s.name)), since))}`)
    if (tools.length) {
      console.log(`    ${dim(t.mcpTools(tools.map((x) => `${x.label} (${n(x.k)})`).join(', ')))}`)
    }
    console.log()
  }

  console.log(`  ${bold(t.activeRatio)}  ${bar(sk.activeRatio)}  ${bold(pct(sk.activeRatio))}`)
  console.log(
    dim(`  ${t.ratioLine(sk.skillsActive, sk.skillsLive, sk.skillsRetired)}\n  ${t.ratioHint}`),
  )
  console.log()

  console.log(bold(`  ${t.costTitle}`))
  console.log(line(t.costDescriptions, t.tokens(sk.descriptionTokens)))
  console.log(
    line(
      t.costDead,
      `${yellow(t.tokens(sk.deadDescriptionTokens))} ${dim(
        `(${pct(sk.deadDescriptionTokens / (sk.descriptionTokens || 1))})`,
      )}`,
    ),
  )
  console.log()

  console.log(bold(`  ${t.graphTitle}`))
  const declaredSkillEdges = declared.filter(
    (e) => e.kind === 'agent-uses-skill' && e.layer === 'declared',
  )
  const preloadedEdges = declared.filter((e) => e.layer === 'preloaded')
  const provenAgentSkill = proven.filter(
    (e) => e.kind === 'agent-uses-skill' && e.from !== MAIN_THREAD_ID,
  )
  console.log(line(t.declared, `${n(declaredSkillEdges.length)}  ${dim(t.declaredTag)}`))
  console.log(line(t.preloaded, `${n(preloadedEdges.length)}  ${dim(t.preloadedTag)}`))
  console.log(
    line(
      t.proven,
      `${provenAgentSkill.length === 0 ? red('0') : green(n(provenAgentSkill.length))}  ${dim(
        t.provenTag,
      )}`,
    ),
  )
  console.log(line(t.mainThread, cyan(n(proven.filter((e) => e.from === MAIN_THREAD_ID).length))))
  console.log()

  if (agentsUnused.length) {
    console.log(bold(`  ${t.idleAgentsTitle(since)}`))
    for (const a of agentsUnused) {
      const cites = declaredSkillEdges.filter((e) => e.from === a.id).length
      console.log(
        `    ${red('.')} ${a.name.padEnd(28)} ${dim(
          `${a.model ?? t.inheritedModel}, ${t.cites(cites)}`,
        )}`,
      )
    }
    console.log()
  }

  const top = liveCatalog(full)
    .skills.map((s) => ({ s, a: activity.get(s.id) }))
    .filter((x) => x.a?.uses)
    .sort((x, y) => (y.a?.uses ?? 0) - (x.a?.uses ?? 0))
    .slice(0, 5)
  if (top.length) {
    console.log(bold(`  ${t.topTitle}`))
    for (const { s, a } of top) {
      console.log(
        `    ${green('.')} ${s.name.padEnd(28)} ${t.uses(a?.uses ?? 0).padStart(10)}  ${dim(
          `${a?.grade ? GRADE_LABELS[lang][a.grade] : '—'}, ${relDate(a?.lastUsedAt ?? null, t.rel)}`,
        )}`,
      )
    }
    console.log()
  }

  if (history.entries > 0) {
    const worst = catalog.skills
      .filter((s) => !s.disabledForModel && !activity.get(s.id)?.uses && s.description)
      .map((s) => ({ s, gap: vocabularyGap(s.description, history.vocab) }))
      .sort((a, b) => b.gap.missing.length - a.gap.missing.length)
      .slice(0, 3)
    if (worst.length) {
      console.log(bold(`  ${t.vocabTitle}`))
      console.log(dim(`  ${t.vocabNote(history.entries)}`))
      for (const { s, gap } of worst) {
        console.log(`    ${s.name}: ${dim(gap.missing.slice(0, 8).join(', '))}`)
      }
      console.log()
    }
  }

  if (posterPath) {
    const svg = renderPoster({
      catalog,
      activity,
      activeRatio: sk.activeRatio,
      declared: declaredSkillEdges.length,
      proven: proven.filter((e) => e.kind === 'agent-uses-skill' && e.from !== MAIN_THREAD_ID)
        .length,
      descriptionTokens: sk.descriptionTokens,
      deadDescriptionTokens: sk.deadDescriptionTokens,
      skillsRetired: sk.skillsRetired,
      historyWindowDays: windowDays,
      lang,
    })
    await writeFile(posterPath, svg)
    console.log(`  ${t.posterSaved(bold(posterPath))}`)
    console.log()
  }

  if (errors.length) {
    console.log(yellow(`  ${t.unreadable(errors.length)}`))
    for (const e of errors.slice(0, 5)) console.log(dim(`    ${e}`))
    if (errors.length > 5) console.log(dim(`    ${t.more(errors.length - 5)}`))
    console.log()
  }

  console.log(
    dim(
      `  ${t.footer(
        scan.filesRead,
        Math.round(scan.bytesRead / 1048576),
        formatDecimal((Date.now() - t0) / 1000, 1, lang),
      )}`,
    ),
  )
  console.log()
}
