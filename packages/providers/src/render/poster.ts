import type { Catalog, Lang } from '@ai-office/core'
import type { EntityActivity } from '../claude-code/proven.ts'
import { formatNumber } from './format.ts'

/**
 * El cartel: el censo como una sola imagen compartible.
 *
 * Se genera en SVG a propósito — es texto, no necesita ninguna dependencia, se ve en GitHub y
 * cualquiera puede convertirlo a PNG. Y es la prueba barata que decide si este producto
 * interesa a alguien más: si nadie comparte su cartel, la versión animada tampoco lo salvará.
 */

export interface PosterInput {
  catalog: Catalog
  activity: Map<string, EntityActivity>
  activeRatio: number
  declared: number
  proven: number
  descriptionTokens: number
  deadDescriptionTokens: number
  /** Skills jubiladas: no cuentan en el ratio ni se dibujan en la rejilla. */
  skillsRetired?: number
  /** Días que Claude Code conserva los transcripts: "nunca" solo vale dentro de esa ventana. */
  historyWindowDays?: number | null
  /** Idioma de los textos del cartel. Por defecto inglés. */
  lang?: Lang
}

/** Los textos del cartel, por idioma. Las funciones reciben lo que cambia de una frase a otra. */
interface PosterText {
  title: string
  agents: string
  skills: string
  commands: string
  skillsSection: (retired: number) => string
  commandsSection: string
  unusedAgents: (n: number, since: string) => string
  unusedSkills: (n: number, since: string) => string
  unusedCommands: (n: number, since: string) => string
  sinceWindow: (days: number) => string
  sinceNever: string
  ratioTitle: string
  ratioCaption: string
  saidVsDone: string
  declared: (n: number) => string
  proven: (n: number) => string
  tokens: (tokens: string) => string
  deadSkills: (pct: number) => string
  footer: string
}

const TEXT: Record<Lang, PosterText> = {
  en: {
    title: 'My Claude Code setup',
    agents: 'agents',
    skills: 'skills',
    commands: 'commands',
    skillsSection: (retired) => (retired ? `skills (${retired} retired, shown apart)` : 'skills'),
    commandsSection: 'custom commands',
    unusedAgents: (n, since) => `${n} have not worked ${since}`,
    unusedSkills: (n, since) => `${n} unused ${since}`,
    unusedCommands: (n, since) => `${n} not run ${since}`,
    sinceWindow: (days) => `in the last ${days} days`,
    sinceNever: 'so far',
    ratioTitle: 'ACTIVE RATIO',
    ratioCaption: 'of my skills (not counting retired ones) are practicing or certified',
    saidVsDone: 'WHAT I SAY / WHAT I DO',
    declared: (n) => `${n} agent→skill links written in my prompts, `,
    proven: (n) => `${n} proven`,
    tokens: (t) => `~${t} tokens per session in descriptions, `,
    deadSkills: (pct) => `${pct}% from skills I don't use`,
    footer: 'generated with ai-office · npx @alex-roc/ai-office census',
  },
  es: {
    title: 'Mi configuración de Claude Code',
    agents: 'agentes',
    skills: 'skills',
    commands: 'comandos',
    skillsSection: (retired) => (retired ? `skills (${retired} jubiladas aparte)` : 'skills'),
    commandsSection: 'comandos propios',
    unusedAgents: (n, since) => `${n} no han trabajado ${since}`,
    unusedSkills: (n, since) => `${n} no se han usado ${since}`,
    unusedCommands: (n, since) => `${n} no se han ejecutado ${since}`,
    sinceWindow: (days) => `en los últimos ${days} días`,
    sinceNever: 'nunca',
    ratioTitle: 'RATIO ACTIVO',
    ratioCaption: 'de mis skills (sin las jubiladas) está en práctica o acreditada',
    saidVsDone: 'LO QUE DIGO / LO QUE HAGO',
    declared: (n) => `${n} relaciones agente→skill escritas en mis prompts, `,
    proven: (n) => `${n} demostradas`,
    tokens: (t) => `~${t} tokens por sesión en descriptions, `,
    deadSkills: (pct) => `${pct}% de skills que no uso`,
    footer: 'generado con ai-office · npx @alex-roc/ai-office censo',
  },
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const W = 1200
const MIN_H = 800

/** Una fila de figuras mide 46 px; la sección añade su título (30 px). */
const ROW_H = 46
const sectionHeight = (count: number, perRow: number): number =>
  30 + Math.ceil(count / perRow) * ROW_H

export const renderPoster = (input: PosterInput): string => {
  const { activity } = input
  const lang = input.lang ?? 'en'
  const t = TEXT[lang]
  // Ni los agentes archivados ni las skills jubiladas están "puestos" ante Claude Code.
  const agents = input.catalog.agents.filter((a) => !a.archived)
  const skills = input.catalog.skills.filter((s) => !s.disabledForModel)
  const commands = input.catalog.commands
  const used = (id: string) => (activity.get(id)?.uses ?? 0) > 0

  // La altura sale de lo que hay que dibujar: con 120 skills una H fija solapaba la rejilla con
  // la banda del ratio. Misma geometría que antes cuando cabe en 800.
  const GAP = 34
  const sectionsEnd =
    268 +
    sectionHeight(agents.length, 20) +
    GAP +
    sectionHeight(skills.length, 20) +
    GAP +
    sectionHeight(commands.length, 14)
  const H = Math.max(MIN_H, sectionsEnd + 68 + 126)
  const since = input.historyWindowDays ? t.sinceWindow(input.historyWindowDays) : t.sinceNever

  const parts: string[] = []
  const push = (s: string) => parts.push(s)

  push(
    `<svg xmlns="http://www.w3.org/2000/svg" lang="${lang}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">`,
  )
  push(`<rect width="${W}" height="${H}" fill="#f6f4f0"/>`)
  push(`<text x="64" y="84" font-size="34" font-weight="700" fill="#23201c">${esc(t.title)}</text>`)

  // Los tres números, que es lo que de verdad se comparte.
  const nums: [number, string, string][] = [
    [agents.length, t.agents, t.unusedAgents(agents.filter((a) => !used(a.id)).length, since)],
    [skills.length, t.skills, t.unusedSkills(skills.filter((s) => !used(s.id)).length, since)],
    [
      commands.length,
      t.commands,
      t.unusedCommands(commands.filter((c) => !used(c.id)).length, since),
    ],
  ]
  nums.forEach(([total, label, unusedText], i) => {
    const x = 64 + i * 372
    push(`<text x="${x}" y="168" font-size="64" font-weight="700" fill="#23201c">${total}</text>`)
    push(
      `<text x="${x + (total > 9 ? 78 : 44)}" y="168" font-size="22" fill="#7a736a">${esc(label)}</text>`,
    )
    push(`<text x="${x}" y="198" font-size="19" fill="#b4462f">${esc(unusedText)}</text>`)
  })

  // Rejilla de entidades: cada figura es una cosa que tienes; rellena = la usas.
  const section = (
    title: string,
    items: { id: string; name: string }[],
    y0: number,
    shape: 'circle' | 'square' | 'card',
  ) => {
    push(
      `<text x="64" y="${y0}" font-size="15" fill="#7a736a" letter-spacing="1.4">${esc(title.toUpperCase())}</text>`,
    )
    const perRow = shape === 'card' ? 14 : 20
    items.forEach((it, i) => {
      const cx = 64 + (i % perRow) * 54
      const cy = y0 + 30 + Math.floor(i / perRow) * 46
      const on = used(it.id)
      const fill = on ? '#23201c' : '#f6f4f0'
      const stroke = on ? '#23201c' : '#c9c0b2'
      if (shape === 'circle') {
        push(
          `<circle cx="${cx + 14}" cy="${cy + 14}" r="13" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
        )
      } else if (shape === 'square') {
        push(
          `<rect x="${cx + 2}" y="${cy + 2}" width="25" height="25" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
        )
      } else {
        push(
          `<rect x="${cx - 2}" y="${cy + 5}" width="36" height="19" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
        )
      }
    })
    return y0 + sectionHeight(items.length, perRow)
  }

  let y = 268
  y = section(t.agents, agents, y, 'circle') + GAP
  y = section(t.skillsSection(input.skillsRetired ?? 0), skills, y, 'square') + GAP
  section(t.commandsSection, commands, y, 'card')

  // Ratio activo: la única cifra que resume, y la única que no sube por gastar más.
  const bandY = H - 126 // la banda del ratio cuelga del final: H ya reservó su sitio
  push(
    `<line x1="64" y1="${bandY - 34}" x2="${W - 64}" y2="${bandY - 34}" stroke="#ddd6cc" stroke-width="1"/>`,
  )
  const barW = 300
  push(
    `<text x="64" y="${bandY}" font-size="15" fill="#7a736a" letter-spacing="1.4">${esc(t.ratioTitle)}</text>`,
  )
  push(
    `<text x="64" y="${bandY + 44}" font-size="38" font-weight="700" fill="#23201c">${Math.round(input.activeRatio * 100)}%</text>`,
  )
  push(`<rect x="160" y="${bandY + 26}" width="${barW}" height="14" rx="7" fill="#e2dcd2"/>`)
  push(
    `<rect x="160" y="${bandY + 26}" width="${Math.round(barW * input.activeRatio)}" height="14" rx="7" fill="#2f7d4f"/>`,
  )
  push(
    `<text x="160" y="${bandY + 62}" font-size="15" fill="#7a736a">${esc(t.ratioCaption)}</text>`,
  )

  push(
    `<text x="${W - 64}" y="${bandY}" text-anchor="end" font-size="15" fill="#7a736a" letter-spacing="1.4">${esc(t.saidVsDone)}</text>`,
  )
  push(
    `<text x="${W - 64}" y="${bandY + 32}" text-anchor="end" font-size="17" fill="#23201c">${esc(t.declared(input.declared))}<tspan fill="#b4462f">${esc(t.proven(input.proven))}</tspan></text>`,
  )
  push(
    `<text x="${W - 64}" y="${bandY + 58}" text-anchor="end" font-size="17" fill="#23201c">${esc(t.tokens(formatNumber(input.descriptionTokens, lang)))}<tspan fill="#b4462f">${esc(t.deadSkills(Math.round((input.deadDescriptionTokens / (input.descriptionTokens || 1)) * 100)))}</tspan></text>`,
  )
  push(`<text x="64" y="${H - 26}" font-size="14" fill="#a89b8a">${esc(t.footer)}</text>`)
  push('</svg>')
  return parts.join('\n')
}
