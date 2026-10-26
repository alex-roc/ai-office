import type { Agent, Command, Lang, Skill } from '@ai-office/core'
import { stringify } from 'yaml'
import { OfficeError } from './errors.ts'
import { parseMarkdownDoc } from './frontmatter.ts'

/**
 * Compilador de flujos: convierte un lienzo de pasos en un slash command ejecutable, y al revés.
 *
 * El destino por defecto es un slash command en Markdown porque es lo que el usuario ya tiene y
 * lo que cualquiera sabe leer y editar a mano. No se inventa un formato nuevo: el archivo
 * generado debe ser indistinguible de uno escrito a mano, y la importación tiene que poder
 * recuperar los pasos de los comandos que ya existen.
 */

export interface FlowStep {
  /** Nombre del agente al que se delega, tal cual aparece en `~/.claude/agents`. */
  agent: string
  /** Qué se le encarga. Una frase. */
  task: string
  /** Skills que el paso debe consultar. */
  skills?: string[]
  /** Los pasos con el mismo número de fase se lanzan en paralelo. */
  phase?: number
}

export interface Flow {
  name: string
  description: string
  steps: FlowStep[]
  /** Instrucciones libres que se conservan al recompilar. */
  notes?: string
}

const MARK_START = '<!-- ai-office:flujo:inicio -->'
const MARK_END = '<!-- ai-office:flujo:fin -->'

/**
 * La prosa que el compilador escribe en el archivo del usuario, por idioma. El inglés es el
 * predeterminado. `importFlow` reconoce los dos idiomas (más abajo): un comando ya escrito en
 * español sigue abriéndose en el lienzo aunque el usuario cambie de idioma.
 */
interface FlowProse {
  parallel: string
  delegate: (agent: string) => string
  parallelAgent: (agent: string) => string
  consult: string
  context: string
  noDescription: string
}

const PROSE: Record<Lang, FlowProse> = {
  en: {
    parallel: '**In parallel**, delegate at once:',
    delegate: (agent) => `Delegate to the agent \`${agent}\`:`,
    parallelAgent: (agent) => `agent \`${agent}\``,
    consult: 'Consult',
    context: "Use `$ARGUMENTS` as context for the user's request.",
    noDescription: 'no description',
  },
  es: {
    parallel: '**En paralelo**, delega a la vez:',
    delegate: (agent) => `Delega al agente \`${agent}\`:`,
    parallelAgent: (agent) => `agente \`${agent}\``,
    consult: 'Consulta',
    context: 'Usa `$ARGUMENTS` como contexto de la petición del usuario.',
    noDescription: 'sin descripción',
  },
}

/** Cierra la frase de la tarea si el usuario no puso puntuación, para que el texto fluya. */
const endSentence = (text: string): string =>
  /[.!?:;]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`

const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Una frase en una sola línea: un salto de línea en una tarea abriría un paso que no existe. */
const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ').trim()

/**
 * Las notas son texto libre del usuario y van dentro del archivo que Claude Code lee como
 * comando: no pueden contener nuestros marcadores (romperían `importFlow` y duplicarían el
 * bloque al recompilar) ni una línea `---` que parezca abrir o cerrar un frontmatter.
 */
const sanitizeNotes = (notes: string): string =>
  notes
    .replace(/<!--\s*ai-office:flujo:[^>]*-->/g, '')
    .split(/\r?\n/)
    .map((l) => (/^\s*(---+|\.\.\.)\s*$/.test(l) ? `\\${l.trim()}` : l))
    .join('\n')
    .trim()

/** Genera el Markdown de un slash command a partir del flujo. */
export const compileFlow = (flow: Flow, lang: Lang = 'en'): string => {
  const prose = PROSE[lang]
  const phases = new Map<number, FlowStep[]>()
  flow.steps.forEach((step, i) => {
    const phase = step.phase ?? i + 1
    const list = phases.get(phase) ?? []
    list.push(step)
    phases.set(phase, list)
  })

  const lines: string[] = []
  // El frontmatter lo emite la librería YAML, no una plantilla: una descripción con `:`, `#` o un
  // salto de línea seguido de `allowed-tools: Bash(*)` sería, escrita a pelo, una clave nueva.
  lines.push('---')
  lines.push(stringify({ description: flow.description }, { lineWidth: 0 }).trimEnd())
  lines.push('---')
  lines.push('')
  const notes = flow.notes ? sanitizeNotes(flow.notes) : ''
  if (notes) {
    lines.push(notes)
    lines.push('')
  }
  lines.push(MARK_START)
  lines.push('')

  const ordered = [...phases.entries()].sort((a, b) => a[0] - b[0])
  for (const [phase, steps] of ordered) {
    if (steps.length > 1) {
      lines.push(`${phase}. ${prose.parallel}`)
      for (const s of steps) {
        lines.push(
          `   - ${prose.parallelAgent(s.agent)}: ${oneLine(s.task)}${
            s.skills?.length
              ? ` (${prose.consult.toLowerCase()} ${s.skills.map((k) => `\`${k}\``).join(', ')})`
              : ''
          }`,
        )
      }
    } else {
      const s = steps[0]
      if (!s) continue
      lines.push(
        `${phase}. ${prose.delegate(s.agent)} ${
          s.skills?.length
            ? `${endSentence(oneLine(s.task))} ${prose.consult} ${s.skills.map((k) => `\`${k}\``).join(', ')}.`
            : oneLine(s.task)
        }`,
      )
    }
    lines.push('')
  }
  lines.push(prose.context)
  lines.push('')
  lines.push(MARK_END)
  lines.push('')
  return lines.join('\n')
}

/**
 * Recupera los pasos de un comando ya escrito, para poder abrirlo en el lienzo.
 * Funciona con los generados por `compileFlow` (en cualquier idioma) y, de forma aproximada, con
 * los escritos a mano. `lang` solo decide el texto de relleno de un paso sin tarea.
 */
export const importFlow = (
  command: Command,
  agents: Agent[],
  skills: Skill[],
  lang: Lang = 'en',
): Flow => {
  const doc = parseMarkdownDoc(`---\n---\n${command.body}`)
  const body = doc.body
  const agentNames = new Set(agents.map((a) => a.name))
  const skillNames = new Set(skills.map((s) => s.name))

  const steps: FlowStep[] = []
  let phase = 0
  let inParallel = false

  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const numbered = /^(\d+)\./.exec(line)
    if (numbered) {
      phase = Number(numbered[1])
      inParallel = /(?:en paralelo|in parallel)/i.test(line)
    } else if (/^[-*]\s/.test(line)) {
      // Continúa una lista: si veníamos de una fase paralela, comparten número.
    } else {
      inParallel = false
    }

    // Un paso es toda línea que nombre un agente conocido entre acentos graves o en prosa.
    for (const name of agentNames) {
      const re = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(name)}(?![A-Za-z0-9_-])`)
      if (!re.test(line)) continue
      let task = line
        .replace(/^[\d.\-*\s]+/, '')
        .replace(/\*\*/g, '')
        .replace(
          new RegExp(`^(?:(?:agente|agent)\\s+)?\`?${escapeRegExp(name)}\`?[:,]?\\s*`, 'i'),
          '',
        )
        .replace(/^(?:delega al agente|delegate to the agent)\s+`?[a-z0-9-]+`?[:,]?\s*/i, '')
        .trim()
      const mentioned = [...skillNames].filter((k) =>
        new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(k)}(?![A-Za-z0-9_-])`).test(line),
      )
      // La coletilla "Consulta `x`, `y`." la genera el compilador a partir del campo `skills`.
      // Si se dejara dentro del texto, al recompilar saldría dos veces.
      if (mentioned.length > 0) {
        task = task
          .replace(/\s*\(?(?:consulta|consult)\s+`[^`]+`(?:\s*,\s*`[^`]+`)*\.?\)?\s*$/i, '')
          .trim()
      }
      steps.push({
        agent: name,
        task: task || PROSE[lang].noDescription,
        phase: inParallel ? phase : phase || steps.length + 1,
        ...(mentioned.length ? { skills: mentioned } : {}),
      })
      break
    }
  }

  return {
    name: command.name,
    description: command.description,
    steps,
  }
}

/**
 * Nombre de archivo de un comando compilado. El nombre se normaliza para que sea tecleable, y si
 * no queda nada (`"¿¿??"`) se avisa: un `.md` sin nombre sería un archivo oculto que nadie ve.
 */
export const flowFileName = (flow: Flow): string => {
  const name = slug(flow.name)
  if (!name) {
    throw new OfficeError(
      'invalid-name',
      `the name "${flow.name}" is not valid for a command: use at least one letter or number`,
      { params: { name: flow.name } },
    )
  }
  return `${name}.md`
}
