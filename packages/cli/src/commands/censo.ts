import { writeFile } from 'node:fs/promises'
import {
  activityByTarget,
  buildDeclaredGraph,
  buildProvenGraph,
  MAIN_THREAD_ID,
  renderPoster,
  scanCatalog,
  scanHistory,
  scanTranscripts,
  vocabularyGap,
} from '@ai-office/providers'
import { bar, bold, cyan, dim, green, pct, red, relDate, yellow } from '../ui.ts'

const line = (label: string, value: string): string => `  ${label.padEnd(34)} ${value}`

export const censo = async (posterPath?: string): Promise<void> => {
  const t0 = Date.now()
  const catalog = await scanCatalog()
  process.stderr.write(dim('leyendo el historial de sesiones...\r'))
  const scan = await scanTranscripts()
  const history = await scanHistory()
  process.stderr.write(`${' '.repeat(42)}\r`)

  const declared = buildDeclaredGraph(catalog)
  const proven = buildProvenGraph(scan.invocations, catalog)
  const activity = activityByTarget(proven)

  const skillsActive = catalog.skills.filter((s) => activity.get(s.id)?.active).length
  const skillsUnused = catalog.skills.filter((s) => !activity.get(s.id)?.uses).length
  const agentsUnused = catalog.agents.filter((a) => !activity.get(a.id)?.uses)
  // Los slash commands no dejan rastro como herramienta: se miran en el historial tecleado.
  const commandsUsed = catalog.commands.filter((c) => history.commandUse.has(c.name))
  const descTokens = catalog.skills.reduce((a, s) => a + s.descriptionTokens, 0)
  const deadTokens = catalog.skills
    .filter((s) => !activity.get(s.id)?.uses)
    .reduce((a, s) => a + s.descriptionTokens, 0)

  console.log()
  console.log(bold('  ai-office . censo'))
  console.log(dim(`  ${catalog.roots.join('\n  ')}`))
  console.log()
  console.log(
    line(
      'agentes',
      `${bold(String(catalog.agents.length))}   ${
        agentsUnused.length
          ? red(`${agentsUnused.length} no han trabajado nunca`)
          : green('todos activos')
      }`,
    ),
  )
  console.log(
    line(
      'skills',
      `${bold(String(catalog.skills.length))}   ${
        skillsUnused ? red(`${skillsUnused} no se han usado nunca`) : green('todas usadas')
      }`,
    ),
  )
  console.log(
    line(
      'comandos propios',
      `${bold(String(catalog.commands.length))}   ${
        commandsUsed.length === 0
          ? red('ninguno se ha ejecutado')
          : `${commandsUsed.length} ejecutados alguna vez`
      }`,
    ),
  )
  console.log()

  const ratio = catalog.skills.length ? skillsActive / catalog.skills.length : 0
  console.log(`  ${bold('ratio activo')}  ${bar(ratio)}  ${bold(pct(ratio))}`)
  console.log(
    dim(
      `  ${skillsActive} de ${catalog.skills.length} skills en practica o acreditadas.\n` +
        '  Sube al usar lo que tienes o al jubilar lo que no usaras. No sube por gastar mas.',
    ),
  )
  console.log()

  console.log(bold('  coste de tenerlo todo instalado'))
  console.log(line('descriptions en cada sesion', `~${descTokens.toLocaleString('es')} tokens`))
  console.log(
    line(
      'de skills que nadie ha usado',
      `${yellow(`~${deadTokens.toLocaleString('es')} tokens`)} ${dim(
        `(${pct(deadTokens / (descTokens || 1))})`,
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
      'agente->skill citadas en su prompt',
      `${declaredSkillEdges.length}  ${dim('declaradas')}`,
    ),
  )
  console.log(line('agente->skill en `skills:`', `${preloadedEdges.length}  ${dim('precargadas')}`))
  console.log(
    line(
      'agente->skill demostradas',
      `${provenAgentSkill.length === 0 ? red('0') : green(String(provenAgentSkill.length))}  ${dim(
        'en el historial',
      )}`,
    ),
  )
  console.log(
    line(
      '...del hilo principal (tu, en directo)',
      cyan(String(proven.filter((e) => e.from === MAIN_THREAD_ID).length)),
    ),
  )
  console.log()

  if (agentsUnused.length) {
    console.log(bold('  agentes que nunca han sido delegados'))
    for (const a of agentsUnused) {
      const cites = declaredSkillEdges.filter((e) => e.from === a.id).length
      console.log(
        `    ${red('.')} ${a.name.padEnd(28)} ${dim(
          `${a.model ?? 'modelo heredado'}, cita ${cites} skill${cites === 1 ? '' : 's'}`,
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
    console.log(bold('  skills que si usas'))
    for (const { s, a } of top) {
      console.log(
        `    ${green('.')} ${s.name.padEnd(28)} ${String(a?.uses).padStart(3)} usos  ${dim(
          `${a?.grade}, ${relDate(a?.lastUsedAt ?? null)}`,
        )}`,
      )
    }
    console.log()
  }

  if (history.entries > 0) {
    const worst = catalog.skills
      .filter((s) => !activity.get(s.id)?.uses && s.description)
      .map((s) => ({ s, gap: vocabularyGap(s.description, history.vocab) }))
      .sort((a, b) => b.gap.missing.length - a.gap.missing.length)
      .slice(0, 3)
    if (worst.length) {
      console.log(bold('  palabras de tus skills sin usar que nunca has escrito'))
      console.log(
        dim(
          `  (contra ${history.entries.toLocaleString('es')} prompts tuyos; un hecho, no un pronostico)`,
        ),
      )
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
      activeRatio: ratio,
      declared: declaredSkillEdges.length,
      proven: proven.filter((e) => e.kind === 'agent-uses-skill' && e.from !== MAIN_THREAD_ID)
        .length,
      descriptionTokens: descTokens,
      deadDescriptionTokens: deadTokens,
      commandsUsed: commandsUsed.length,
    })
    await writeFile(posterPath, svg)
    console.log(`  cartel guardado en ${bold(posterPath)}`)
    console.log()
  }

  console.log(
    dim(
      `  ${scan.filesRead} archivos de sesion . ${(scan.bytesRead / 1048576).toFixed(0)} MB . ${(
        (Date.now() - t0) / 1000
      ).toFixed(1)}s`,
    ),
  )
  console.log()
}
