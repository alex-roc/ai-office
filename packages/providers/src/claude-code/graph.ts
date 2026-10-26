import type { Agent, Catalog, Command, Edge, EdgeEvidence, Skill } from '@ai-office/core'
import { liveCatalog } from './live.ts'
import { mcpResolver, parseMcpToolName, unknownMcpId } from './mcp.ts'

/**
 * Extrae el grafo que ya está escrito en los archivos, casi siempre en prosa.
 *
 * Hallazgo que motiva este módulo: los agentes citan skills en el cuerpo de su prompt
 * ("antes de trabajar, lee tal skill"), los comandos nombran a los agentes que convocan,
 * y algunas skills declaran su clientela. Nada de eso es un campo estructurado, así que
 * ninguna herramienta lo ve. Aquí se recupera, con la línea y el texto que lo justifican.
 */

/**
 * Frontera de token que admite guiones dentro del nombre: `release-tools` no casa dentro de
 * `x-release-tools-y`. Antes del nombre tampoco vale `:`, para que citar `plugin:lint` no cuente
 * como citar la skill de usuario `lint`.
 */
const mentionRegex = (name: string): RegExp =>
  new RegExp(
    `(?<![A-Za-z0-9_:-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`,
    'g',
  )

interface Mention {
  line: number
  excerpt: string
  /** La mención va entre backticks o dentro de una ruta: intención inequívoca. */
  explicit: boolean
}

/** Busca menciones de `name` en `text`, ignorando las que están dentro de un bloque de código. */
const findMentions = (text: string, name: string): Mention[] => {
  const out: Mention[] = []
  const lines = text.split('\n')
  const re = mentionRegex(name)
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    // Una línea es UNA mención aunque el nombre salga dos veces (`**plugin:x** — \`plugin:x\``, que
    // es como se escribe la cita de una skill de plugin): es explícita si alguna aparición lo es.
    const hits = [...line.matchAll(re)]
    if (hits.length === 0) continue
    const backticked = hits.some((m) => {
      const around = line.slice(Math.max(0, m.index - 2), m.index + name.length + 2)
      return /`/.test(around)
    })
    const explicit =
      backticked || line.includes(`skills/${name}`) || line.includes(`/${name}/SKILL.md`)
    out.push({
      line: i + 1,
      excerpt: line.trim().slice(0, 180),
      explicit,
    })
  }
  return out
}

/** `bodyStartLine - 1` convierte una línea del cuerpo en la línea real del archivo. */
const evidenceFrom = (path: string, mentions: Mention[], bodyStartLine: number): EdgeEvidence[] =>
  mentions.slice(0, 3).map((m) => ({
    path,
    line: m.line + bodyStartLine - 1,
    excerpt: m.excerpt,
  }))

/**
 * Aristas agente→skill.
 * - `preloaded`: campo `skills:` del frontmatter. Carga el contenido completo siempre.
 * - `declared`: citada en la prosa del cuerpo. Depende de que el modelo obedezca la frase.
 */
export const agentSkillEdges = (agents: Agent[], skills: Skill[]): Edge[] => {
  const edges: Edge[] = []
  const byName = new Map(skills.map((s) => [s.name, s]))

  for (const agent of agents) {
    for (const skillName of agent.preloadedSkills) {
      const skill = byName.get(skillName)
      edges.push({
        from: agent.id,
        to: skill?.id ?? `skill:claude-code/user/${skillName}`,
        kind: 'agent-uses-skill',
        layer: 'preloaded',
        dangling: !skill,
        evidence: [{ path: agent.source.realPath, field: 'skills', excerpt: skillName }],
      })
    }
    const preloaded = new Set(agent.preloadedSkills)
    for (const skill of skills) {
      if (preloaded.has(skill.name)) continue
      const mentions = findMentions(agent.body, skill.name)
      if (mentions.length === 0) continue
      // Una mención suelta y no explícita es demasiado débil para afirmar una relación.
      if (mentions.length === 1 && !mentions[0]?.explicit) continue
      edges.push({
        from: agent.id,
        to: skill.id,
        kind: 'agent-uses-skill',
        layer: 'declared',
        evidence: evidenceFrom(agent.source.realPath, mentions, agent.bodyStartLine),
      })
    }
  }
  return edges
}

/** Aristas comando→agente y comando→skill: el reparto que cada slash command convoca. */
export const commandEdges = (commands: Command[], agents: Agent[], skills: Skill[]): Edge[] => {
  const edges: Edge[] = []
  for (const cmd of commands) {
    for (const agent of agents) {
      const mentions = findMentions(cmd.body, agent.name)
      if (mentions.length === 0) continue
      edges.push({
        from: cmd.id,
        to: agent.id,
        kind: 'command-invokes-agent',
        layer: 'declared',
        evidence: evidenceFrom(cmd.source.realPath, mentions, cmd.bodyStartLine),
      })
    }
    for (const skill of skills) {
      const mentions = findMentions(cmd.body, skill.name)
      if (mentions.length === 0) continue
      if (mentions.length === 1 && !mentions[0]?.explicit) continue
      edges.push({
        from: cmd.id,
        to: skill.id,
        kind: 'command-invokes-skill',
        layer: 'declared',
        evidence: evidenceFrom(cmd.source.realPath, mentions, cmd.bodyStartLine),
      })
    }
  }
  return edges
}

/** Aristas skill→agente: la clientela que una skill declara en su propia description o cuerpo. */
export const skillClientEdges = (skills: Skill[], agents: Agent[]): Edge[] => {
  const edges: Edge[] = []
  for (const skill of skills) {
    for (const agent of agents) {
      // La description vive en el frontmatter (sin línea citable) y el cuerpo empieza en
      // `bodyStartLine`: se buscan por separado para que la evidencia diga la línea real.
      const inDescription = findMentions(skill.description, agent.name)
      const inBody = findMentions(skill.body, agent.name)
      if (inDescription.length + inBody.length === 0) continue
      edges.push({
        from: skill.id,
        to: agent.id,
        kind: 'skill-declares-client',
        layer: 'declared',
        evidence: [
          ...inDescription.slice(0, 1).map((m) => ({
            path: skill.source.realPath,
            field: 'description',
            excerpt: m.excerpt,
          })),
          ...evidenceFrom(skill.source.realPath, inBody, skill.bodyStartLine),
        ].slice(0, 3),
      })
    }
  }
  return edges
}

/** Aristas agente→agente: delegación declarada en la prosa. */
export const agentDelegationEdges = (agents: Agent[]): Edge[] => {
  const edges: Edge[] = []
  for (const from of agents) {
    for (const to of agents) {
      if (from.id === to.id) continue
      const mentions = findMentions(from.body, to.name)
      if (mentions.length === 0) continue
      edges.push({
        from: from.id,
        to: to.id,
        kind: 'agent-delegates-agent',
        layer: 'declared',
        evidence: evidenceFrom(from.source.realPath, mentions, from.bodyStartLine),
      })
    }
  }
  return edges
}

/**
 * Aristas agente→tool y agente→servidor MCP, del frontmatter. Varias herramientas del mismo
 * servidor (`mcp__github__a`, `mcp__github__b`) son UNA arista agente→servidor con varias pruebas.
 */
export const agentToolEdges = (agents: Agent[], mcp: Pick<Catalog, 'mcpServers'>): Edge[] => {
  const edges: Edge[] = []
  const resolve = mcpResolver(mcp)
  for (const agent of agents) {
    const servers = new Map<string, Edge>()
    for (const tool of agent.tools ?? []) {
      const parsed = parseMcpToolName(tool)
      const evidence: EdgeEvidence = { path: agent.source.realPath, field: 'tools', excerpt: tool }
      if (!parsed) {
        edges.push({
          from: agent.id,
          to: `tool:claude-code/builtin/${tool}`,
          kind: 'agent-has-tool',
          layer: 'declared',
          evidence: [evidence],
        })
        continue
      }
      const server = resolve(parsed.server)
      const to = server?.id ?? unknownMcpId(parsed.server)
      const existing = servers.get(to)
      if (existing) {
        if (existing.evidence.length < 3) existing.evidence.push(evidence)
        continue
      }
      const edge: Edge = {
        from: agent.id,
        to,
        kind: 'agent-uses-mcp',
        layer: 'declared',
        evidence: [evidence],
        ...(server ? {} : { dangling: true }),
      }
      servers.set(to, edge)
      edges.push(edge)
    }
  }
  return edges
}

/** El grafo declarado completo: todo lo que los archivos afirman que debería pasar. */
export const buildDeclaredGraph = (full: Catalog): Edge[] => {
  // Solo lo que Claude Code carga: ni agentes archivados, ni lo tapado por otro ámbito, ni lo de
  // un plugin deshabilitado son origen o destino de ninguna relación.
  const catalog = liveCatalog(full)
  const agents = catalog.agents
  return [
    ...agentSkillEdges(agents, catalog.skills),
    ...commandEdges(catalog.commands, agents, catalog.skills),
    ...skillClientEdges(catalog.skills, agents),
    ...agentDelegationEdges(agents),
    // Los servidores desactivados siguen siendo destino válido de la cita: se resuelve contra todos.
    ...agentToolEdges(agents, full),
  ]
}
