import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scanCatalogReport } from '../src/claude-code/catalog.ts'
import { activityByTarget, buildProvenGraph } from '../src/claude-code/proven.ts'
import { scanTranscripts } from '../src/claude-code/transcripts.ts'

const toolUse = (id: string, name: string, input: Record<string, unknown>, sessionId: string) =>
  `${JSON.stringify({
    sessionId,
    cwd: '/p',
    timestamp: '2026-10-01T10:00:00Z',
    message: { content: [{ type: 'tool_use', id, name, input }] },
  })}\n`

/** Catálogo y transcripts de mentira, en disco: lo que de verdad lee el escáner. */
const setup = async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aio-activity-')))
  process.env.CLAUDE_HOME = home
  for (const d of ['agents', 'commands', 'skills/estilo', 'projects/-p/s1/subagents']) {
    mkdirSync(join(home, d), { recursive: true })
  }
  writeFileSync(
    join(home, 'agents/revisor.md'),
    '---\nname: revisor\ndescription: d\n---\ncuerpo\n',
  )
  writeFileSync(join(home, 'commands/deploy.md'), '---\ndescription: d\n---\ncuerpo\n')
  writeFileSync(join(home, 'commands/solo-teclado.md'), '---\ndescription: d\n---\ncuerpo\n')
  writeFileSync(
    join(home, 'skills/estilo/SKILL.md'),
    '---\nname: estilo\ndescription: d\n---\ncuerpo\n',
  )

  const main = join(home, 'projects/-p/s1.jsonl')
  // El mismo tool_use dos veces (sesión reanudada) y el nombre antiguo `Task` para subagentes.
  writeFileSync(
    main,
    toolUse('tu-1', 'Skill', { skill: 'estilo' }, 's1') +
      toolUse('tu-1', 'Skill', { skill: 'estilo' }, 's1') +
      toolUse('tu-2', 'Task', { subagent_type: 'revisor' }, 's1') +
      toolUse('tu-3', 'Skill', { skill: 'deploy' }, 's1'),
  )
  // El subagente usa la MISMA skill en la MISMA sesión: es una sesión, no dos.
  writeFileSync(
    join(home, 'projects/-p/s1/subagents/agent-a1.jsonl'),
    toolUse('tu-4', 'Skill', { skill: 'estilo' }, 's1'),
  )
  writeFileSync(
    join(home, 'projects/-p/s1/subagents/agent-a1.meta.json'),
    JSON.stringify({ agentType: 'revisor' }),
  )
  const { catalog } = await scanCatalogReport()
  const scan = await scanTranscripts(join(home, 'projects'))
  return { catalog, scan }
}

test('el mismo tool_use no se cuenta dos veces y Task es un subagente', async () => {
  const { catalog, scan } = await setup()
  assert.equal(scan.invocations.length, 4) // tu-1 (1), tu-2, tu-3, tu-4
  const agente = scan.invocations.find((i) => i.toolUseId === 'tu-2')
  assert.equal(agente?.type, 'agent')
  assert.equal(agente?.target, 'revisor')
  const activity = activityByTarget(scan.invocations, catalog)
  assert.equal(activity.get('agent:claude-code/user/revisor')?.uses, 1)
})

test('las sesiones son una unión, no una suma entre actores', async () => {
  const { catalog, scan } = await setup()
  const estilo = activityByTarget(scan.invocations, catalog).get('skill:claude-code/user/estilo')
  assert.equal(estilo?.uses, 2) // hilo principal + subagente
  assert.equal(estilo?.sessions, 1)
  assert.equal(estilo?.projects, 1)
})

test('un comando invocado por la herramienta Skill cuenta para el comando, no como skill', async () => {
  const { catalog, scan } = await setup()
  const activity = activityByTarget(scan.invocations, catalog)
  assert.equal(activity.get('command:claude-code/user/deploy')?.uses, 1)
  const edges = buildProvenGraph(scan.invocations, catalog)
  assert.ok(!edges.some((e) => e.to.includes('/deploy')), 'no es una skill de plugin fantasma')
})

test('lo tecleado en history.jsonl suma al comando con sus sesiones y proyectos', async () => {
  const { catalog, scan } = await setup()
  const commandUse = new Map([
    [
      'solo-teclado',
      {
        count: 3,
        lastUsedAt: 1_700_000_000_000,
        sessions: new Set(['a', 'b']),
        projects: new Set(['/x/y']),
      },
    ],
    [
      'deploy',
      {
        count: 2,
        lastUsedAt: 1_800_000_000_000,
        sessions: new Set(['s1']),
        projects: new Set(['/p']),
      },
    ],
  ])
  const activity = activityByTarget(scan.invocations, catalog, { commandUse })
  const teclado = activity.get('command:claude-code/user/solo-teclado')
  assert.equal(teclado?.uses, 3)
  assert.equal(teclado?.sessions, 2)
  assert.equal(teclado?.lastUsedAt, 1_700_000_000_000)
  // Teclado + Skill, en la misma sesión s1 y el mismo proyecto `/p` -> `-p`.
  const deploy = activity.get('command:claude-code/user/deploy')
  assert.equal(deploy?.uses, 3)
  assert.equal(deploy?.sessions, 1)
  assert.equal(deploy?.projects, 1)
})
