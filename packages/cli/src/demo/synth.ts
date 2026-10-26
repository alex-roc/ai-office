import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEMO_AGENTS, DEMO_COMMANDS, DEMO_SKILLS } from './catalog.ts'

/**
 * Escribe la instalación de demostración en un directorio, con la forma exacta de `~/.claude`:
 * catálogo (agentes, skills, comandos), `settings.json`, `history.jsonl` y transcripts con
 * subagentes en `projects/`.
 *
 * La actividad se sintetiza RELATIVA a `now`: el grado de una skill caduca a 90 días, así que una
 * demo con fechas fijas se iría apagando sola con el tiempo hasta quedar toda en gris. Lo demás es
 * determinista (PRNG con semilla fija): dos ejecuciones el mismo día dan la misma planta, que es
 * lo que hace falta para que las capturas del README no cambien en cada build.
 *
 * El reparto está pensado para que la demo enseñe el producto entero: agentes muy delegados y
 * otros que nunca han trabajado, skills acreditadas, en práctica, estrenadas y sin estrenar, y
 * comandos tecleados junto a otros que nadie ha ejecutado.
 */

const DAY = 24 * 60 * 60 * 1000

const PROJECTS = {
  web: '/home/dev/acme-web',
  api: '/home/dev/acme-api',
  warehouse: '/home/dev/data-warehouse',
  docs: '/home/dev/docs-site',
} as const
type ProjectKey = keyof typeof PROJECTS

/** `/home/dev/x` -> `-home-dev-x`, como nombra Claude Code sus carpetas de proyecto. */
const slugForCwd = (cwd: string): string => cwd.replace(/[/.]/g, '-')

/** mulberry32: pequeño, rápido y suficiente para repartir fechas sin repetirse. */
const prng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

interface Delegation {
  agent: string
  /** Skill -> en cuántas de sus sesiones la invocó el subagente. */
  skills: Record<string, number>
  sessions: number
  projects: ProjectKey[]
}

/** Quién trabaja y cuánto. Los agentes que no aparecen aquí no han sido delegados nunca. */
const DELEGATIONS: Delegation[] = [
  {
    agent: 'code-reviewer',
    sessions: 14,
    projects: ['web', 'api'],
    skills: { 'style-guide': 10, 'api-conventions': 4, 'team-context': 2 },
  },
  {
    agent: 'test-writer',
    sessions: 9,
    projects: ['web', 'api'],
    skills: { 'test-patterns': 7 },
  },
  {
    agent: 'data-analyst',
    sessions: 8,
    projects: ['warehouse'],
    skills: { 'sql-recipes': 8, 'chart-palette': 5 },
  },
  {
    agent: 'researcher',
    sessions: 5,
    projects: ['docs', 'api'],
    skills: { 'research-notes': 4 },
  },
  { agent: 'docs-writer', sessions: 4, projects: ['docs'], skills: { 'docs-voice': 2 } },
  {
    agent: 'release-manager',
    sessions: 4,
    projects: ['web', 'api'],
    skills: { changelog: 4, semver: 3, 'git-workflow': 1 },
  },
  { agent: 'security-auditor', sessions: 2, projects: ['api'], skills: { 'threat-model': 1 } },
  { agent: 'frontend-designer', sessions: 1, projects: ['web'], skills: { 'design-tokens': 1 } },
]

/** Skills que invoca el hilo principal directamente, sin delegar. */
const MAIN_THREAD: { skill: string; sessions: number; projects: ProjectKey[] }[] = [
  { skill: 'git-workflow', sessions: 12, projects: ['web', 'api', 'docs'] },
  { skill: 'style-guide', sessions: 3, projects: ['web', 'api'] },
  { skill: 'meeting-notes', sessions: 2, projects: ['docs'] },
  { skill: 'team-context', sessions: 1, projects: ['api'] },
]

/** Slash commands tecleados (history.jsonl). Los que no salen aquí no se han ejecutado nunca. */
const TYPED_COMMANDS: { command: string; times: number; args?: string }[] = [
  { command: 'review', times: 9, args: '#482' },
  { command: 'ship', times: 6 },
  { command: 'weekly-report', times: 5 },
  { command: 'research', times: 2, args: 'vector databases for search' },
]

/** Prompts corrientes: dan vocabulario al contraste de descriptions. */
const PROMPTS = [
  'review the diff before I merge it',
  'the checkout test is flaky again, can you fix it',
  'write a regression test for the pagination bug',
  'what changed in the api since last release',
  'make a chart of weekly active users by cohort',
  'why is this query so slow',
  'update the README with the new install steps',
  'compare the two libraries for markdown parsing',
  'bump the version and prepare the changelog',
  'is this endpoint safe against injection',
  'refactor the billing client to use the new sdk',
  'summarise the open issues about onboarding',
]

interface Session {
  id: string
  project: ProjectKey
  start: number
  mainSkills: string[]
  delegations: { agent: string; skills: string[] }[]
}

const uuid = (rand: () => number): string => {
  const hex = () =>
    Math.floor(rand() * 0x10000)
      .toString(16)
      .padStart(4, '0')
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`
}

const planSessions = (now: number, rand: () => number): Session[] => {
  const sessions: Session[] = []
  const projects = Object.keys(PROJECTS) as ProjectKey[]
  // Cuarenta y ocho sesiones repartidas en los últimos 80 días, más densas hacia hoy.
  for (let i = 0; i < 48; i++) {
    const daysAgo = Math.floor(80 * rand() ** 1.6)
    sessions.push({
      id: uuid(rand),
      project: projects[i % projects.length] ?? 'web',
      start: now - daysAgo * DAY - Math.floor(rand() * 10 * 60 * 60 * 1000),
      mainSkills: [],
      delegations: [],
    })
  }
  return sessions.sort((a, b) => a.start - b.start)
}

/** Elige una sesión del proyecto que todavía no tenga `taken`, para que cada uso cuente aparte. */
const pickSession = (
  sessions: Session[],
  project: ProjectKey,
  taken: (s: Session) => boolean,
  rand: () => number,
): Session => {
  const free = sessions.filter((s) => s.project === project && !taken(s))
  const pool = free.length ? free : sessions.filter((s) => s.project === project)
  return pool[Math.floor(rand() * pool.length)] ?? (sessions[0] as Session)
}

const assignActivity = (sessions: Session[], rand: () => number): void => {
  for (const d of DELEGATIONS) {
    for (let k = 0; k < d.sessions; k++) {
      const project = d.projects[k % d.projects.length] ?? 'web'
      const s = pickSession(
        sessions,
        project,
        (x) => x.delegations.some((y) => y.agent === d.agent),
        rand,
      )
      const skills = Object.entries(d.skills)
        .filter(([, n]) => k < n)
        .map(([name]) => name)
      s.delegations.push({ agent: d.agent, skills })
    }
  }
  for (const m of MAIN_THREAD) {
    for (let k = 0; k < m.sessions; k++) {
      const project = m.projects[k % m.projects.length] ?? 'web'
      const s = pickSession(sessions, project, (x) => x.mainSkills.includes(m.skill), rand)
      s.mainSkills.push(m.skill)
    }
  }
}

const frontmatter = (fields: Record<string, string | undefined>): string => {
  const lines = ['---']
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue
    // Comillas siempre en la description: lleva dos puntos y comillas dentro.
    lines.push(k === 'description' ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`)
  }
  lines.push('---', '')
  return lines.join('\n')
}

const writeCatalog = async (home: string): Promise<void> => {
  await mkdir(join(home, 'agents'), { recursive: true })
  await mkdir(join(home, 'commands'), { recursive: true })
  for (const a of DEMO_AGENTS) {
    const head = frontmatter({
      name: a.name,
      description: a.description,
      model: a.model,
      color: a.color,
      tools: a.tools,
    })
    await writeFile(join(home, 'agents', `${a.name}.md`), `${head}\n${a.body}\n`)
  }
  for (const s of DEMO_SKILLS) {
    const dir = join(home, 'skills', s.name)
    await mkdir(dir, { recursive: true })
    const head = frontmatter({ name: s.name, description: s.description })
    await writeFile(join(dir, 'SKILL.md'), `${head}\n${s.body}\n`)
  }
  for (const c of DEMO_COMMANDS) {
    const head = frontmatter({ description: c.description })
    await writeFile(join(home, 'commands', `${c.name}.md`), `${head}\n${c.body}\n`)
  }
}

const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({
  type: 'tool_use',
  id,
  name,
  input,
})

const writeTranscripts = async (
  home: string,
  sessions: Session[],
  rand: () => number,
): Promise<void> => {
  let toolCounter = 0
  const nextToolId = () => `toolu_demo${String(++toolCounter).padStart(5, '0')}`

  for (const s of sessions) {
    const cwd = PROJECTS[s.project]
    const projectDir = join(home, 'projects', slugForCwd(cwd))
    await mkdir(projectDir, { recursive: true })
    let t = s.start
    const tick = () => {
      t += Math.floor(30_000 + rand() * 240_000)
      return new Date(t).toISOString()
    }
    const base = { sessionId: s.id, cwd, version: '2.1.0' }
    const lines: string[] = []
    lines.push(
      JSON.stringify({
        ...base,
        type: 'user',
        timestamp: tick(),
        message: { role: 'user', content: PROMPTS[Math.floor(rand() * PROMPTS.length)] },
      }),
    )
    for (const skill of s.mainSkills) {
      lines.push(
        JSON.stringify({
          ...base,
          type: 'assistant',
          timestamp: tick(),
          message: { role: 'assistant', content: [toolUse(nextToolId(), 'Skill', { skill })] },
        }),
      )
    }
    for (const d of s.delegations) {
      const toolUseId = nextToolId()
      lines.push(
        JSON.stringify({
          ...base,
          type: 'assistant',
          timestamp: tick(),
          message: {
            role: 'assistant',
            content: [
              toolUse(toolUseId, 'Agent', {
                subagent_type: d.agent,
                description: `${d.agent} task`,
                prompt: 'See the conversation above.',
              }),
            ],
          },
        }),
      )
      // El subagente vive en su propio archivo, con un .meta.json hermano que dice quién es.
      const agentId = toolUseId.slice(-8)
      const subDir = join(projectDir, s.id, 'subagents')
      await mkdir(subDir, { recursive: true })
      await writeFile(
        join(subDir, `agent-${agentId}.meta.json`),
        `${JSON.stringify({ agentType: d.agent, description: `${d.agent} task`, toolUseId, spawnDepth: 1 })}\n`,
      )
      const subLines = d.skills.map((skill) =>
        JSON.stringify({
          ...base,
          isSidechain: true,
          type: 'assistant',
          timestamp: tick(),
          message: { role: 'assistant', content: [toolUse(nextToolId(), 'Skill', { skill })] },
        }),
      )
      await writeFile(join(subDir, `agent-${agentId}.jsonl`), `${subLines.join('\n')}\n`)
    }
    await writeFile(join(projectDir, `${s.id}.jsonl`), `${lines.join('\n')}\n`)
  }
}

const writeHistory = async (
  home: string,
  sessions: Session[],
  now: number,
  rand: () => number,
): Promise<void> => {
  const entries: { display: string; timestamp: number; project: string; sessionId: string }[] = []
  const at = (i: number) => sessions[Math.floor(rand() * sessions.length)] ?? sessions[i]
  for (const c of TYPED_COMMANDS) {
    for (let i = 0; i < c.times; i++) {
      const s = at(i)
      if (!s) continue
      entries.push({
        display: c.args ? `/${c.command} ${c.args}` : `/${c.command}`,
        timestamp: Math.min(now, s.start + 60_000),
        project: PROJECTS[s.project],
        sessionId: s.id,
      })
    }
  }
  sessions.forEach((s, i) => {
    entries.push({
      display: PROMPTS[i % PROMPTS.length] ?? '',
      timestamp: s.start,
      project: PROJECTS[s.project],
      sessionId: s.id,
    })
  })
  entries.sort((a, b) => a.timestamp - b.timestamp)
  const text = entries.map((e) => JSON.stringify({ ...e, pastedContents: {} })).join('\n')
  await writeFile(join(home, 'history.jsonl'), `${text}\n`)
}

/**
 * Crea la instalación de demostración en `home` (que debe estar vacío o no existir).
 * Devuelve `home` para encadenar.
 */
export const writeDemoHome = async (home: string, now = Date.now()): Promise<string> => {
  const rand = prng(20261026)
  await mkdir(home, { recursive: true })
  await writeCatalog(home)
  const sessions = planSessions(now, rand)
  assignActivity(sessions, rand)
  await writeTranscripts(home, sessions, rand)
  await writeHistory(home, sessions, now, rand)
  await writeFile(
    join(home, 'settings.json'),
    `${JSON.stringify({ cleanupPeriodDays: 90, permissions: { allow: [], deny: [] } }, null, 2)}\n`,
  )
  // Con CLAUDE_CONFIG_DIR, `.claude.json` vive dentro del directorio de configuración.
  await writeFile(join(home, '.claude.json'), '{}\n')
  return home
}
