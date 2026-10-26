import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSection, removeSection, upsertSection } from '../src/claude-code/body-sections.ts'

test('readSection devuelve null si la sección no existe', () => {
  assert.equal(readSection('# Cuerpo\n\nprosa.\n', 'skills'), null)
})

test('upsertSection añade la sección al final con una línea en blanco antes', () => {
  const body = '# Cuerpo\n\nProsa escrita a mano.\n'
  const out = upsertSection(
    body,
    'skills',
    '- **release-tools** — `~/.claude/skills/release-tools/SKILL.md`',
  )
  assert.match(out, /Prosa escrita a mano\.\n\n<!-- ai-office:skills:inicio -->/)
  assert.equal(
    readSection(out, 'skills'),
    '- **release-tools** — `~/.claude/skills/release-tools/SKILL.md`',
  )
})

test('upsertSection es idempotente: escribir lo mismo dos veces da el mismo texto', () => {
  const body = '# Cuerpo\n\nProsa.\n'
  const once = upsertSection(body, 'skills', 'contenido')
  const twice = upsertSection(once, 'skills', 'contenido')
  assert.equal(once, twice)
})

test('upsertSection sustituye en su sitio si la sección ya existe', () => {
  const body =
    'Antes.\n\n<!-- ai-office:skills:inicio -->\nviejo\n<!-- ai-office:skills:fin -->\n\nDespués.\n'
  const out = upsertSection(body, 'skills', 'nuevo')
  assert.equal(
    out,
    'Antes.\n\n<!-- ai-office:skills:inicio -->\nnuevo\n<!-- ai-office:skills:fin -->\n\nDespués.\n',
  )
})

test('upsertSection + removeSection devuelve el cuerpo original byte a byte (sin prosa después)', () => {
  const body = '# Cuerpo\n\nProsa escrita a mano por el usuario.\n'
  const conSeccion = upsertSection(body, 'skills', 'contenido de prueba')
  assert.equal(removeSection(conSeccion, 'skills'), body)
})

test('upsertSection + removeSection devuelve el cuerpo original con prosa antes y después', () => {
  const body = 'Antes de la sección.\n\nY esto sigue después, también escrito a mano.\n'
  const conSeccion = upsertSection(body, 'skills', 'contenido')
  assert.equal(removeSection(conSeccion, 'skills'), body)
})

test('la sección soporta contenido con líneas en blanco', () => {
  const content = 'línea 1\n\nlínea 2\n\nlínea 3'
  const body = 'Prosa.\n'
  const out = upsertSection(body, 'notas', content)
  assert.equal(readSection(out, 'notas'), content)
  assert.equal(removeSection(out, 'notas'), body)
})

test('la sección soporta contenido con caracteres especiales de regex', () => {
  const content = 'costo: $100 (aprox.) — patrón: a.*b+c? [x] {y} | z^$ \\n literal'
  const body = 'Prosa.\n'
  const out = upsertSection(body, 'notas', content)
  assert.equal(readSection(out, 'notas'), content)
  assert.equal(removeSection(out, 'notas'), body)
})

test('removeSection no hace nada si la sección no existe', () => {
  const body = 'Prosa sin secciones.\n'
  assert.equal(removeSection(body, 'skills'), body)
})

test('upsertSection en un cuerpo vacío', () => {
  const out = upsertSection('', 'skills', 'contenido')
  assert.equal(readSection(out, 'skills'), 'contenido')
  assert.equal(removeSection(out, 'skills'), '')
})
