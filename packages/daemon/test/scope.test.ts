import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { type ServerHandle, startServer } from '../src/server.ts'
import type { Snapshot } from '../src/snapshot.ts'

// El socket de ingesta (AF_UNIX) tiene un límite de ruta de ~104 bytes: un HOME corto bajo /tmp.
const root = realpathSync(mkdtempSync('/tmp/aio-scp-'))
const home = join(root, 'h')
const proj = join(root, 'proj')
process.env.CLAUDE_HOME = home
process.env.CLAUDE_MANAGED_DIR = join(root, 'managed')

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const put = (path: string, text: string) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}
const doc = (name: string) => `---\nname: ${name}\ndescription: d ${name}\n---\ncuerpo\n`

const CLAUDE_JSON = json({
  mcpServers: { github: { command: 'gh-mcp', env: { TOKEN: 'sk-live-123' } } },
  projects: { [proj]: { allowedTools: [], disabledMcpServers: [] } },
})
const SETTINGS = json({ cleanupPeriodDays: 30, enabledPlugins: { 'kit@mk': true } })

put(join(home, 'agents/user-agent.md'), doc('user-agent'))
put(join(home, '.claude.json'), CLAUDE_JSON)
put(join(home, 'settings.json'), SETTINGS)
put(join(proj, '.claude/agents/proj-agent.md'), doc('proj-agent'))
put(
  join(proj, '.mcp.json'),
  json({ mcpServers: { figma: { type: 'http', url: 'https://f.example/mcp' } } }),
)
const kit = join(home, 'plugins/cache/mk/kit/1.0.0')
put(join(kit, 'skills/lint/SKILL.md'), doc('lint'))
put(
  join(home, 'plugins/installed_plugins.json'),
  json({ plugins: { 'kit@mk': [{ installPath: kit }] } }),
)

let server: ServerHandle
test.before(async () => {
  server = await startServer(0)
})
test.after(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const api = (path: string, body?: unknown) =>
  fetch(`http://127.0.0.1:${server.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      authorization: `Bearer ${server.token}`,
      'x-ai-office': '1',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const snapshot = async (): Promise<Snapshot> =>
  (await api('/api/snapshot')).json() as Promise<Snapshot>
const read = (path: string) => readFileSync(path, 'utf8')

interface ErrBody {
  code: string
  reason: string
}
const plan = async (kind: string, entityId: string, value?: unknown) => {
  const res = await api('/api/mutations/plan', { kind, entityId, value })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & ErrBody }
}
const mutate = async (kind: string, entityId: string, value?: unknown) => {
  const p = await plan(kind, entityId, value)
  assert.equal(p.status, 200, `plan ${kind}: ${JSON.stringify(p.body)}`)
  const res = await api('/api/mutations/apply', { kind, entityId, value, etag: p.body.etag })
  assert.equal(res.status, 200, `apply ${kind}: ${await res.clone().text()}`)
  return p.body as unknown as {
    diff: string
    warningDetails: { code: string }[]
    path: string
    etag: string
  }
}

const PLUGIN = 'plugin:claude-code/plugin/kit@mk'
const FIGMA = 'mcp:claude-code/project/figma'
const GITHUB = 'mcp:claude-code/user/github'

test('arranca en ámbito usuario: plugins y proyectos conocidos sí, lo del proyecto no', async () => {
  const snap = await snapshot()
  assert.deepEqual(snap.scope, { kind: 'user' })
  assert.deepEqual(
    snap.knownProjects.map((p) => [p.path, p.exists, p.hasClaudeDir]),
    [[proj, true, true]],
  )
  assert.ok(!snap.catalog.agents.some((a) => a.scope === 'project'))
  assert.deepEqual(
    snap.catalog.plugins.map((p) => [p.key, p.enabled, p.enabledSource]),
    [['kit@mk', true, 'user']],
  )
  assert.equal(snap.stats.plugins, 1)
  assert.equal(snap.stats.pluginsEnabled, 1)
  assert.equal(snap.stats.pluginsUnused, 1)
  assert.ok(snap.stats.pluginDescriptionTokens > 0)
  // Las skills de plugin no cuentan como skills propias.
  assert.equal(snap.stats.skills, 0)
  assert.equal(snap.catalog.skills.filter((s) => s.scope === 'plugin').length, 1)
  assert.deepEqual(
    snap.catalog.mcpServers.map((m) => [m.id, m.enabled]),
    [[GITHUB, null]],
  )
  assert.deepEqual([snap.stats.mcpServers, snap.stats.mcpUnused], [1, 1])
  assert.equal(JSON.stringify(snap).includes('sk-live-123'), false, 'ningún secreto en el snapshot')
})

test('GET /api/config: vacía, con el ámbito efectivo y su origen', async () => {
  const body = (await (await api('/api/config')).json()) as Record<string, unknown>
  assert.deepEqual(body.config, {})
  assert.deepEqual([body.scope, body.scopeSource], [{ kind: 'user' }, 'default'])
  assert.equal(body.path, join(home, 'ai-office/config.json'))
})

test('en ámbito usuario, lo que solo existe en un proyecto se rechaza con needs-project', async () => {
  const p = await plan('mcp.disable', GITHUB)
  assert.deepEqual(
    [p.status, p.body.code, p.body.reason],
    [400, 'invalid-request', 'needs-project'],
  )
  const local = await plan('plugin.disable', PLUGIN, { scope: 'local' })
  assert.equal(local.body.reason, 'needs-project')
  const badScope = await plan('plugin.disable', PLUGIN, { scope: 'planet' })
  assert.equal(badScope.body.reason, 'invalid-scope')
  const create = await api('/api/entities/plan', {
    kind: 'agent',
    name: 'nuevo',
    description: 'd',
    scope: 'project',
  })
  assert.equal(((await create.json()) as ErrBody).reason, 'needs-project')
})

test('plugin.disable en ámbito usuario: escribe settings.json, con aviso de recarga, y vuelve byte a byte', async () => {
  const p = await mutate('plugin.disable', PLUGIN)
  assert.deepEqual(
    p.warningDetails.map((w) => w.code),
    ['reload-needed'],
  )
  assert.equal(p.path, join(home, 'settings.json'))
  assert.equal(
    read(join(home, 'settings.json')),
    SETTINGS.replace('"kit@mk": true', '"kit@mk": false'),
  )
  let snap = await snapshot()
  assert.equal(snap.catalog.plugins[0]?.enabled, false)
  assert.equal(snap.stats.pluginsEnabled, 0)
  assert.equal(snap.stats.pluginDescriptionTokens, 0, 'deshabilitado: no cuenta su coste')

  await mutate('plugin.enable', PLUGIN)
  assert.equal(read(join(home, 'settings.json')), SETTINGS)
  snap = await snapshot()
  assert.equal(snap.catalog.plugins[0]?.enabled, true)
})

test('las skills de un plugin son de solo lectura', async () => {
  const snap = await snapshot()
  const skill = snap.catalog.skills.find((s) => s.scope === 'plugin')
  assert.ok(skill)
  assert.equal(skill.source.readOnly, true)
  const p = await plan('skill.description', skill.id, 'otra')
  assert.deepEqual([p.status, p.body.reason], [400, 'read-only'])
  const res = await api('/api/mutations/apply', {
    kind: 'skill.body',
    entityId: skill.id,
    value: 'x\n',
    etag: 'x',
  })
  assert.equal(((await res.json()) as ErrBody).reason, 'read-only')
})

test('POST /api/config: validación estricta', async () => {
  for (const [body, reason] of [
    [{ scope: 'team' }, 'invalid-config'],
    [{ colour: 'red' }, 'invalid-config'],
    [{ show: { robots: true } }, 'invalid-config'],
    [{ lang: 'fr' }, 'invalid-config'],
    [{ project: 'relativa' }, 'invalid-config'],
    [{ scope: 'project' }, 'needs-project'],
    [{ project: join(root, 'no-existe') }, 'project-not-found'],
    [[], 'invalid-config'],
  ] as const) {
    const res = await api('/api/config', body)
    assert.ok(res.status === 400 || res.status === 404, JSON.stringify(body))
    assert.equal(((await res.json()) as ErrBody).reason, reason, JSON.stringify(body))
  }
  assert.ok(!existsSync(join(home, 'ai-office/config.json')), 'una petición inválida no escribe')
})

test('POST /api/config: show y lang no tocan el ámbito; scope/project lo cambian en caliente', async () => {
  const before = await snapshot()
  const shown = (await (await api('/api/config', { show: { mcp: false }, lang: 'es' })).json()) as {
    config: unknown
    changed: boolean
    scope: unknown
  }
  assert.deepEqual(shown.config, { show: { mcp: false }, lang: 'es' })
  assert.equal(shown.changed, true)
  assert.deepEqual(shown.scope, { kind: 'user' })
  assert.equal(
    (await snapshot()).stats.builtAt,
    before.stats.builtAt,
    'sin reconstruir el snapshot',
  )

  const res = await api('/api/config', { scope: 'project', project: proj })
  const body = (await res.json()) as { scope: unknown; scopeSource: string; config: unknown }
  assert.deepEqual(body.scope, { kind: 'project', path: proj })
  assert.equal(body.scopeSource, 'config')
  assert.deepEqual(body.config, {
    scope: 'project',
    project: proj,
    show: { mcp: false },
    lang: 'es',
  })
  const audit = read(join(home, 'ai-office/logs/audit.ndjson'))
  assert.equal(audit.split('\n').filter((l) => l.includes('"config.set"')).length, 2)

  const snap = await snapshot()
  assert.deepEqual(snap.scope, { kind: 'project', path: proj })
  assert.ok(snap.catalog.agents.some((a) => a.id === 'agent:claude-code/project/proj-agent'))
  assert.equal(snap.stats.agents, 2, 'usuario + proyecto')
  assert.ok(snap.catalog.mcpServers.some((m) => m.id === FIGMA))
  assert.equal(
    snap.catalog.mcpServers.find((m) => m.id === GITHUB)?.enabled,
    true,
    'con proyecto sí se sabe si está activo',
  )
  assert.ok(snap.catalog.roots.includes(join(proj, '.claude/agents')))

  // GET refleja lo mismo; y quitar scope/project con null vuelve al usuario.
  assert.deepEqual(((await (await api('/api/config')).json()) as { scope: unknown }).scope, {
    kind: 'project',
    path: proj,
  })
})

test('ámbito proyecto: entidades del proyecto editables y creación con scope project', async () => {
  const snap = await snapshot()
  const agent = snap.catalog.agents.find((a) => a.scope === 'project')
  assert.ok(agent)
  await mutate('agent.color', agent.id, 'blue')
  assert.match(read(join(proj, '.claude/agents/proj-agent.md')), /^color: blue$/m)

  const req = { kind: 'skill', name: 'nueva', description: 'Hace algo', scope: 'project' }
  const planned = (await (await api('/api/entities/plan', req)).json()) as { path: string }
  assert.equal(planned.path, join(proj, '.claude/skills/nueva/SKILL.md'))
  const created = (await (await api('/api/entities/create', req)).json()) as {
    id: string
    path: string
  }
  assert.equal(created.id, 'skill:claude-code/project/nueva')
  assert.ok(existsSync(created.path))
  // Sin `scope`, lo nuevo sigue naciendo en el usuario.
  const user = (await (
    await api('/api/entities/create', { kind: 'command', name: 'cmd-user', description: 'd' })
  ).json()) as { id: string }
  assert.equal(user.id, 'command:claude-code/user/cmd-user')
  assert.ok(existsSync(join(home, 'commands/cmd-user.md')))
  const again = await api('/api/entities/create', req)
  assert.equal(((await again.json()) as ErrBody).reason, 'file-exists')

  const after = await snapshot()
  assert.ok(after.catalog.skills.some((s) => s.id === 'skill:claude-code/project/nueva'))
  const audit = read(join(home, 'ai-office/logs/audit.ndjson'))
  assert.match(audit, /create:skill","entityId":"skill:claude-code\/project\/nueva"/)
})

test('plugin.disable en ámbito proyecto: crea settings.local.json (y su carpeta) y gana a user', async () => {
  const p = await plan('plugin.disable', PLUGIN, { scope: 'local' })
  assert.equal(p.body.etag, 'absent')
  await mutate('plugin.disable', PLUGIN, { scope: 'local' })
  assert.equal(
    read(join(proj, '.claude/settings.local.json')),
    json({ enabledPlugins: { 'kit@mk': false } }),
  )
  const snap = await snapshot()
  assert.deepEqual(
    [snap.catalog.plugins[0]?.enabled, snap.catalog.plugins[0]?.enabledSource],
    [false, 'local'],
  )
  // Habilitarlo en `project` no sirve mientras `local` lo bloquea: se escribe, pero se avisa.
  const warn = await plan('plugin.enable', PLUGIN, { scope: 'project' })
  const details = warn.body.warningDetails as { code: string; params?: { source: string } }[]
  assert.deepEqual(
    details.map((w) => w.code),
    ['reload-needed', 'overridden'],
  )
  assert.equal(details[1]?.params?.source, 'local')
  // Y en `user`, que ya lo tiene a true, no hay nada que cambiar.
  const same = await plan('plugin.enable', PLUGIN, { scope: 'user' })
  assert.equal(same.body.changed, false)
  await mutate('plugin.enable', PLUGIN, { scope: 'local' })
  assert.equal((await snapshot()).catalog.plugins[0]?.enabled, true)
})

test('mcp.disable de un servidor de .mcp.json: settings.local.json del proyecto, y activarlo lo deja como estaba', async () => {
  const file = join(proj, '.claude/settings.local.json')
  const original = read(file)
  await mutate('mcp.disable', FIGMA)
  assert.deepEqual(JSON.parse(read(file)).disabledMcpjsonServers, ['figma'])
  let figma = (await snapshot()).catalog.mcpServers.find((m) => m.id === FIGMA)
  assert.deepEqual(
    [figma?.enabled, figma?.disabledVia, figma?.disabledIn],
    [false, 'disabledMcpjsonServers', ['local']],
  )
  assert.equal((await snapshot()).stats.mcpServers, 1, 'el desactivado no cuenta como cargado')

  await mutate('mcp.enable', FIGMA)
  assert.equal(read(file), original)
  figma = (await snapshot()).catalog.mcpServers.find((m) => m.id === FIGMA)
  assert.equal(figma?.enabled, true)
})

test('mcp.disable de un servidor de usuario: ~/.claude.json, solo su lista, byte a byte', async () => {
  const file = join(home, '.claude.json')
  assert.equal(read(file), CLAUDE_JSON)
  const p = await mutate('mcp.disable', GITHUB)
  assert.equal(p.path, file)
  assert.deepEqual(JSON.parse(read(file)).projects[proj].disabledMcpServers, ['github'])
  const github = (await snapshot()).catalog.mcpServers.find((m) => m.id === GITHUB)
  assert.deepEqual([github?.enabled, github?.disabledVia], [false, 'disabledMcpServers'])
  assert.equal(JSON.stringify(await snapshot()).includes('sk-live-123'), false)

  await mutate('mcp.enable', GITHUB)
  assert.equal(read(file), CLAUDE_JSON)
})

test('~/.claude.json con otro formato: unexpected-format y no se toca', async () => {
  const file = join(home, '.claude.json')
  const mini = JSON.stringify(JSON.parse(CLAUDE_JSON))
  writeFileSync(file, mini)
  const p = await plan('mcp.disable', GITHUB)
  assert.deepEqual(
    [p.status, p.body.code, p.body.reason],
    [400, 'invalid-request', 'unexpected-format'],
  )
  const res = await api('/api/mutations/apply', {
    kind: 'mcp.disable',
    entityId: GITHUB,
    etag: 'x',
  })
  assert.ok([400, 409].includes(res.status))
  assert.equal(read(file), mini)
  writeFileSync(file, CLAUDE_JSON)
})

test('mcp.enable de un servidor desactivado en VARIOS settings lo quita de todos, con un diff por archivo', async () => {
  const userFile = join(home, 'settings.json')
  const projFile = join(proj, '.claude/settings.json')
  const localFile = join(proj, '.claude/settings.local.json')
  const [userBefore, localBefore] = [read(userFile), read(localFile)]
  // Desactivado en tres sitios (y `otro` en uno, que no se debe tocar).
  writeFileSync(userFile, json({ ...JSON.parse(userBefore), disabledMcpjsonServers: ['figma'] }))
  put(projFile, json({ disabledMcpjsonServers: ['figma'] }))
  writeFileSync(localFile, json({ disabledMcpjsonServers: ['figma', 'otro'] }))
  await api('/api/refresh', {})
  const figma = (await snapshot()).catalog.mcpServers.find((m) => m.id === FIGMA)
  assert.deepEqual([figma?.enabled, figma?.disabledIn], [false, ['user', 'project', 'local']])

  const p = (await plan('mcp.enable', FIGMA)).body as unknown as {
    etag: string
    changed: boolean
    diff: string
    files: { scope: string; path: string; changed: boolean; diff: string }[]
  }
  assert.deepEqual(
    p.files.map((f) => [f.scope, f.path, f.changed]),
    [
      ['user', userFile, true],
      ['project', projFile, true],
      ['local', localFile, true],
    ],
  )
  assert.match(p.etag, /^multi:/)
  assert.equal(p.changed, true)
  for (const f of p.files)
    assert.ok(p.diff.includes(f.diff), 'el diff del plan lleva el de cada archivo')

  // `value.scope` explícito sigue limitando a un solo archivo: plan normal, sin `files`.
  const one = (await plan('mcp.enable', FIGMA, { scope: 'project' })).body
  assert.equal(one.files, undefined)
  assert.doesNotMatch(String(one.etag), /^multi:/)

  // Un archivo cambia entre el plan y el apply: 409 y NO se escribe ninguno.
  writeFileSync(
    userFile,
    `${read(userFile)}
`,
  )
  const stale = await api('/api/mutations/apply', {
    kind: 'mcp.enable',
    entityId: FIGMA,
    etag: p.etag,
  })
  assert.equal(stale.status, 409)
  assert.deepEqual(JSON.parse(read(projFile)).disabledMcpjsonServers, ['figma'])

  const fresh = (await plan('mcp.enable', FIGMA)).body
  const res = await api('/api/mutations/apply', {
    kind: 'mcp.enable',
    entityId: FIGMA,
    etag: fresh.etag,
  })
  assert.equal(res.status, 200)
  const applied = (await res.json()) as { files: { path: string }[] }
  assert.deepEqual(
    applied.files.map((f) => f.path),
    [userFile, projFile, localFile],
  )
  assert.equal(JSON.parse(read(userFile)).disabledMcpjsonServers, undefined)
  assert.equal(JSON.parse(read(projFile)).disabledMcpjsonServers, undefined)
  assert.deepEqual(JSON.parse(read(localFile)).disabledMcpjsonServers, ['otro'])
  assert.equal((await snapshot()).catalog.mcpServers.find((m) => m.id === FIGMA)?.enabled, true)

  writeFileSync(userFile, userBefore)
  writeFileSync(localFile, localBefore)
  rmSync(projFile)
  await api('/api/refresh', {})
})

test('mcp.* con ~/.claude.json ausente: not-found / claude-json-missing, y no se crea', async () => {
  const file = join(home, '.claude.json')
  rmSync(file)
  for (const kind of ['mcp.disable', 'mcp.enable']) {
    const p = await plan(kind, GITHUB)
    assert.deepEqual(
      [p.status, p.body.code, p.body.reason],
      [404, 'not-found', 'claude-json-missing'],
    )
    assert.match(String(p.body.error), /Claude Code has not created it/)
    const res = await api('/api/mutations/apply', { kind, entityId: GITHUB, etag: 'absent' })
    assert.equal(((await res.json()) as ErrBody).reason, 'claude-json-missing')
  }
  assert.equal(existsSync(file), false, 'no se inventa un archivo que es de Claude Code')
  writeFileSync(file, CLAUDE_JSON)
})

test('un conflicto de etag en un plugin es 409', async () => {
  const p = await plan('plugin.disable', PLUGIN)
  writeFileSync(join(home, 'settings.json'), `${SETTINGS}\n`)
  const res = await api('/api/mutations/apply', {
    kind: 'plugin.disable',
    entityId: PLUGIN,
    etag: p.body.etag,
  })
  assert.equal(res.status, 409)
  assert.equal(((await res.json()) as { code: string }).code, 'conflict')
  writeFileSync(join(home, 'settings.json'), SETTINGS)
})

test('entidades desconocidas: not-found', async () => {
  for (const [kind, id] of [
    ['plugin.disable', 'plugin:claude-code/plugin/nada@mk'],
    ['mcp.disable', 'mcp:claude-code/user/nada'],
  ]) {
    const p = await plan(kind as string, id as string)
    assert.deepEqual([p.status, p.body.code, p.body.reason], [404, 'not-found', 'entity-not-found'])
  }
})

test('el snapshot dice de qué mide la actividad según el ámbito', async () => {
  const over = (await snapshot()).measuredOver
  assert.deepEqual([over.kind, over.kind === 'project' ? over.path : ''], ['project', proj])
})

test('POST /api/config con null vuelve al ámbito usuario', async () => {
  const res = await api('/api/config', { scope: null, project: null })
  const body = (await res.json()) as { scope: unknown; scopeSource: string }
  assert.deepEqual([body.scope, body.scopeSource], [{ kind: 'user' }, 'default'])
  assert.deepEqual((await snapshot()).scope, { kind: 'user' })
  assert.deepEqual((await snapshot()).measuredOver, { kind: 'all' })
})
