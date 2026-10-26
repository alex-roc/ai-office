import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scanCatalogReport } from '../src/claude-code/catalog.ts'
import { liveCatalog, ownCatalog } from '../src/claude-code/live.ts'
import {
  applyConfigPatch,
  parseOurConfig,
  readOurConfig,
  writeOurConfig,
} from '../src/claude-code/our-config.ts'
import { scanKnownProjects } from '../src/claude-code/projects.ts'
import { assertUsableConfig, resolveScope, scopeRoots } from '../src/claude-code/scope.ts'

const sandbox = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aio-scope-')))
  const home = join(root, 'claude')
  mkdirSync(home, { recursive: true })
  process.env.CLAUDE_HOME = home
  process.env.CLAUDE_MANAGED_DIR = join(root, 'managed')
  return { root, home }
}

const agent = (name: string, body = 'cuerpo') =>
  `---\nname: ${name}\ndescription: d ${name}\n---\n${body}\n`
const skill = (name: string) => `---\nname: ${name}\ndescription: skill ${name}\n---\ncuerpo\n`
const put = (path: string, text: string) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

test('proyecto: lo suyo se escanea con scope project y la precedencia tapa lo que toca', async () => {
  const { home, root } = sandbox()
  const proj = join(root, 'proj')
  put(join(home, 'agents/dup.md'), agent('dup'))
  put(join(home, 'agents/solo-user.md'), agent('solo-user'))
  put(join(proj, '.claude/agents/dup.md'), agent('dup'))
  put(join(home, 'skills/s/SKILL.md'), skill('s'))
  put(join(proj, '.claude/skills/s/SKILL.md'), skill('s'))
  put(join(home, 'commands/c.md'), '---\ndescription: c\n---\ncuerpo\n')
  put(join(proj, '.claude/commands/c.md'), '---\ndescription: c\n---\ncuerpo\n')
  put(join(proj, '.claude/commands/solo-proj.md'), '---\ndescription: c\n---\ncuerpo\n')

  const { catalog } = await scanCatalogReport({ kind: 'project', path: proj })
  const find = <T extends { id: string }>(list: T[], id: string) => list.find((e) => e.id === id)

  // Agentes: proyecto > usuario.
  assert.equal(find(catalog.agents, 'agent:claude-code/project/dup')?.status, 'active')
  const userDup = find(catalog.agents, 'agent:claude-code/user/dup')
  assert.deepEqual(
    [userDup?.status, userDup?.shadowedBy],
    ['shadowed', 'agent:claude-code/project/dup'],
  )
  assert.equal(find(catalog.agents, 'agent:claude-code/user/solo-user')?.status, 'active')
  // Skills: personal > proyecto.
  assert.equal(find(catalog.skills, 'skill:claude-code/user/s')?.status, 'active')
  const projSkill = find(catalog.skills, 'skill:claude-code/project/s')
  assert.deepEqual(
    [projSkill?.status, projSkill?.shadowedBy],
    ['shadowed', 'skill:claude-code/user/s'],
  )
  // Comandos: por analogía con las skills (no documentado), también personal > proyecto.
  assert.equal(find(catalog.commands, 'command:claude-code/project/c')?.status, 'shadowed')
  assert.equal(find(catalog.commands, 'command:claude-code/project/solo-proj')?.status, 'active')
  assert.ok(catalog.roots.includes(join(proj, '.claude/agents')))

  // Lo tapado no cuenta como cargado ni como propio.
  assert.deepEqual(
    liveCatalog(catalog)
      .agents.map((a) => a.id)
      .sort(),
    ['agent:claude-code/project/dup', 'agent:claude-code/user/solo-user'],
  )
  assert.equal(ownCatalog(catalog).skills.length, 1)

  // Sin ámbito de proyecto, lo del proyecto ni se mira.
  const user = await scanCatalogReport()
  assert.deepEqual(user.catalog.agents.map((a) => a.id).sort(), [
    'agent:claude-code/user/dup',
    'agent:claude-code/user/solo-user',
  ])
  assert.equal(
    user.catalog.agents.every((a) => a.status === 'active'),
    true,
  )
})

test('un archivado no tapa ni es tapado', async () => {
  const { home, root } = sandbox()
  const proj = join(root, 'proj')
  put(join(home, 'agents/.archive/dup.md'), agent('dup'))
  put(join(proj, '.claude/agents/dup.md'), agent('dup'))
  const { catalog } = await scanCatalogReport({ kind: 'project', path: proj })
  assert.equal(
    catalog.agents.every((a) => a.status === 'active'),
    true,
  )
})

test('un proyecto cuyo .claude es el directorio de Claude Code no duplica lo del usuario', async () => {
  const { home, root } = sandbox()
  put(join(home, 'agents/a.md'), agent('a'))
  // `<root>/enlace/.claude` es el mismo directorio que `home`.
  mkdirSync(join(root, 'enlace'), { recursive: true })
  symlinkSync(home, join(root, 'enlace/.claude'))
  const { catalog } = await scanCatalogReport({ kind: 'project', path: join(root, 'enlace') })
  assert.deepEqual(
    catalog.agents.map((a) => a.id),
    ['agent:claude-code/user/a'],
  )
})

test('resolveScope: flag > config.json > autodetección > usuario', async () => {
  const { root } = sandbox()
  const web = join(root, 'web')
  const api = join(root, 'api')
  const plain = join(root, 'plain')
  put(join(web, '.claude/agents/a.md'), agent('a'))
  put(join(api, '.mcp.json'), '{}')
  mkdirSync(plain, { recursive: true })

  // Sin nada: usuario.
  assert.deepEqual(await resolveScope({ cwd: plain, auto: true }), {
    scope: { kind: 'user' },
    source: 'default',
  })
  // Autodetección: el cwd con `.claude/agents` o `.mcp.json`.
  assert.deepEqual(await resolveScope({ cwd: web, auto: true }), {
    scope: { kind: 'project', path: web },
    source: 'auto',
    via: 'cwd',
  })
  assert.equal((await resolveScope({ cwd: api, auto: true })).scope.kind, 'project')
  // Sin `auto` (el daemon) no se mira desde dónde se lanzó.
  assert.equal((await resolveScope({ cwd: web })).source, 'default')
  // Desde una subcarpeta, la raíz git.
  mkdirSync(join(web, '.git'), { recursive: true })
  mkdirSync(join(web, 'src/deep'), { recursive: true })
  const nested = await resolveScope({ cwd: join(web, 'src/deep'), auto: true })
  assert.deepEqual(
    [nested.source, nested.via, (nested.scope as { path: string }).path],
    ['auto', 'git-root', web],
  )
  // Una carpeta `.claude/` sin agents/skills/commands no es un proyecto.
  mkdirSync(join(plain, '.claude'), { recursive: true })
  assert.equal((await resolveScope({ cwd: plain, auto: true })).source, 'default')

  // config.json manda sobre la autodetección.
  const viaConfig = await resolveScope({
    cwd: web,
    auto: true,
    config: { scope: 'project', project: api },
  })
  assert.deepEqual([viaConfig.source, (viaConfig.scope as { path: string }).path], ['config', api])
  assert.equal(
    (await resolveScope({ cwd: web, auto: true, config: { scope: 'user' } })).scope.kind,
    'user',
  )
  // Un proyecto de la config que ya no existe no es un error: se sigue con lo siguiente.
  const gone = await resolveScope({
    cwd: web,
    auto: true,
    config: { project: join(root, 'borrado') },
  })
  assert.equal(gone.source, 'auto')

  // El flag manda sobre todo.
  const flag = await resolveScope({ cwd: web, auto: true, project: api, config: { scope: 'user' } })
  assert.deepEqual([flag.source, (flag.scope as { path: string }).path], ['flag', api])
  assert.deepEqual((await resolveScope({ cwd: web, auto: true, scope: 'user' })).scope, {
    kind: 'user',
  })
  // `--scope project` sin ruta usa la de la config o la del directorio actual; sin ninguna, error.
  assert.equal((await resolveScope({ cwd: web, scope: 'project' })).scope.kind, 'project')
  await assert.rejects(() => resolveScope({ cwd: plain, scope: 'project' }), {
    code: 'needs-project',
  })
  await assert.rejects(() => resolveScope({ project: join(root, 'no-existe') }), {
    code: 'project-not-found',
  })
  await assert.rejects(() => resolveScope({ scope: 'user', project: web }), {
    code: 'conflicting-scope',
  })
})

test('el home del usuario no se toma por un proyecto aunque tenga .claude/agents', async () => {
  const { home } = sandbox()
  put(join(home, 'agents/a.md'), agent('a'))
  // cwd = `<home>/..` con `.claude` apuntando al directorio de Claude Code.
  const parent = join(home, '..')
  symlinkSync(home, join(parent, '.claude'))
  assert.equal((await resolveScope({ cwd: parent, auto: true })).source, 'default')
})

test('las raíces permitidas del ámbito: solo con proyecto, y solo .claude y .mcp.json', () => {
  assert.deepEqual(scopeRoots({ kind: 'user' }), [])
  assert.deepEqual(scopeRoots({ kind: 'project', path: '/p' }), ['/p/.claude'])
})

test('config.json: validación estricta, parches y escritura auditada', async () => {
  const { home } = sandbox()
  assert.deepEqual(parseOurConfig({}), {})
  assert.deepEqual(
    parseOurConfig({ scope: 'project', project: '/p', show: { mcp: false }, lang: 'es' }),
    { scope: 'project', project: '/p', show: { mcp: false }, lang: 'es' },
  )
  for (const [bad, key] of [
    [{ scope: 'team' }, 'scope'],
    [{ project: 'relativa' }, 'project'],
    [{ project: 3 }, 'project'],
    [{ show: { agents: 'sí' } }, 'show.agents'],
    [{ show: { robots: true } }, 'show.robots'],
    [{ show: [] }, 'show'],
    [{ lang: 'fr' }, 'lang'],
    [{ extra: 1 }, 'extra'],
  ] as const) {
    assert.throws(
      () => parseOurConfig(bad),
      (e: { code?: string; params?: { key?: string } }) =>
        e.code === 'invalid-config' && e.params?.key === key,
      JSON.stringify(bad),
    )
  }
  assert.throws(() => parseOurConfig([]), { code: 'invalid-config' })

  // Un parche: `show` se combina clave a clave, `null` quita.
  const base = { scope: 'project', project: '/p', show: { mcp: false } } as const
  assert.deepEqual(applyConfigPatch(base, { show: { plugins: true } }), {
    ...base,
    show: { mcp: false, plugins: true },
  })
  assert.deepEqual(applyConfigPatch(base, { scope: null, project: null }), { show: { mcp: false } })
  assert.throws(() => applyConfigPatch(base, { nope: 1 }), { code: 'invalid-config' })

  // Sin archivo: vacío. Escribir deja el archivo, la auditoría, y es idempotente.
  assert.deepEqual((await readOurConfig()).config, {})
  const first = await writeOurConfig({ lang: 'es', show: { mcp: false } })
  assert.equal(first.changed, true)
  const text = readFileSync(join(home, 'ai-office/config.json'), 'utf8')
  // Orden canónico (scope, project, show, lang): el archivo no cambia según cómo llegó el parche.
  assert.equal(text, `${JSON.stringify({ show: { mcp: false }, lang: 'es' }, null, 2)}\n`)
  assert.equal((await writeOurConfig({ lang: 'es', show: { mcp: false } })).changed, false)
  const audit = readFileSync(join(home, 'ai-office/logs/audit.ndjson'), 'utf8').trim().split('\n')
  assert.equal(audit.length, 1)
  assert.equal(JSON.parse(audit[0] as string).action, 'config.set')
  assert.deepEqual((await readOurConfig()).config, { lang: 'es', show: { mcp: false } })

  // Un archivo roto es "sin configuración" con aviso, no un fallo.
  writeFileSync(join(home, 'ai-office/config.json'), '{"scope":"mundo"}')
  const broken = await readOurConfig()
  assert.deepEqual(broken.config, {})
  assert.match(broken.error ?? '', /scope/)

  await assert.rejects(() => assertUsableConfig({ scope: 'project' }), { code: 'needs-project' })
  await assert.rejects(() => assertUsableConfig({ project: '/no/existe/nunca' }), {
    code: 'project-not-found',
  })
})

test('proyectos conocidos: ~/.claude.json y los cwd de los transcripts, los que existen primero', async () => {
  const { home, root } = sandbox()
  const real = join(root, 'real')
  const onlyTranscript = join(root, 'solo-transcript')
  const gone = join(root, 'borrado')
  mkdirSync(join(real, '.claude'), { recursive: true })
  mkdirSync(onlyTranscript, { recursive: true })
  writeFileSync(
    join(home, '.claude.json'),
    `${JSON.stringify({ projects: { [real]: {}, [gone]: {}, relativo: {} } }, null, 2)}\n`,
  )
  const session = (cwd: string) => `${JSON.stringify({ type: 'user', cwd, sessionId: 's' })}\n`
  put(join(home, 'projects/-a/1.jsonl'), session(onlyTranscript))
  put(join(home, 'projects/-a/2.jsonl'), session(onlyTranscript))
  put(join(home, 'projects/-b/1.jsonl'), session(real))
  put(join(home, 'projects/-c/1.jsonl'), '{"sin":"cwd"}\n')

  const list = await scanKnownProjects()
  assert.deepEqual(
    list.map((p) => [p.name, p.exists, p.hasClaudeDir, p.sessions]),
    [
      ['solo-transcript', true, false, 2],
      ['real', true, true, 1],
      ['borrado', false, false, 0],
    ],
  )
  // El proyecto del ámbito siempre figura.
  const extra = join(root, 'extra')
  mkdirSync(extra)
  assert.ok(
    (await scanKnownProjects({ kind: 'project', path: extra })).some((p) => p.path === extra),
  )
})
