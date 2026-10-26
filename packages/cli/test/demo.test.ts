import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { writeDemoHome } from '../src/demo/synth.ts'

/**
 * La demo es lo primero que ve quien llega al proyecto: tiene que enseñar el producto entero, no
 * una planta gris. Estas pruebas fijan que sigue haciéndolo aunque cambie el catálogo ficticio.
 */
let home = ''
type Snap = Awaited<ReturnType<typeof import('@ai-office/daemon').buildSnapshot>>
/** El de la demo tal como se abre (proyecto acme-web: actividad SOLO de ese proyecto). */
let snapshot: Snap
/** El mismo historial medido en ámbito de usuario: todas las sesiones de todos los proyectos. */
let userSnapshot: Snap

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'ai-office-demo-test-'))
  await writeDemoHome(home)
  process.env.CLAUDE_HOME = home
  const { buildSnapshot } = await import('@ai-office/daemon')
  snapshot = await buildSnapshot()
  userSnapshot = await buildSnapshot({ kind: 'user' })
})

after(async () => {
  delete process.env.CLAUDE_HOME
  await rm(home, { recursive: true, force: true })
})

test('la demo trae agentes, skills y comandos', () => {
  assert.equal(snapshot.stats.agents, 14)
  assert.equal(snapshot.stats.skills, 28)
  assert.equal(snapshot.stats.commands, 8)
})

test('hay de todo: sin estrenar, en uso y comandos tecleados', () => {
  assert.ok(snapshot.stats.agentsUnused > 0 && snapshot.stats.agentsUnused < snapshot.stats.agents)
  assert.ok(snapshot.stats.skillsUnused > 0 && snapshot.stats.skillsUnused < snapshot.stats.skills)
  assert.ok(
    snapshot.stats.commandsUsed > 0 && snapshot.stats.commandsUsed < snapshot.stats.commands,
  )
  assert.ok(snapshot.stats.provenAgentSkill > 0)
  assert.ok(snapshot.stats.declaredAgentSkill > snapshot.stats.provenAgentSkill)
})

test('los grados cubren acreditada y en práctica (en ámbito de usuario: acreditar pide 2 proyectos)', () => {
  const grados = new Set(Object.values(userSnapshot.activity).map((a) => a.grade))
  assert.ok(grados.has('certified'), 'alguna skill acreditada')
  assert.ok(grados.has('practicing'), 'alguna skill en práctica')
})

test('la planta tiene despachos con sentido y un archivo común', () => {
  assert.ok(snapshot.planta.salas.length >= 5)
  assert.ok(snapshot.planta.salas.some((s) => s.agents.length >= 3))
  assert.ok(snapshot.planta.archivoComun.length >= 1)
  assert.ok(snapshot.planta.deposito.length >= 1)
})

test('las series por semana tienen forma: 12 posiciones y la actividad repartida, no en la última', () => {
  const series = Object.values(userSnapshot.activity)
  assert.ok(series.length > 0)
  for (const a of series) {
    assert.equal(a.weekly.length, 12, a.id)
    assert.ok(
      a.weekly.reduce((x, y) => x + y, 0) <= a.uses,
      `${a.id}: la serie no puede sumar más que el total`,
    )
  }
  // Lo muy usado se reparte por casi todo el trimestre y no se amontona en la semana en curso.
  for (const id of [
    'agent:claude-code/user/code-reviewer',
    'skill:claude-code/user/style-guide',
    'command:claude-code/user/review',
  ]) {
    const w = userSnapshot.activity[id]?.weekly ?? []
    assert.ok(w.filter((n) => n > 0).length >= 6, `${id}: ${JSON.stringify(w)}`)
    assert.ok((w[11] ?? 0) < w.reduce((x, y) => x + y, 0) / 2, `${id}: no todo en la última`)
  }
})

test('byProject reparte los usos por proyecto en agentes, skills y comandos', () => {
  for (const id of [
    'agent:claude-code/user/code-reviewer',
    'skill:claude-code/user/style-guide',
    'command:claude-code/user/review',
  ]) {
    const a = userSnapshot.activity[id]
    const por = Object.values(a?.byProject ?? {})
    assert.ok(por.length >= 2, id)
    assert.equal(
      por.reduce((x, y) => x + y, 0),
      a?.uses,
      `${id}: los usos por proyecto suman el total`,
    )
  }
})

test('las aristas entrantes agente→skill están completas para CUALQUIER skill', () => {
  // Lo que Claude Code carga: no los archivados ni los tapados por el agente de proyecto.
  const live = snapshot.catalog.agents.filter((a) => !a.archived && a.status !== 'shadowed')
  const incoming = (skillId: string) =>
    snapshot.edges.filter((e) => e.kind === 'agent-uses-skill' && e.to === skillId)

  for (const skill of snapshot.catalog.skills) {
    const edges = incoming(skill.id)

    // Precargada: exactamente los agentes que la listan en `skills:`.
    const preloaded = live.filter((a) => a.preloadedSkills.includes(skill.name)).map((a) => a.id)
    assert.deepEqual(
      edges
        .filter((e) => e.layer === 'preloaded')
        .map((e) => e.from)
        .sort(),
      preloaded.sort(),
      `${skill.name}: precargadas`,
    )

    // Declarada: todo agente que la cita entre backticks en su prosa (y no la precarga) la tiene.
    const declared = new Set(edges.filter((e) => e.layer === 'declared').map((e) => e.from))
    for (const a of live) {
      if (a.preloadedSkills.includes(skill.name)) continue
      if (a.body.includes(`\`${skill.name}\``)) {
        assert.ok(declared.has(a.id), `${skill.name}: falta la declarada de ${a.name}`)
      }
    }
    for (const from of declared)
      assert.ok(
        live.some((a) => a.id === from),
        'solo agentes vivos',
      )

    // Acreditada: lo que dicen las aristas suma lo que dice la actividad, hilo principal incluido.
    const proven = edges.filter((e) => e.layer === 'proven')
    assert.equal(
      proven.reduce((n, e) => n + (e.uses ?? 0), 0),
      snapshot.activity[skill.id]?.uses ?? 0,
      `${skill.name}: acreditadas`,
    )
  }

  // El hilo principal también es un actor: git-workflow la invoca sin delegar.
  const gw = snapshot.catalog.skills.find((s) => s.name === 'git-workflow')?.id ?? ''
  assert.ok(
    incoming(gw).some((e) => e.layer === 'proven' && e.from === snapshot.mainThreadId),
    'arista del hilo principal',
  )
  assert.ok(
    incoming(gw).some((e) => e.layer === 'declared'),
    'y alguna declarada',
  )
  assert.ok(
    snapshot.edges.some((e) => e.kind === 'agent-uses-skill' && e.layer === 'preloaded'),
    'la demo trae alguna precargada',
  )
})

test('la demo trae plugins: uno habilitado usado a medias y otro deshabilitado', () => {
  const [kit, legacy] = ['release-kit@acme-tools', 'legacy-lint@acme-tools'].map((key) =>
    snapshot.catalog.plugins.find((p) => p.key === key),
  )
  assert.deepEqual([kit?.enabled, kit?.skills.length, kit?.commands.length], [true, 3, 1])
  assert.deepEqual([legacy?.enabled, legacy?.enabledSource], [false, 'user'])
  assert.equal(snapshot.stats.plugins, 2)
  assert.equal(snapshot.stats.pluginsEnabled, 1)
  assert.ok(snapshot.stats.pluginDescriptionTokens > 0)
  // Lo de los plugins no entra en las cifras propias ni en la planta.
  assert.equal(snapshot.catalog.skills.filter((s) => s.scope === 'plugin').length, 4)
  assert.ok(!snapshot.planta.deposito.some((id) => id.includes('/plugin/')))

  // La actividad completa se mira en ámbito de usuario: en el de proyecto solo cuenta acme-web.
  const act = userSnapshot.activity
  const uses = (id: string) => act[`skill:claude-code/plugin/${id}`]?.uses ?? 0
  assert.ok(uses('release-kit:notes-polish') > 0 && uses('release-kit:tag-check') > 0)
  assert.equal(uses('release-kit:rollback-plan'), 0, 'a medias: una skill del plugin nunca se usa')
  assert.ok((act['command:claude-code/plugin/release-kit:preflight']?.uses ?? 0) > 0)
  const total = act['plugin:claude-code/plugin/release-kit@acme-tools']
  assert.ok(total && total.uses > 0 && total.weekly.length === 12)
  assert.equal(act['plugin:claude-code/plugin/legacy-lint@acme-tools'], undefined)
})

test('la demo mide por ámbito: en el proyecto solo cuenta lo hecho allí; en usuario, todo', () => {
  const over = snapshot.measuredOver
  assert.equal(over.kind, 'project')
  assert.ok(over.kind === 'project' && over.sessions > 0 && over.path.endsWith('acme-web'))
  assert.deepEqual(userSnapshot.measuredOver, { kind: 'all' })
  const id = 'skill:claude-code/user/style-guide'
  const mine = snapshot.activity[id]
  const all = userSnapshot.activity[id]
  assert.ok(
    mine && all && mine.uses > 0 && mine.uses < all.uses,
    'el proyecto ve menos que el total',
  )
  // Cada uso del proyecto cae en acme-web: ningún otro proyecto aparece en su desglose.
  for (const a of Object.values(snapshot.activity)) {
    for (const key of Object.keys(a.byProject ?? {})) assert.match(key, /acme-web/, a.id)
  }
  // Lo que solo se hizo en otro proyecto (tag-check es de acme-api) no existe aquí.
  assert.equal(snapshot.activity['skill:claude-code/plugin/release-kit:tag-check'], undefined)
  assert.ok(snapshot.stats.skillsUnused >= userSnapshot.stats.skillsUnused)
})

test('la demo trae servidores MCP de usuario y de proyecto, con actividad también desde subagentes', () => {
  const servers = Object.fromEntries(snapshot.catalog.mcpServers.map((m) => [m.name, m]))
  assert.deepEqual(
    [servers.github?.scope, servers.postgres?.scope, servers.figma?.scope],
    ['user', 'user', 'project'],
  )
  assert.deepEqual(servers.github?.envKeys, ['GITHUB_PERSONAL_ACCESS_TOKEN'])
  assert.deepEqual(servers.figma?.headerKeys, ['Authorization'])
  assert.equal(servers.figma?.urlHost, 'mcp.figma.example')

  const github = snapshot.activity[servers.github?.id ?? '']
  assert.ok(Object.keys(github?.byTool ?? {}).length >= 3, 'varias herramientas')
  assert.ok((github?.sessions ?? 0) >= 3)
  assert.equal(snapshot.activity[servers.postgres?.id ?? ''], undefined, 'postgres nunca se usa')
  assert.equal(snapshot.stats.mcpServers, 3)
  assert.equal(snapshot.stats.mcpUnused, 1)
  // Un subagente (code-reviewer) también llama a github: arista probada y declarada.
  const edge = (layer: string, from: string) =>
    snapshot.edges.find(
      (e) =>
        e.kind === 'agent-uses-mcp' &&
        e.layer === layer &&
        e.from === from &&
        e.to === servers.github?.id,
    )
  assert.ok(edge('proven', 'agent:claude-code/user/code-reviewer'))
  assert.ok(edge('proven', snapshot.mainThreadId))
  assert.ok(edge('declared', 'agent:claude-code/user/code-reviewer'))
  // Ningún secreto del `.claude.json` ni del `.mcp.json` llega al snapshot.
  const dump = JSON.stringify(snapshot)
  for (const secret of ['ghp_demo', 'demo-password', 'demo-secret-token', 'demo-figma-token']) {
    assert.equal(dump.includes(secret), false, secret)
  }
})

test('la demo se abre en un proyecto real con un agente que tapa a uno del usuario', async () => {
  assert.equal(snapshot.scope.kind, 'project')
  const path = snapshot.scope.kind === 'project' ? snapshot.scope.path : ''
  // (en macOS el tmp cuelga de un symlink: el ámbito lleva la ruta real)
  assert.ok(path.startsWith(await realpath(home)), 'el proyecto vive en el temporal de la demo')
  const user = snapshot.catalog.agents.find(
    (a) => a.id === 'agent:claude-code/user/frontend-designer',
  )
  assert.deepEqual(
    [user?.status, user?.shadowedBy],
    ['shadowed', 'agent:claude-code/project/frontend-designer'],
  )
  // El agente de proyecto recibe las delegaciones (el tapado no).
  assert.ok((snapshot.activity['agent:claude-code/project/frontend-designer']?.uses ?? 0) > 0)
  assert.equal(snapshot.activity['agent:claude-code/user/frontend-designer'], undefined)
  assert.equal(snapshot.stats.agents, 14, 'el tapado no cuenta')

  assert.equal(snapshot.knownProjects.length, 4)
  for (const p of snapshot.knownProjects) {
    assert.ok(p.exists && p.sessions > 0, p.path)
    assert.ok((await stat(p.path)).isDirectory())
  }
  assert.deepEqual(
    snapshot.knownProjects.filter((p) => p.hasClaudeDir).map((p) => p.name),
    ['acme-web'],
  )
})

test('el .claude.json de la demo tiene el formato de Claude Code: se puede desactivar un servidor', async () => {
  const text = await readFile(join(home, '.claude.json'), 'utf8')
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`)
})
