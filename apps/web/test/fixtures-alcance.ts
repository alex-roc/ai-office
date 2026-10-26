import type { Activity, Agent, Command, McpServer, Plugin, Skill, Snapshot } from '../src/types.ts'

/** Fábricas de un snapshot con ámbitos, plugins y servidores MCP, para los tests de esta área. */

const fuente = { path: '/x', realPath: '/x', symlink: false }

export const agente = (name: string, extra: Partial<Agent> = {}): Agent =>
  ({
    id: `agent:claude-code/user/${name}`,
    kind: 'agent',
    name,
    description: 'trabajo general',
    status: 'active',
    problems: [],
    source: fuente,
    tools: null,
    model: null,
    color: null,
    preloadedSkills: [],
    bodyTokens: 10,
    scope: 'user',
    ...extra,
  }) as Agent

export const skill = (name: string, extra: Partial<Skill> = {}): Skill =>
  ({
    id: `skill:claude-code/user/${name}`,
    kind: 'skill',
    name,
    description: 'una skill',
    status: 'active',
    problems: [],
    source: fuente,
    disabledForModel: false,
    descriptionTokens: 20,
    bodyTokens: 50,
    dir: '/s',
    scope: 'user',
    ...extra,
  }) as Skill

export const comando = (name: string, extra: Partial<Command> = {}): Command =>
  ({
    id: `command:claude-code/user/${name}`,
    kind: 'command',
    name,
    description: 'un comando',
    status: 'active',
    problems: [],
    source: fuente,
    scope: 'user',
    ...extra,
  }) as Command

export const plugin = (name: string, extra: Partial<Plugin> = {}): Plugin => ({
  id: `plugin:claude-code/plugin/${name}@mkt`,
  key: `${name}@mkt`,
  name,
  marketplace: 'mkt',
  version: '1.0.0',
  installPath: `/p/${name}`,
  enabled: true,
  enabledSource: 'user',
  agents: [],
  skills: [],
  commands: [],
  mcpServers: [],
  descriptionTokens: 0,
  ...extra,
})

/** Una skill, un agente y un comando de un plugin, ya enlazados con él. */
export const piezasDePlugin = (nombre: string) => {
  const key = `${nombre}@mkt`
  const a = agente(`${nombre}:rev`, {
    id: `agent:claude-code/plugin/${nombre}:rev`,
    scope: 'plugin',
    plugin: key,
    source: { ...fuente, readOnly: true },
  })
  const s = skill(`${nombre}:tag`, {
    id: `skill:claude-code/plugin/${nombre}:tag`,
    scope: 'plugin',
    plugin: key,
    source: { ...fuente, readOnly: true },
    descriptionTokens: 30,
  })
  const c = comando(`${nombre}:go`, {
    id: `command:claude-code/plugin/${nombre}:go`,
    scope: 'plugin',
    plugin: key,
    source: { ...fuente, readOnly: true },
  })
  return { a, s, c }
}

export const servidor = (name: string, extra: Partial<McpServer> = {}): McpServer =>
  ({
    id: `mcp:claude-code/user/${name}`,
    kind: 'mcp',
    name,
    description: '',
    scope: 'user',
    status: 'active',
    problems: [],
    source: fuente,
    transport: 'stdio',
    envKeys: [],
    headerKeys: [],
    enabled: null,
    ...extra,
  }) as McpServer

export const uso = (id: string, uses: number, extra: Partial<Activity> = {}): Activity => ({
  id,
  name: id,
  uses,
  sessions: uses ? 1 : 0,
  projects: uses ? 1 : 0,
  lastUsedAt: uses ? 1 : null,
  weekly: [],
  grade: uses ? 'tried' : 'unused',
  active: uses > 0,
  ...extra,
})

export const snapshot = (parcial: {
  agents?: Agent[]
  skills?: Skill[]
  commands?: Command[]
  plugins?: Plugin[]
  mcpServers?: McpServer[]
  activity?: Snapshot['activity']
  salas?: Snapshot['planta']['salas']
  stats?: Partial<Snapshot['stats']>
}): Snapshot =>
  ({
    catalog: {
      agents: parcial.agents ?? [],
      skills: parcial.skills ?? [],
      commands: parcial.commands ?? [],
      plugins: parcial.plugins ?? [],
      mcpServers: parcial.mcpServers ?? [],
      roots: [],
    },
    edges: [],
    activity: parcial.activity ?? {},
    vocabularyGaps: {},
    planta: {
      salas: parcial.salas ?? [],
      archivoComun: [],
      deposito: [],
      tablonComun: [],
      tablonHuerfano: [],
    },
    mainThreadId: 'main',
    stats: { mainThreadSkills: 0, ...parcial.stats } as Snapshot['stats'],
  }) as Snapshot
