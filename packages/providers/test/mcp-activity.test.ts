import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scanCatalogReport } from '../src/claude-code/catalog.ts'
import { buildDeclaredGraph } from '../src/claude-code/graph.ts'
import { activityByTarget, buildProvenGraph, MAIN_THREAD_ID } from '../src/claude-code/proven.ts'
import { scanTranscripts } from '../src/claude-code/transcripts.ts'

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()

const line = (
  id: string,
  name: string,
  input: Record<string, unknown>,
  sessionId: string,
  cwd = '/p',
  daysAgo = 1,
) =>
  `${JSON.stringify({
    sessionId,
    cwd,
    timestamp: iso(daysAgo),
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })}\n`

const writeJson = (path: string, value: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const setup = async (pluginEnabled = true) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aio-mcpact-')))
  const home = join(root, 'claude')
  process.env.CLAUDE_HOME = home
  process.env.CLAUDE_MANAGED_DIR = join(root, 'managed')
  mkdirSync(join(home, 'agents'), { recursive: true })
  writeFileSync(
    join(home, 'agents/revisor.md'),
    '---\nname: revisor\ndescription: d\ntools: Read, mcp__github__create_issue, mcp__github__list_prs, mcp__nada__x\n---\ncuerpo\n',
  )
  writeJson(join(home, '.claude.json'), { mcpServers: { github: { command: 'gh-mcp' } } })

  const kit = join(home, 'plugins/cache/mk/kit/1.0.0')
  mkdirSync(join(kit, 'skills/lint'), { recursive: true })
  mkdirSync(join(kit, 'agents'), { recursive: true })
  mkdirSync(join(kit, 'commands'), { recursive: true })
  writeFileSync(join(kit, 'skills/lint/SKILL.md'), '---\nname: lint\ndescription: d\n---\nb\n')
  writeFileSync(join(kit, 'agents/helper.md'), '---\nname: helper\ndescription: d\n---\nb\n')
  writeFileSync(join(kit, 'commands/go.md'), '---\ndescription: d\n---\nb\n')
  writeJson(join(kit, '.mcp.json'), { mcpServers: { search: { command: 'srv' } } })
  writeJson(join(home, 'plugins/installed_plugins.json'), {
    plugins: { 'kit@mk': [{ installPath: kit }] },
  })
  writeJson(join(home, 'settings.json'), { enabledPlugins: { 'kit@mk': pluginEnabled } })

  const main = join(home, 'projects/-p/s1.jsonl')
  mkdirSync(join(home, 'projects/-p/s1/subagents'), { recursive: true })
  mkdirSync(join(home, 'projects/-q'), { recursive: true })
  writeFileSync(
    main,
    // `tu-1` aparece dos veces (sesión reanudada): cuenta una.
    line('tu-1', 'mcp__github__create_issue', { title: 'SECRET-TITLE' }, 's1') +
      line('tu-1', 'mcp__github__create_issue', { title: 'SECRET-TITLE' }, 's1') +
      line('tu-2', 'mcp__github__create_issue', {}, 's1', '/p', 10) +
      line('tu-3', 'mcp__plugin_kit_search__find', {}, 's1') +
      line('tu-4', 'mcp__claude_ai_Gmail__send', {}, 's1') +
      line('tu-5', 'Skill', { skill: 'kit:lint' }, 's1') +
      line('tu-6', 'Agent', { subagent_type: 'kit:helper' }, 's1') +
      line('tu-7', 'Read', { file_path: '/x' }, 's1'),
  )
  writeFileSync(
    join(home, 'projects/-q/s2.jsonl'),
    line('tu-8', 'mcp__github__list_prs', {}, 's2', '/q', 2),
  )
  // Un subagente llama al servidor en la misma sesión que el hilo principal.
  writeFileSync(
    join(home, 'projects/-p/s1/subagents/agent-a1.jsonl'),
    line('tu-9', 'mcp__github__list_prs', {}, 's1'),
  )
  writeFileSync(
    join(home, 'projects/-p/s1/subagents/agent-a1.meta.json'),
    JSON.stringify({ agentType: 'revisor' }),
  )
  const { catalog } = await scanCatalogReport()
  const scan = await scanTranscripts(join(home, 'projects'))
  return { catalog, scan, main }
}

test('el prefiltro recoge las herramientas MCP y solo esas, una vez por tool_use', async () => {
  const { scan, main } = await setup()
  const mcp = scan.invocations.filter((i) => i.type === 'mcp')
  assert.equal(mcp.length, 6) // tu-1 (una), 2, 3, 4, 8 y 9
  assert.deepEqual(
    mcp.map((i) => [i.target, i.tool]).filter(([t]) => t === 'plugin_kit_search'),
    [['plugin_kit_search', 'find']],
  )
  assert.ok(mcp.some((i) => i.file === main))
  // Lo que se guarda no incluye los argumentos de la llamada.
  assert.equal(JSON.stringify(scan.invocations).includes('SECRET-TITLE'), false)
})

test('actividad MCP: usos, sesiones, proyectos, semana, proyecto y herramienta', async () => {
  const { catalog, scan } = await setup()
  const act = activityByTarget(scan.invocations, catalog)
  const gh = act.get('mcp:claude-code/user/github')
  assert.equal(gh?.uses, 4) // create_issue ×2 y list_prs ×2 (uno desde un subagente)
  assert.deepEqual(gh?.byTool, { create_issue: 2, list_prs: 2 })
  assert.equal(gh?.sessions, 2, 's1 (hilo principal y subagente) y s2')
  assert.equal(gh?.projects, 2)
  assert.equal(gh?.weekly.length, 12)
  assert.equal(
    gh?.weekly.reduce((a, b) => a + b, 0),
    4,
  )
  assert.ok((gh?.lastUsedAt ?? 0) > Date.now() - 3 * 86_400_000)
  assert.deepEqual(gh?.byProject, { '/p': 3, '/q': 1 })
  assert.equal(gh?.grade, 'tried')

  // Un servidor que el catálogo no conoce (un conector) se cuenta aparte, sin inventarse un scope.
  assert.equal(act.get('mcp:claude-code/unknown/claude_ai_Gmail')?.uses, 1)
  // byTool es solo de servidores: ni una skill ni un plugin lo llevan.
  assert.equal(act.get('skill:claude-code/plugin/kit:lint')?.byTool, undefined)
})

test('las herramientas de un servidor de plugin cuentan para ese servidor', async () => {
  const { catalog, scan } = await setup()
  const act = activityByTarget(scan.invocations, catalog)
  assert.equal(act.get('mcp:claude-code/plugin/kit:search')?.uses, 1)
  assert.deepEqual(act.get('mcp:claude-code/plugin/kit:search')?.byTool, { find: 1 })
})

test('el uso de un plugin agrega skills, agentes, comandos y servidores (sesiones como conjunto)', async () => {
  const { catalog, scan } = await setup()
  const act = activityByTarget(scan.invocations, catalog, {
    commandUse: new Map([
      [
        'kit:go',
        {
          count: 2,
          lastUsedAt: Date.now() - 86_400_000,
          sessions: new Set(['s1', 's9']),
          projects: new Set(['/p']),
          events: [
            { ts: Date.now() - 86_400_000, project: '/p' },
            { ts: Date.now() - 2 * 86_400_000, project: '/p' },
          ],
        },
      ],
    ]),
  })
  assert.equal(act.get('skill:claude-code/plugin/kit:lint')?.uses, 1)
  assert.equal(act.get('agent:claude-code/plugin/kit:helper')?.uses, 1)
  assert.equal(act.get('command:claude-code/plugin/kit:go')?.uses, 2)
  const plugin = act.get('plugin:claude-code/plugin/kit@mk')
  assert.equal(plugin?.uses, 1 + 1 + 2 + 1, 'skill + agente + comando + servidor')
  assert.equal(plugin?.sessions, 2, 's1 y s9: la misma sesión en varias piezas es una')
  assert.equal(plugin?.weekly.length, 12)
  assert.equal(
    plugin?.weekly.reduce((a, b) => a + b, 0),
    plugin?.uses,
  )
  assert.equal(plugin?.name, 'kit@mk')
  assert.equal(act.get('plugin:claude-code/plugin/kit@mk')?.byTool, undefined)
})

test('lo de un plugin deshabilitado también recibe su historial', async () => {
  const { catalog, scan } = await setup(false)
  const act = activityByTarget(scan.invocations, catalog)
  assert.equal(catalog.plugins[0]?.enabled, false)
  assert.equal(act.get('skill:claude-code/plugin/kit:lint')?.uses, 1)
  assert.equal(act.get('plugin:claude-code/plugin/kit@mk')?.uses, 3)
})

test('aristas probadas agente→servidor: el hilo principal y los subagentes, con evidencia', async () => {
  const { catalog, scan } = await setup()
  const edges = buildProvenGraph(scan.invocations, catalog).filter(
    (e) => e.kind === 'agent-uses-mcp',
  )
  const gh = 'mcp:claude-code/user/github'
  const main = edges.find((e) => e.from === MAIN_THREAD_ID && e.to === gh)
  assert.equal(main?.layer, 'proven')
  assert.equal(main?.uses, 3)
  assert.deepEqual(main?.evidence.map((x) => x.excerpt).sort(), [
    'mcp__github__create_issue',
    'mcp__github__list_prs',
  ])
  assert.ok(main?.evidence.every((x) => x.path.endsWith('.jsonl')))
  const sub = edges.find((e) => e.from === 'agent:claude-code/user/revisor' && e.to === gh)
  assert.equal(sub?.uses, 1)
  assert.ok(edges.some((e) => e.to === 'mcp:claude-code/plugin/kit:search'))
  // Una herramienta de un servidor desconocido es una arista a un destino que no está en el catálogo.
  assert.ok(edges.some((e) => e.to === 'mcp:claude-code/unknown/claude_ai_Gmail'))
})

test('aristas declaradas: el tools: de un agente agrupa por servidor y marca el destino desconocido', async () => {
  const { catalog } = await setup()
  const edges = buildDeclaredGraph(catalog).filter((e) => e.kind === 'agent-uses-mcp')
  assert.equal(edges.length, 2)
  const gh = edges.find((e) => e.to === 'mcp:claude-code/user/github')
  assert.deepEqual(
    [gh?.layer, gh?.from, gh?.dangling, gh?.evidence.map((x) => x.excerpt)],
    [
      'declared',
      'agent:claude-code/user/revisor',
      undefined,
      ['mcp__github__create_issue', 'mcp__github__list_prs'],
    ],
  )
  assert.equal(gh?.evidence[0]?.field, 'tools')
  const unknown = edges.find((e) => e.to === 'mcp:claude-code/unknown/nada')
  assert.equal(unknown?.dangling, true)
  // Las herramientas que no son MCP siguen siendo agent-has-tool.
  assert.ok(buildDeclaredGraph(catalog).some((e) => e.kind === 'agent-has-tool'))
})
