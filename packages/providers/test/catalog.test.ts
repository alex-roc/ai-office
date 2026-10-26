import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scanCatalogReport } from '../src/claude-code/catalog.ts'

const agentDoc = (name: string) => `---\nname: ${name}\ndescription: hace ${name}\n---\n\ncuerpo\n`
const skillDoc = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: skill ${name}\n${extra}---\n\ncuerpo\n`

/** Una instalación mínima de Claude Code, con casos rotos incluidos. */
const fixture = () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aio-catalog-')))
  for (const d of ['agents/.archivo', 'commands/ns', 'skills/buena', 'skills/jubilada']) {
    mkdirSync(join(home, d), { recursive: true })
  }
  writeFileSync(join(home, 'agents/ok.md'), agentDoc('ok'))
  writeFileSync(join(home, 'agents/.archivo/viejo.md'), agentDoc('viejo'))
  // Un archivado con el nombre de uno activo no puede pisarlo.
  writeFileSync(join(home, 'agents/.archivo/ok.md'), agentDoc('ok'))
  symlinkSync(join(home, 'no-existe.md'), join(home, 'agents/roto.md'))
  writeFileSync(join(home, 'commands/plano.md'), '---\ndescription: plano\n---\ncuerpo\n')
  writeFileSync(join(home, 'commands/ns/x.md'), '---\ndescription: anidado\n---\ncuerpo\n')
  symlinkSync(join(home, 'no-existe.md'), join(home, 'commands/roto.md'))
  writeFileSync(join(home, 'skills/buena/SKILL.md'), skillDoc('buena'))
  writeFileSync(
    join(home, 'skills/jubilada/SKILL.md'),
    skillDoc('jubilada', 'disable-model-invocation: true\n'),
  )
  symlinkSync(join(home, 'no-existe'), join(home, 'skills/enlace-roto'))
  process.env.CLAUDE_HOME = home
  return home
}

test('un symlink roto no tumba el escaneo: se acumula en errors', async () => {
  const home = fixture()
  const { catalog, errors } = await scanCatalogReport()

  assert.deepEqual(
    catalog.agents.filter((a) => !a.archived).map((a) => a.name),
    ['ok'],
  )
  assert.deepEqual(
    catalog.skills.map((s) => s.name),
    ['buena', 'jubilada'],
  )
  assert.ok(
    errors.some((e) => e.startsWith(join(home, 'agents/roto.md'))),
    errors.join('\n'),
  )
  assert.ok(errors.some((e) => e.startsWith(join(home, 'commands/roto.md'))))
  assert.ok(errors.some((e) => e.startsWith(join(home, 'skills/enlace-roto'))))
})

test('se leen los archivados de .archive y de la carpeta antigua .archivo', async () => {
  const home = fixture()
  mkdirSync(join(home, 'agents/.archive'), { recursive: true })
  writeFileSync(join(home, 'agents/.archive/nuevo.md'), agentDoc('nuevo'))
  const { catalog } = await scanCatalogReport()
  const archived = catalog.agents.filter((a) => a.archived)
  assert.deepEqual(archived.map((a) => a.name).sort(), ['nuevo', 'ok', 'viejo'])
  assert.ok(archived.some((a) => a.id === 'agent:claude-code/user/.archive/nuevo'))
  assert.ok(archived.some((a) => a.id === 'agent:claude-code/user/.archivo/viejo'))
})

test('los problemas de un archivo llevan código además del texto en inglés', async () => {
  const home = fixture()
  writeFileSync(join(home, 'agents/sin.md'), '---\nname: otro\n---\ncuerpo\n')
  const { catalog } = await scanCatalogReport()
  const sin = catalog.agents.find((a) => !a.archived && a.name === 'otro')
  assert.deepEqual(sin?.problemDetails?.map((p) => p.code).sort(), [
    'agent-no-description',
    'name-mismatch',
  ])
  assert.deepEqual(
    sin?.problems,
    sin?.problemDetails?.map((p) => p.message),
  )
  assert.match(sin?.problems[0] ?? '', /description|does not match/)
})

test('los agentes de .archivo se listan como archivados, con id propio', async () => {
  fixture()
  const { catalog } = await scanCatalogReport()
  const archived = catalog.agents.filter((a) => a.archived)
  assert.deepEqual(archived.map((a) => a.name).sort(), ['ok', 'viejo'])
  const ids = catalog.agents.map((a) => a.id)
  assert.equal(new Set(ids).size, ids.length, 'ningún id repetido')
  assert.equal(
    catalog.agents.find((a) => a.name === 'ok' && !a.archived)?.id,
    'agent:claude-code/user/ok',
  )
})

test('commands/ns/x.md es el comando ns:x', async () => {
  fixture()
  const { catalog } = await scanCatalogReport()
  assert.deepEqual(
    catalog.commands.map((c) => c.name),
    ['ns:x', 'plano'],
  )
})

test('las skills jubiladas se marcan con disabledForModel', async () => {
  fixture()
  const { catalog } = await scanCatalogReport()
  assert.equal(catalog.skills.find((s) => s.name === 'jubilada')?.disabledForModel, true)
})
