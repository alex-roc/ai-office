import { writeFile } from 'node:fs/promises'
import { GRADE_LABEL } from '@ai-office/core'
import {
  activityByTarget,
  buildDeclaredGraph,
  buildProvenGraph,
  MAIN_THREAD_ID,
  formatNumber as n,
  readHistoryWindowDays,
  renderPoster,
  scanCatalogReport,
  scanHistory,
  scanTranscripts,
  skillStats,
  vocabularyGap,
} from '@ai-office/providers'
import { bar, bold, cyan, dim, green, pct, red, relDate, yellow } from '../ui.ts'

const line = (label: string, value: string): string => `  ${label.padEnd(34)} ${value}`

export const censo = async (posterPath?: string): Promise<void> => {
  const t0 = Date.now()
  const { catalog: full, errors } = await scanCatalogReport()
  process.stderr.write(dim('leyendo el historial de sesiones...\r'))
  const scan = await scanTranscripts()
  const history = await scanHistory()
  const windowDays = await readHistoryWindowDays()
  process.stderr.write(`${' '.repeat(42)}\r`)

  // Los agentes archivados (`agents/.archivo/`) no están puestos ante Claude Code: no cuentan.
  const catalog = { ...full, agents: full.agents.filter((a) => !a.archived) }
  const declared = buildDeclaredGraph(catalog)
  const proven = buildProvenGraph(scan.invocations, catalog)
  // Los slash commands no dejan rastro como herramienta: se miran en el historial tecleado, y en
  // la herramienta Skill cuando el modelo los invoca.
  const activity = activityByTarget(scan.invocations, catalog, { commandUse: history.commandUse })

  const sk = skillStats(catalog, activity)
  const agentsUnused = catalog.agents.filter((a) => !activity.get(a.id)?.uses)
  const commandsUsed = catalog.commands.filter((c) => activity.get(c.id)?.uses)
  // "Nunca" solo vale dentro de lo que Claude Code conserva de las sesiones.
  const since = windowDays ? `en los últimos ${n(windowDays)} días` : 'en el historial disponible'

  console.log()
  console.log(bold('  ai-office · censo'))
  console.log(dim(`  ${catalog.roots.join('\n  ')}`))
  console.log()
  console.log(
    line(
      'agentes',
      `${bold(n(catalog.agents.length))}   ${
        agentsUnused.length
          ? red(`${n(agentsUnused.length)} no han trabajado ${since}`)
          : green('todos activos')
      }`,
    ),
  )
  console.log(
    line(
      'skills',
      `${bold(n(catalog.skills.length))}   ${
        sk.skillsUnused ? red(`${n(sk.skillsUnused)} sin usar ${since}`) : green('todas usadas')
      }${sk.skillsRetired ? dim(`   (${n(sk.skillsRetired)} jubiladas)`) : ''}`,
    ),
  )
  console.log(
    line(
      'comandos propios',
      `${bold(n(catalog.commands.length))}   ${
        commandsUsed.length === 0
          ? red('ninguno se ha ejecutado')
          : `${n(commandsUsed.length)} ejecutados alguna vez`
      }`,
    ),
  )
  console.log()

  console.log(`  ${bold('ratio activo')}  ${bar(sk.activeRatio)}  ${bold(pct(sk.activeRatio))}`)
  const retiredNote = sk.skillsRetired ? ` (sin contar ${n(sk.skillsRetired)} jubiladas)` : ''
  console.log(
    dim(
      `  ${n(sk.skillsActive)} de ${n(sk.skillsLive)} skills en práctica o acreditadas${retiredNote}.\n` +
        '  Sube al usar lo que tienes o al jubilar lo que no usarás. No sube por gastar más.',
    ),
  )
  console.log()

  console.log(bold('  coste de tenerlo todo instalado'))
  console.log(line('descriptions en cada sesión', `~${n(sk.descriptionTokens)} tokens`))
  console.log(
    line(
      'de skills que nadie ha usado',
      `${yellow(`~${n(sk.deadDescriptionTokens)} tokens`)} ${dim(
        `(${pct(sk.deadDescriptionTokens / (sk.descriptionTokens || 1))})`,
      )}`,
    ),
  )
  console.log()

  console.log(bold('  el grafo que ya escribiste, y el que existe'))
  const declaredSkillEdges = declared.filter(
    (e) => e.kind === 'agent-uses-skill' && e.layer === 'declared',
  )
  const preloadedEdges = declared.filter((e) => e.layer === 'preloaded')
  const provenAgentSkill = proven.filter(
    (e) => e.kind === 'agent-uses-skill' && e.from !== MAIN_THREAD_ID,
  )
  console.log(
    line(
      'agente→skill citadas en su prompt',
      `${n(declaredSkillEdges.length)}  ${dim('declaradas')}`,
    ),
  )
  console.log(
    line('agente→skill en `skills:`', `${n(preloadedEdges.length)}  ${dim('precargadas')}`),
  )
  console.log(
    line(
      'agente→skill demostradas',
      `${provenAgentSkill.length === 0 ? red('0') : green(n(provenAgentSkill.length))}  ${dim(
        'en el historial',
      )}`,
    ),
  )
  console.log(
    line(
      '…del hilo principal (tú, en directo)',
      cyan(n(proven.filter((e) => e.from === MAIN_THREAD_ID).length)),
    ),
  )
  console.log()

  if (agentsUnused.length) {
    console.log(bold(`  agentes que no han sido delegados ${since}`))
    for (const a of agentsUnused) {
      const cites = declaredSkillEdges.filter((e) => e.from === a.id).length
      console.log(
        `    ${red('.')} ${a.name.padEnd(28)} ${dim(
          `${a.model ?? 'modelo heredado'}, cita ${n(cites)} skill${cites === 1 ? '' : 's'}`,
        )}`,
      )
    }
    console.log()
  }

  const top = catalog.skills
    .map((s) => ({ s, a: activity.get(s.id) }))
    .filter((x) => x.a?.uses)
    .sort((x, y) => (y.a?.uses ?? 0) - (x.a?.uses ?? 0))
    .slice(0, 5)
  if (top.length) {
    console.log(bold('  skills que sí usas'))
    for (const { s, a } of top) {
      console.log(
        `    ${green('.')} ${s.name.padEnd(28)} ${n(a?.uses ?? 0).padStart(5)} usos  ${dim(
          `${a?.grade ? GRADE_LABEL[a.grade] : '—'}, ${relDate(a?.lastUsedAt ?? null)}`,
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
      console.log(bold('  palabras de tus skills sin usar que nunca has escrito'))
      console.log(dim(`  (contra ${n(history.entries)} prompts tuyos; un hecho, no un pronóstico)`))
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
    })
    await writeFile(posterPath, svg)
    console.log(`  cartel guardado en ${bold(posterPath)}`)
    console.log()
  }

  if (errors.length) {
    console.log(yellow(`  ${n(errors.length)} archivos no se pudieron leer:`))
    for (const e of errors.slice(0, 5)) console.log(dim(`    ${e}`))
    if (errors.length > 5) console.log(dim(`    … y ${n(errors.length - 5)} más`))
    console.log()
  }

  console.log(
    dim(
      `  ${n(scan.filesRead)} archivos de sesión · ${n(Math.round(scan.bytesRead / 1048576))} MB · ${(
        (Date.now() - t0) / 1000
      ).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`,
    ),
  )
  console.log()
}
