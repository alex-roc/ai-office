import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scanCatalogReport } from '../src/claude-code/catalog.ts'
import { parseInstalledPlugins, readInstalledPlugins } from '../src/claude-code/plugins.ts'
import { combineEnabledPlugins } from '../src/claude-code/settings.ts'

const sandbox = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aio-plugins-')))
  const home = join(root, 'claude')
  mkdirSync(home, { recursive: true })
  process.env.CLAUDE_HOME = home
  process.env.CLAUDE_MANAGED_DIR = join(root, 'managed')
  return { root, home }
}

const writeJson = (path: string, value: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Un plugin en la caché con una skill, un comando, un agente (con subcarpeta) y un `.mcp.json`. */
const makePlugin = (home: string, name: string, marketplace = 'mk', version = '1.0.0') => {
  const root = join(home, 'plugins', 'cache', marketplace, name, version)
  mkdirSync(join(root, 'skills/lint'), { recursive: true })
  mkdirSync(join(root, 'commands'), { recursive: true })
  mkdirSync(join(root, 'agents/review'), { recursive: true })
  writeFileSync(
    join(root, 'skills/lint/SKILL.md'),
    '---\nname: lint\ndescription: lints things\n---\nbody\n',
  )
  writeFileSync(join(root, 'commands/go.md'), '---\ndescription: go\n---\nbody\n')
  writeFileSync(
    join(root, 'agents/helper.md'),
    '---\nname: helper\ndescription: helps\n---\nbody\n',
  )
  writeFileSync(join(root, 'agents/review/security.md'), '---\ndescription: audits\n---\nbody\n')
  writeJson(join(root, '.mcp.json'), {
    mcpServers: { search: { command: '/opt/bin/search-server', args: ['--key', 'SECRET'] } },
  })
  return root
}

test('installed_plugins.json: v1 (claves de primer nivel) y v2 (bajo plugins, con lista)', () => {
  const v1 = parseInstalledPlugins({
    'a@mk': { version: '1.0.0', installPath: '/x/a' },
    'b@mk': { version: '2.0.0', installPath: '/x/b' },
  })
  assert.deepEqual(
    v1.map((i) => [i.key, i.version, i.installPath]),
    [
      ['a@mk', '1.0.0', '/x/a'],
      ['b@mk', '2.0.0', '/x/b'],
    ],
  )
  const v2 = parseInstalledPlugins({
    version: 2,
    plugins: {
      'a@mk': [
        { scope: 'user', installPath: '/x/a', version: '1.0.0' },
        { scope: 'project', projectPath: '/p', installPath: '/x/a2', version: '1.1.0' },
      ],
    },
  })
  assert.deepEqual(
    v2.map((i) => [i.key, i.scope, i.projectPath]),
    [
      ['a@mk', 'user', undefined],
      ['a@mk', 'project', '/p'],
    ],
  )
  // Basura: ni revienta ni inventa plugins.
  assert.deepEqual(parseInstalledPlugins(null), [])
  assert.deepEqual(parseInstalledPlugins([1, 2]), [])
  assert.deepEqual(parseInstalledPlugins({ version: 2, plugins: { 'a@mk': ['x', 3] } }), [])
})

test('sin installed_plugins.json: no hay plugins y no es un error', async () => {
  sandbox()
  assert.equal(await readInstalledPlugins(), null)
  const { catalog, errors } = await scanCatalogReport()
  assert.deepEqual(catalog.plugins, [])
  assert.deepEqual(errors, [])
})

test('un installed_plugins.json roto se anota y se trabaja sin plugins', async () => {
  const { home } = sandbox()
  mkdirSync(join(home, 'plugins'), { recursive: true })
  writeFileSync(join(home, 'plugins/installed_plugins.json'), '{no es json')
  const { catalog, errors } = await scanCatalogReport()
  assert.deepEqual(catalog.plugins, [])
  assert.ok(errors.some((e) => e.includes('installed_plugins.json')))
})

test('enabledPlugins: gana la fuente de mayor precedencia (managed true fuerza, false bloquea)', () => {
  const file = (source: 'user' | 'project' | 'local' | 'managed', value: unknown) => ({
    source,
    path: `/${source}`,
    data: { enabledPlugins: value } as Record<string, unknown>,
  })
  const merged = combineEnabledPlugins([
    file('user', { 'a@mk': true, 'b@mk': true, 'c@mk': false }),
    file('project', { 'a@mk': false, 'c@mk': true }),
    file('local', { 'a@mk': true }),
    file('managed', { 'b@mk': false, 'basura@mk': 'sí' }),
  ])
  assert.deepEqual(merged.get('a@mk'), { enabled: true, source: 'local' })
  assert.deepEqual(merged.get('b@mk'), { enabled: false, source: 'managed' })
  assert.deepEqual(merged.get('c@mk'), { enabled: true, source: 'project' })
  assert.equal(merged.has('basura@mk'), false, 'un valor que no es booleano se ignora')
})

test('un plugin trae sus agentes, skills, comandos y servidores, con prefijo y de solo lectura', async () => {
  const { home } = sandbox()
  const root = makePlugin(home, 'kit')
  writeJson(join(home, 'plugins/installed_plugins.json'), {
    version: 2,
    plugins: { 'kit@mk': [{ scope: 'user', installPath: root, version: '1.0.0' }] },
  })
  writeJson(join(home, 'settings.json'), { enabledPlugins: { 'kit@mk': true } })

  const { catalog, errors } = await scanCatalogReport()
  assert.deepEqual(errors, [])
  const [plugin] = catalog.plugins
  assert.equal(plugin?.id, 'plugin:claude-code/plugin/kit@mk')
  assert.deepEqual(
    [plugin?.name, plugin?.marketplace, plugin?.version, plugin?.enabled, plugin?.enabledSource],
    ['kit', 'mk', '1.0.0', true, 'user'],
  )
  assert.ok((plugin?.descriptionTokens ?? 0) > 0)

  const skill = catalog.skills.find((s) => s.scope === 'plugin')
  assert.equal(skill?.name, 'kit:lint')
  assert.equal(skill?.id, 'skill:claude-code/plugin/kit:lint')
  assert.equal(skill?.plugin, 'kit@mk')
  assert.equal(skill?.source.readOnly, true)
  assert.equal(catalog.commands.find((c) => c.scope === 'plugin')?.name, 'kit:go')
  // Las subcarpetas de agentes añaden segmentos al nombre.
  assert.deepEqual(
    catalog.agents.filter((a) => a.scope === 'plugin').map((a) => a.name),
    ['kit:helper', 'kit:review:security'],
  )
  assert.deepEqual(plugin?.skills, [skill?.id])
  assert.equal(plugin?.agents.length, 2)
  assert.deepEqual(plugin?.mcpServers, ['mcp:claude-code/plugin/kit:search'])

  const server = catalog.mcpServers.find((m) => m.scope === 'plugin')
  assert.equal(server?.command, 'search-server', 'solo el ejecutable')
  assert.equal(JSON.stringify(catalog).includes('SECRET'), false, 'ni los argumentos')
})

test('un plugin sin entrada en enabledPlugins está deshabilitado; uno de otro proyecto no es de este ámbito', async () => {
  const { home, root } = sandbox()
  const kit = makePlugin(home, 'kit')
  const other = makePlugin(home, 'other')
  const proj = join(root, 'proj')
  mkdirSync(join(proj, '.claude'), { recursive: true })
  writeJson(join(home, 'plugins/installed_plugins.json'), {
    version: 2,
    plugins: {
      'kit@mk': [{ scope: 'user', installPath: kit, version: '1.0.0' }],
      'other@mk': [
        {
          scope: 'project',
          projectPath: join(root, 'elsewhere'),
          installPath: other,
          version: '1.0.0',
        },
      ],
    },
  })

  const user = await scanCatalogReport()
  assert.deepEqual(
    user.catalog.plugins.map((p) => [p.key, p.enabled, p.enabledSource]),
    [['kit@mk', false, null]],
  )
  // Sus entidades se listan igualmente (con `plugin`), para poder enseñarlas.
  assert.ok(user.catalog.skills.some((s) => s.name === 'kit:lint'))

  const project = await scanCatalogReport({ kind: 'project', path: proj })
  assert.deepEqual(
    project.catalog.plugins.map((p) => p.key),
    ['kit@mk'],
    'la instalación de otro proyecto no cuenta',
  )
})

test('enabledPlugins de project y local solo cuentan con ámbito de proyecto', async () => {
  const { home, root } = sandbox()
  const kit = makePlugin(home, 'kit')
  const proj = join(root, 'proj')
  writeJson(join(home, 'plugins/installed_plugins.json'), {
    plugins: { 'kit@mk': [{ scope: 'user', installPath: kit }] },
  })
  writeJson(join(home, 'settings.json'), { enabledPlugins: { 'kit@mk': true } })
  writeJson(join(proj, '.claude/settings.local.json'), { enabledPlugins: { 'kit@mk': false } })

  const user = await scanCatalogReport()
  assert.equal(user.catalog.plugins[0]?.enabled, true)
  const inProject = await scanCatalogReport({ kind: 'project', path: proj })
  assert.deepEqual(
    [inProject.catalog.plugins[0]?.enabled, inProject.catalog.plugins[0]?.enabledSource],
    [false, 'local'],
  )
})

test('un plugin gestionado manda sobre el usuario', async () => {
  const { home, root } = sandbox()
  const kit = makePlugin(home, 'kit')
  writeJson(join(home, 'plugins/installed_plugins.json'), {
    plugins: { 'kit@mk': [{ installPath: kit }] },
  })
  writeJson(join(home, 'settings.json'), { enabledPlugins: { 'kit@mk': true } })
  writeJson(join(root, 'managed/managed-settings.json'), { enabledPlugins: { 'kit@mk': false } })
  const { catalog } = await scanCatalogReport()
  assert.deepEqual(
    [catalog.plugins[0]?.enabled, catalog.plugins[0]?.enabledSource],
    [false, 'managed'],
  )
})
