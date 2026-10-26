import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { writeDemoHome } from '../src/demo/synth.ts'

/**
 * La demo es lo primero que ve quien llega al proyecto: tiene que enseñar el producto entero, no
 * una planta gris. Estas pruebas fijan que sigue haciéndolo aunque cambie el catálogo ficticio.
 */
let home = ''
let snapshot: Awaited<ReturnType<typeof import('@ai-office/daemon').buildSnapshot>>

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'ai-office-demo-test-'))
  await writeDemoHome(home)
  process.env.CLAUDE_HOME = home
  const { buildSnapshot } = await import('@ai-office/daemon')
  snapshot = await buildSnapshot()
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

test('los grados cubren acreditada y en práctica', () => {
  const grados = new Set(Object.values(snapshot.activity).map((a) => a.grade))
  assert.ok(grados.has('certified'), 'alguna skill acreditada')
  assert.ok(grados.has('practicing'), 'alguna skill en práctica')
})

test('la planta tiene despachos con sentido y un archivo común', () => {
  assert.ok(snapshot.planta.salas.length >= 5)
  assert.ok(snapshot.planta.salas.some((s) => s.agents.length >= 3))
  assert.ok(snapshot.planta.archivoComun.length >= 1)
  assert.ok(snapshot.planta.deposito.length >= 1)
})
