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
        events: [],
      },
    ],
    [
      'deploy',
      {
        count: 2,
        lastUsedAt: 1_800_000_000_000,
        sessions: new Set(['s1']),
        projects: new Set(['/p']),
        events: [],
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

test('weekly: 12 ventanas de 7 días que terminan en now, la última es la actual', async () => {
  const { catalog, scan } = await setup()
  const DAY = 24 * 60 * 60 * 1000
  const t = Date.parse('2026-10-01T10:00:00Z')

  const hoy = activityByTarget(scan.invocations, catalog, { now: t + 2 * DAY })
  const estilo = hoy.get('skill:claude-code/user/estilo')
  assert.equal(estilo?.weekly.length, 12)
  assert.deepEqual(estilo?.weekly, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2])
  assert.equal(estilo?.uses, 2)

  // Quince días después caen en la tercera ventana empezando por el final.
  const antes = activityByTarget(scan.invocations, catalog, { now: t + 15 * DAY })
  assert.equal(antes.get('skill:claude-code/user/estilo')?.weekly[9], 2)
  // Fuera de las 12 semanas: sigue contando en el total, no en la serie.
  const lejos = activityByTarget(scan.invocations, catalog, { now: t + 100 * DAY })
  const fuera = lejos.get('skill:claude-code/user/estilo')
  assert.equal(fuera?.uses, 2)
  assert.equal(
    fuera?.weekly.reduce((a, b) => a + b, 0),
    0,
  )
  // Una fecha futura (reloj desfasado) cuenta en la semana en curso.
  const futuro = activityByTarget(scan.invocations, catalog, { now: t - DAY })
  assert.equal(futuro.get('skill:claude-code/user/estilo')?.weekly[11], 2)
})

test('weekly y byProject: agentes por delegación, comandos tecleados más vía Skill', async () => {
  const { catalog, scan } = await setup()
  const DAY = 24 * 60 * 60 * 1000
  const t = Date.parse('2026-10-01T10:00:00Z')
  const now = t + DAY
  const commandUse = new Map([
    [
      'deploy',
      {
        count: 3,
        lastUsedAt: t - 8 * DAY,
        sessions: new Set(['s9']),
        projects: new Set(['/q']),
        events: [
          { ts: t - 8 * DAY, project: '/q' },
          { ts: t - 9 * DAY, project: '/q' },
          { ts: t - 20 * DAY, project: null },
        ],
      },
    ],
  ])
  const activity = activityByTarget(scan.invocations, catalog, { commandUse, now })

  const revisor = activity.get('agent:claude-code/user/revisor')
  assert.equal(revisor?.weekly[11], 1, 'la delegación del hilo principal')
  assert.deepEqual(revisor?.byProject, { '/p': 1 })

  const deploy = activity.get('command:claude-code/user/deploy')
  // Vía Skill (esta semana) + dos tecleados la semana 2 + uno sin proyecto en la 3.
  assert.equal(deploy?.weekly[11], 1)
  assert.equal(deploy?.weekly[10], 2)
  assert.equal(deploy?.weekly[8], 1)
  assert.equal(
    deploy?.weekly.reduce((a, b) => a + b, 0),
    4,
  )
  // El que no trae proyecto suma a la serie pero no al reparto por proyecto.
  assert.deepEqual(deploy?.byProject, { '/p': 1, '/q': 2 })
})

test('byProject abrevia con ~ lo que cuelga del home y deja ajeno lo demás', async () => {
  const { abbreviateCwd } = await import('../src/claude-code/paths.ts')
  const { homedir } = await import('node:os')
  assert.equal(abbreviateCwd(`${homedir()}/dev/p`), '~/dev/p')
  assert.equal(abbreviateCwd(homedir()), '~')
  assert.equal(abbreviateCwd('/srv/app'), '/srv/app')
  assert.equal(abbreviateCwd(`${homedir()}x/p`), `${homedir()}x/p`)
})
