import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { emptyCatalog } from '@ai-office/core'
import type { CommandUse } from '../src/claude-code/history.ts'
import { projectMatcher, scopeHistory } from '../src/claude-code/measure.ts'
import { activityByTarget } from '../src/claude-code/proven.ts'
import { type Invocation, scanTranscripts } from '../src/claude-code/transcripts.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'aio-measure-')))
const proj = join(root, 'app')
const sibling = join(root, 'app-old') // empieza igual que `app`, pero NO es un subdirectorio
mkdirSync(join(proj, 'src'), { recursive: true })
mkdirSync(sibling, { recursive: true })
process.on('exit', () => rmSync(root, { recursive: true, force: true }))

const inv = (cwd: string | null, sessionId: string, target = 'estilo'): Invocation => ({
  target,
  type: 'skill',
  actor: { kind: 'main' },
  sessionId,
  projectSlug: 'x',
  cwd,
  ts: Date.now(),
  toolUseId: null,
})

test('dentro del proyecto: la ruta, sus subdirectorios y sus worktrees; el prefijo se compara con separador', () => {
  const inside = projectMatcher(proj)
  assert.equal(inside(proj), true)
  assert.equal(inside(join(proj, 'src')), true)
  assert.equal(inside(join(proj, '.claude/worktrees/feat-x')), true, 'un worktree bajo el proyecto')
  assert.equal(inside(sibling), false, '`app-old` no es `app`')
  assert.equal(inside(root), false)
  assert.equal(inside(null), false, 'sin cwd no se puede situar')
})

test('compara rutas reales: un symlink al proyecto y un worktree ya borrado bajo él', () => {
  const link = join(root, 'enlace')
  symlinkSync(proj, link)
  // El ámbito puede venir por el enlace y el transcript por la ruta real, o al revés.
  assert.equal(projectMatcher(link)(join(proj, 'src')), true)
  assert.equal(projectMatcher(proj)(join(link, 'src')), true)
  // Un worktree borrado ya no se puede resolver, pero su carpeta madre sí.
  assert.equal(projectMatcher(proj)(join(link, '.claude/worktrees/borrado')), true)
  assert.equal(projectMatcher(proj)(join(root, 'enlace-otro', 'x')), false)
})

test('en ámbito de proyecto solo cuenta lo hecho dentro; en usuario, todo, y sin releer nada', () => {
  const invocations = [
    inv(proj, 's1'),
    inv(join(proj, 'src'), 's1'),
    inv(sibling, 's2'),
    inv(null, 's3'),
  ]
  const sessionCwd = new Map([
    ['s1', proj],
    ['s2', sibling],
    ['s4', proj], // una sesión del proyecto que no invocó nada: también es una sesión medida
  ])
  const commandUse = new Map<string, CommandUse>([
    [
      'deploy',
      {
        count: 3,
        lastUsedAt: 30,
        sessions: new Set(['s1', 's2']),
        projects: new Set([proj, sibling]),
        events: [
          { ts: 10, project: proj, sessionId: 's1' },
          { ts: 20, project: sibling, sessionId: 's2' },
          { ts: 30, project: join(proj, 'src'), sessionId: 's1' },
        ],
      },
    ],
    [
      'otro-sitio',
      {
        count: 1,
        lastUsedAt: 5,
        sessions: new Set(['s2']),
        projects: new Set([sibling]),
        events: [{ ts: 5, project: sibling, sessionId: 's2' }],
      },
    ],
  ])
  const all = scopeHistory({ invocations, sessionCwd }, { commandUse }, { kind: 'user' })
  assert.deepEqual(all.measuredOver, { kind: 'all' })
  assert.equal(all.invocations.length, 4)
  assert.equal(all.commandUse, commandUse)

  const mine = scopeHistory(
    { invocations, sessionCwd },
    { commandUse },
    { kind: 'project', path: proj },
  )
  assert.deepEqual(mine.measuredOver, { kind: 'project', path: proj, sessions: 2 })
  assert.equal(mine.invocations.length, 2)
  assert.deepEqual(
    [...mine.commandUse.keys()],
    ['deploy'],
    'lo que solo se tecleó fuera desaparece',
  )
  const deploy = mine.commandUse.get('deploy')
  assert.deepEqual(
    [deploy?.count, deploy?.lastUsedAt, [...(deploy?.sessions ?? [])], deploy?.projects.size],
    [2, 30, ['s1'], 2],
  )

  // Lo que "no se usó en este proyecto" sale sin uso aunque se usara en otro.
  const catalog = emptyCatalog()
  const elsewhere = [inv(sibling, 's2', 'solo-fuera')]
  const scoped = scopeHistory(
    { invocations: elsewhere, sessionCwd },
    { commandUse },
    { kind: 'project', path: proj },
  )
  assert.equal(activityByTarget(scoped.invocations, catalog).size, 0)
  assert.equal(activityByTarget(elsewhere, catalog).size, 1)
})

test('el escaneo anota con qué cwd arrancó cada sesión, aunque su primera línea no lo traiga', async () => {
  const projects = join(root, 'projects')
  mkdirSync(join(projects, '-app'), { recursive: true })
  writeFileSync(
    join(projects, '-app/sesion-a.jsonl'),
    `${JSON.stringify({ type: 'summary', summary: 'sin cwd' })}\n${JSON.stringify({
      sessionId: 'sesion-a',
      cwd: proj,
      message: { content: [] },
    })}\n`,
  )
  writeFileSync(join(projects, '-app/sesion-b.jsonl'), `${JSON.stringify({ type: 'summary' })}\n`)
  const scan = await scanTranscripts(projects)
  assert.equal(scan.sessionCwd.get('sesion-a'), proj)
  assert.equal(scan.sessionCwd.has('sesion-b'), false)
  assert.equal(scan.sessions.size, 2)
})
