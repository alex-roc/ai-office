import type { Agent, Command, Skill } from '@ai-office/core'
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

/** Genera el Markdown de un slash command a partir del flujo. */
export const compileFlow = (flow: Flow): string => {
  const phases = new Map<number, FlowStep[]>()
  flow.steps.forEach((step, i) => {
    const phase = step.phase ?? i + 1
    const list = phases.get(phase) ?? []
    list.push(step)
    phases.set(phase, list)
  })

  const lines: string[] = []
  lines.push('---')
  lines.push(`description: ${flow.description}`)
  lines.push('---')
  lines.push('')
  if (flow.notes?.trim()) {
    lines.push(flow.notes.trim())
    lines.push('')
  }
  lines.push(MARK_START)
  lines.push('')

  const ordered = [...phases.entries()].sort((a, b) => a[0] - b[0])
  for (const [phase, steps] of ordered) {
    if (steps.length > 1) {
      lines.push(`${phase}. **En paralelo**, delega a la vez:`)
      for (const s of steps) {
        lines.push(
          `   - agente \`${s.agent}\`: ${s.task}${
            s.skills?.length ? ` (consulta ${s.skills.map((k) => `\`${k}\``).join(', ')})` : ''
          }`,
        )
      }
    } else {
      const s = steps[0]
      if (!s) continue
      lines.push(
        `${phase}. Delega al agente \`${s.agent}\`: ${
          s.skills?.length
            ? `${endSentence(s.task)} Consulta ${s.skills.map((k) => `\`${k}\``).join(', ')}.`
            : s.task
        }`,
      )
    }
    lines.push('')
  }
  lines.push('Usa `$ARGUMENTS` como contexto de la petición del usuario.')
  lines.push('')
  lines.push(MARK_END)
  lines.push('')
  return lines.join('\n')
}

/**
 * Recupera los pasos de un comando ya escrito, para poder abrirlo en el lienzo.
 * Funciona con los generados por `compileFlow` y, de forma aproximada, con los escritos a mano.
 */
export const importFlow = (command: Command, agents: Agent[], skills: Skill[]): Flow => {
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
      inParallel = /en paralelo/i.test(line)
    } else if (/^[-*]\s/.test(line)) {
      // Continúa una lista: si veníamos de una fase paralela, comparten número.
    } else {
      inParallel = false
    }

    // Un paso es toda línea que nombre un agente conocido entre acentos graves o en prosa.
    for (const name of agentNames) {
      const re = new RegExp(`(?<![A-Za-z0-9_-])${name}(?![A-Za-z0-9_-])`)
      if (!re.test(line)) continue
      let task = line
        .replace(/^[\d.\-*\s]+/, '')
        .replace(/\*\*/g, '')
        .replace(new RegExp(`^(agente\\s+)?\`?${name}\`?[:,]?\\s*`, 'i'), '')
        .replace(/^delega al agente\s+`?[a-z0-9-]+`?[:,]?\s*/i, '')
        .trim()
      const mentioned = [...skillNames].filter((k) =>
        new RegExp(`(?<![A-Za-z0-9_-])${k}(?![A-Za-z0-9_-])`).test(line),
      )
      // La coletilla "Consulta `x`, `y`." la genera el compilador a partir del campo `skills`.
      // Si se dejara dentro del texto, al recompilar saldría dos veces.
      if (mentioned.length > 0) {
        task = task.replace(/\s*\(?consulta\s+`[^`]+`(?:\s*,\s*`[^`]+`)*\.?\)?\s*$/i, '').trim()
      }
      steps.push({
        agent: name,
        task: task || 'sin descripción',
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

/** Ruta destino de un comando compilado. El nombre se normaliza para que sea tecleable. */
export const flowFileName = (flow: Flow): string => `${slug(flow.name)}.md`
