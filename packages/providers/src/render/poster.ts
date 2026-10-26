import type { Catalog } from '@ai-office/core'
import type { EntityActivity } from '../claude-code/proven.ts'

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
  commandsUsed: number
}

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const W = 1200
const H = 800

export const renderPoster = (input: PosterInput): string => {
  const { catalog, activity } = input
  const used = (id: string) => (activity.get(id)?.uses ?? 0) > 0

  const parts: string[] = []
  const push = (s: string) => parts.push(s)

  push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">`,
  )
  push(`<rect width="${W}" height="${H}" fill="#f6f4f0"/>`)
  push(
    `<text x="64" y="84" font-size="34" font-weight="700" fill="#23201c">Mi configuración de Claude Code</text>`,
  )

  // Los tres números, que es lo que de verdad se comparte.
  const nums: [number, string, number][] = [
    [catalog.agents.length, 'agentes', catalog.agents.filter((a) => !used(a.id)).length],
    [catalog.skills.length, 'skills', catalog.skills.filter((s) => !used(s.id)).length],
    [catalog.commands.length, 'comandos', catalog.commands.length - input.commandsUsed],
  ]
  const verbs = ['no han trabajado nunca', 'no se han usado nunca', 'no se han ejecutado nunca']
  nums.forEach(([total, label, unusedCount], i) => {
    const x = 64 + i * 372
    push(`<text x="${x}" y="168" font-size="64" font-weight="700" fill="#23201c">${total}</text>`)
    push(
      `<text x="${x + (total > 9 ? 78 : 44)}" y="168" font-size="22" fill="#7a736a">${label}</text>`,
    )
    push(`<text x="${x}" y="198" font-size="19" fill="#b4462f">${unusedCount} ${verbs[i]}</text>`)
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
    return y0 + 30 + Math.ceil(items.length / perRow) * 46
  }

  let y = 268
  y = section('agentes', catalog.agents, y, 'circle') + 34
  y = section('skills', catalog.skills, y, 'square') + 34
  section('comandos propios', catalog.commands, y, 'card')

  // Ratio activo: la única cifra que resume, y la única que no sube por gastar más.
  const bandY = H - 126
  push(
    `<line x1="64" y1="${bandY - 34}" x2="${W - 64}" y2="${bandY - 34}" stroke="#ddd6cc" stroke-width="1"/>`,
  )
  const barW = 300
  push(
    `<text x="64" y="${bandY}" font-size="15" fill="#7a736a" letter-spacing="1.4">RATIO ACTIVO</text>`,
  )
  push(
    `<text x="64" y="${bandY + 44}" font-size="38" font-weight="700" fill="#23201c">${Math.round(input.activeRatio * 100)}%</text>`,
  )
  push(`<rect x="160" y="${bandY + 26}" width="${barW}" height="14" rx="7" fill="#e2dcd2"/>`)
  push(
    `<rect x="160" y="${bandY + 26}" width="${Math.round(barW * input.activeRatio)}" height="14" rx="7" fill="#2f7d4f"/>`,
  )
  push(
    `<text x="160" y="${bandY + 62}" font-size="15" fill="#7a736a">de mis skills está en práctica o acreditada</text>`,
  )

  push(
    `<text x="${W - 64}" y="${bandY}" text-anchor="end" font-size="15" fill="#7a736a" letter-spacing="1.4">LO QUE DIGO / LO QUE HAGO</text>`,
  )
  push(
    `<text x="${W - 64}" y="${bandY + 32}" text-anchor="end" font-size="17" fill="#23201c">${input.declared} relaciones agente→skill escritas en mis prompts, <tspan fill="#b4462f">${input.proven} demostradas</tspan></text>`,
  )
  push(
    `<text x="${W - 64}" y="${bandY + 58}" text-anchor="end" font-size="17" fill="#23201c">~${input.descriptionTokens.toLocaleString('es')} tokens por sesión en descriptions, <tspan fill="#b4462f">${Math.round((input.deadDescriptionTokens / (input.descriptionTokens || 1)) * 100)}% de skills que no uso</tspan></text>`,
  )
  push(
    `<text x="64" y="${H - 26}" font-size="14" fill="#a89b8a">generado con ai-office · npx ai-office censo</text>`,
  )
  push('</svg>')
  return parts.join('\n')
}
