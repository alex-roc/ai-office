import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMarkdownDoc, setFrontmatterFields } from '../src/claude-code/frontmatter.ts'

const DOC = `---
name: code-reviewer
# un comentario que el usuario escribio a mano
description: "Asesor contable, con comillas"
tools: Read, Grep
model: opus
---

# Cuerpo

Antes de trabajar, lee \`~/.claude/skills/style-guide/SKILL.md\`.
`

test('lee el frontmatter y separa el cuerpo', () => {
  const d = parseMarkdownDoc(DOC)
  assert.equal(d.data.name, 'code-reviewer')
  assert.equal(d.data.model, 'opus')
  assert.ok(d.body.startsWith('\n# Cuerpo'))
  assert.equal(d.bodyStartLine, 8)
})

test('escribir el mismo valor no toca el archivo', () => {
  const r = setFrontmatterFields(DOC, { model: 'opus' })
  assert.equal(r.changed, false)
  assert.equal(r.text, DOC)
})

test('anadir y quitar una clave devuelve el archivo byte a byte', () => {
  const conColor = setFrontmatterFields(DOC, { color: 'blue' })
  assert.equal(conColor.changed, true)
  assert.match(conColor.text, /color: blue/)
  const vuelta = setFrontmatterFields(conColor.text, { color: undefined })
  assert.equal(vuelta.text, DOC, 'la ida y vuelta debe ser exacta')
})

test('preserva comentarios y estilo de comillas del usuario', () => {
  const r = setFrontmatterFields(DOC, { color: 'red' })
  assert.match(r.text, /# un comentario que el usuario escribio a mano/)
  assert.match(r.text, /description: "Asesor contable, con comillas"/)
})

test('se niega a editar un archivo sin frontmatter', () => {
  assert.throws(() => setFrontmatterFields('# solo cuerpo\n', { color: 'red' }), /frontmatter/)
})
