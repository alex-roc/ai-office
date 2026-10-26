import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scanCatalogReport } from '../src/claude-code/catalog.ts'
import {
  mcpResolver,
  mcpTranscriptKey,
  normalizeMcpName,
  parseMcpToolName,
} from '../src/claude-code/mcp.ts'

const writeJson = (path: string, value: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** `CLAUDE_HOME` aparte: `.claude.json` vive dentro, como con `CLAUDE_CONFIG_DIR`. */
const sandbox = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aio-mcp-')))
  const home = join(root, 'claude')
  const proj = join(root, 'proj')
  mkdirSync(home, { recursive: true })
  mkdirSync(proj, { recursive: true })
  process.env.CLAUDE_HOME = home
  process.env.CLAUDE_MANAGED_DIR = join(root, 'managed')
  return { root, home, proj }
}

const SECRETS = ['sk-live-123', 'hunter2', 'tok_abc', 'user:pass', 'secret-arg']

test('los nombres de herramienta MCP se descomponen en servidor y herramienta', () => {
  assert.deepEqual(parseMcpToolName('mcp__github__create_issue'), {
    server: 'github',
    tool: 'create_issue',
  })
  assert.deepEqual(parseMcpToolName('mcp__github'), { server: 'github', tool: null })
  assert.deepEqual(parseMcpToolName('mcp__plugin_acme_search__find__deep'), {
    server: 'plugin_acme_search',
    tool: 'find__deep',
  })
  assert.equal(parseMcpToolName('Skill'), null)
  assert.equal(parseMcpToolName('mcp__'), null)
  assert.equal(parseMcpToolName('mcp____x'), null)
  assert.equal(normalizeMcpName('my server.v2'), 'my_server_v2')
})

test('de un servidor solo salen ejecutable, host y NOMBRES: nunca valores, argumentos ni URLs', async () => {
  const { home } = sandbox()
  writeJson(join(home, '.claude.json'), {
    mcpServers: {
      local: {
        type: 'stdio',
        command: '/Users/yo/.local/bin/uvx',
        args: ['--token', 'secret-arg'],
        env: { API_KEY: 'sk-live-123', OTRA: 'hunter2' },
      },
      remote: {
        type: 'http',
        url: 'https://user:pass@mcp.example.com:8443/v1/mcp?token=tok_abc',
        headers: { Authorization: 'Bearer sk-live-123' },
      },
      legado: { type: 'sse', url: 'https://sse.example.com/events' },
      raro: { type: 'carrier-pigeon' },
      // biome-ignore lint/suspicious/noTemplateCurlyInString: es la plantilla de variable de Claude Code
      plantilla: { url: '${MCP_URL}/mcp' },
    },
  })
  const { catalog } = await scanCatalogReport()
  const by = Object.fromEntries(catalog.mcpServers.map((m) => [m.name, m]))
  assert.deepEqual(
    [by.local?.transport, by.local?.command, by.local?.envKeys, by.local?.urlHost],
    ['stdio', 'uvx', ['API_KEY', 'OTRA'], undefined],
  )
  assert.deepEqual(
    [by.remote?.transport, by.remote?.urlHost, by.remote?.headerKeys, by.remote?.command],
    ['http', 'mcp.example.com:8443', ['Authorization'], undefined],
  )
  assert.equal(by.legado?.transport, 'sse')
  assert.equal(by.raro?.transport, 'unknown')
  assert.equal(by.plantilla?.urlHost, undefined, 'una plantilla no es una URL')
  assert.equal(by.plantilla?.transport, 'http')
  const dump = JSON.stringify(catalog)
  for (const secret of SECRETS) assert.equal(dump.includes(secret), false, `se coló «${secret}»`)
  assert.equal(dump.includes('/Users/yo'), false, 'ni el directorio del ejecutable')
})

test('ámbito usuario: user y managed; enabled es null porque la lista es por proyecto', async () => {
  const { home, root } = sandbox()
  writeJson(join(home, '.claude.json'), {
    mcpServers: { a: { command: 'a' } },
    projects: { '/otro': { mcpServers: { ajeno: { command: 'x' } } } },
  })
  writeJson(join(root, 'managed/managed-mcp.json'), {
    mcpServers: { corp: { url: 'https://c.example' } },
  })
  const { catalog } = await scanCatalogReport()
  assert.deepEqual(
    catalog.mcpServers.map((m) => [m.id, m.enabled]),
    [
      ['mcp:claude-code/user/a', null],
      ['mcp:claude-code/managed/corp', true],
    ],
  )
  assert.equal(catalog.mcpServers[1]?.source.readOnly, true)
})

test('ámbito proyecto: local, project y user, con su estado y disabledVia', async () => {
  const { home, proj } = sandbox()
  writeJson(join(home, '.claude.json'), {
    mcpServers: { u1: { command: 'u1' }, u2: { command: 'u2' } },
    projects: {
      [proj]: {
        mcpServers: { l1: { command: 'l1' } },
        disabledMcpServers: ['u2'],
      },
    },
  })
  writeJson(join(proj, '.mcp.json'), {
    mcpServers: { p1: { command: 'p1' }, p2: { command: 'p2' } },
  })
  writeJson(join(proj, '.claude/settings.local.json'), { disabledMcpjsonServers: ['p2'] })
  const { catalog } = await scanCatalogReport({ kind: 'project', path: proj })
  const by = Object.fromEntries(catalog.mcpServers.map((m) => [m.name, m]))
  assert.deepEqual(
    Object.entries(by).map(([n, m]) => [n, m.scope, m.enabled, m.disabledVia]),
    [
      ['l1', 'local', true, undefined],
      ['p1', 'project', true, undefined],
      ['p2', 'project', false, 'disabledMcpjsonServers'],
      ['u1', 'user', true, undefined],
      ['u2', 'user', false, 'disabledMcpServers'],
    ],
  )
  assert.deepEqual(by.p2?.disabledIn, ['local'])
})

test('precedencia por nombre: managed > local > project > user; el tapado dice quién lo tapa', async () => {
  const { home, root, proj } = sandbox()
  writeJson(join(home, '.claude.json'), {
    mcpServers: { x: { command: 'user-x' }, y: { command: 'user-y' } },
    projects: { [proj]: { mcpServers: { x: { command: 'local-x' } } } },
  })
  writeJson(join(proj, '.mcp.json'), {
    mcpServers: { x: { command: 'proj-x' }, y: { command: 'proj-y' } },
  })
  writeJson(join(root, 'managed/managed-mcp.json'), { mcpServers: { y: { command: 'corp-y' } } })
  const { catalog } = await scanCatalogReport({ kind: 'project', path: proj })
  const shadow = (id: string) => catalog.mcpServers.find((m) => m.id === id)
  assert.equal(shadow('mcp:claude-code/local/x')?.status, 'active')
  assert.deepEqual(
    [shadow('mcp:claude-code/project/x')?.status, shadow('mcp:claude-code/project/x')?.shadowedBy],
    ['shadowed', 'mcp:claude-code/local/x'],
  )
  assert.equal(shadow('mcp:claude-code/user/x')?.shadowedBy, 'mcp:claude-code/local/x')
  assert.equal(shadow('mcp:claude-code/managed/y')?.status, 'active')
  assert.equal(shadow('mcp:claude-code/project/y')?.shadowedBy, 'mcp:claude-code/managed/y')
  assert.equal(shadow('mcp:claude-code/user/y')?.shadowedBy, 'mcp:claude-code/managed/y')
})

test('servidores de plugin: prefijo, clave del transcript y plugin apagado', async () => {
  const { home } = sandbox()
  const root = join(home, 'plugins/cache/mk/acme-tools/1.0.0')
  writeJson(join(root, '.claude-plugin/plugin.json'), {
    name: 'acme-tools',
    mcpServers: { 'web.search': { command: 'srv', env: { K: 'sk-live-123' } } },
  })
  writeJson(join(root, '.mcp.json'), { plano: { command: 'otro' } })
  writeJson(join(home, 'plugins/installed_plugins.json'), {
    plugins: { 'acme-tools@mk': [{ installPath: root }] },
  })
  const off = await scanCatalogReport()
  assert.deepEqual(
    off.catalog.mcpServers.map((m) => [m.name, m.plugin, m.enabled]),
    [
      ['acme-tools:plano', 'acme-tools@mk', false],
      ['acme-tools:web.search', 'acme-tools@mk', false],
    ],
  )
  writeJson(join(home, 'settings.json'), { enabledPlugins: { 'acme-tools@mk': true } })
  const on = await scanCatalogReport()
  assert.deepEqual(
    on.catalog.mcpServers.map((m) => m.enabled),
    [null, null],
  )

  const search = on.catalog.mcpServers.find((m) => m.name === 'acme-tools:web.search')
  assert.ok(search)
  assert.equal(mcpTranscriptKey(search), 'plugin_acme-tools_web_search')
  const resolve = mcpResolver(on.catalog)
  assert.equal(resolve('plugin_acme-tools_web_search')?.id, search.id)
  assert.equal(resolve('plugin_acme-tools_plano')?.name, 'acme-tools:plano')
  assert.equal(JSON.stringify(on.catalog).includes('sk-live-123'), false)
})
