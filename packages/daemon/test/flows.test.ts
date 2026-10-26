import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { scanCatalogReport } from '@ai-office/providers'
import { openFlow, planFlow, previewFlow, saveFlow } from '../src/mutations/flows.ts'

const setup = () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aio-flows-')))
  process.env.CLAUDE_HOME = home
  mkdirSync(join(home, 'agents'), { recursive: true })
  mkdirSync(join(home, 'commands/ns'), { recursive: true })
  mkdirSync(join(home, 'almacen'), { recursive: true })
  writeFileSync(join(home, 'agents/revisor.md'), '---\nname: revisor\ndescription: d\n---\nc\n')
  writeFileSync(join(home, 'commands/ns/x.md'), '---\ndescription: viejo\n---\nHaz algo\n')
  writeFileSync(join(home, 'almacen/enlazado.md'), '---\ndescription: viejo\n---\nHaz algo\n')
  symlinkSync(join(home, 'almacen/enlazado.md'), join(home, 'commands/enlazado.md'))
  return home
}

const flowOf = (name: string) => ({
  name,
  description: 'nuevo',
  steps: [{ agent: 'revisor', task: 'revisa' }],
})

test('guardar un comando de subcarpeta escribe en su archivo, no en un ns-x.md nuevo', async () => {
  const home = setup()
  const { catalog } = await scanCatalogReport()
  const opened = await openFlow(catalog, 'command:claude-code/user/ns:x')
  await saveFlow({ ...opened.flow, description: 'nuevo' }, opened.etag, catalog)

  assert.match(readFileSync(join(home, 'commands/ns/x.md'), 'utf8'), /description: nuevo/)
  assert.equal(existsSync(join(home, 'commands/ns-x.md')), false)
  assert.equal(existsSync(join(home, 'commands/ns:x.md')), false)
})

test('guardar un comando que es symlink escribe en el destino y conserva el enlace', async () => {
  const home = setup()
  const { catalog } = await scanCatalogReport()
  const opened = await openFlow(catalog, 'command:claude-code/user/enlazado')
  await saveFlow({ ...opened.flow, description: 'nuevo' }, opened.etag, catalog)

  assert.ok(lstatSync(join(home, 'commands/enlazado.md')).isSymbolicLink())
  assert.match(readFileSync(join(home, 'almacen/enlazado.md'), 'utf8'), /description: nuevo/)
})

test('plan y vista previa señalan el archivo real del comando existente', async () => {
  const home = setup()
  const { catalog } = await scanCatalogReport()
  const preview = await previewFlow(flowOf('ns:x'), catalog)
  assert.equal(preview.path, join(home, 'commands/ns/x.md'))
  assert.equal(preview.exists, true)
  assert.equal((await planFlow(flowOf('ns:x'), catalog)).path, join(home, 'commands/ns/x.md'))
})

test('un flujo nuevo se crea en commands/<slug>.md', async () => {
  const home = setup()
  const { catalog } = await scanCatalogReport()
  await saveFlow(flowOf('Mi Flujo Nuevo'), '', catalog)
  assert.ok(existsSync(join(home, 'commands/mi-flujo-nuevo.md')))
})

test('un nombre sin letras ni números da un error claro', async () => {
  setup()
  const { catalog } = await scanCatalogReport()
  await assert.rejects(() => previewFlow(flowOf('¿¿??'), catalog), /no sirve para un comando/)
  await assert.rejects(() => saveFlow(flowOf('!!!'), '', catalog), /no sirve para un comando/)
})
