import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Agent, Skill } from '@ai-office/core'
import { agentSkillEdges } from '../src/claude-code/graph.ts'

const source = (path: string) => ({
  path,
  realPath: path,
  mtimeMs: 0,
  size: 0,
  symlink: false,
  projections: [],
  readOnly: false,
})

const agent = (name: string, body: string, preloaded: string[] = []): Agent => ({
  id: `agent:claude-code/user/${name}`,
  kind: 'agent',
  name,
  scope: 'user',
  provider: 'claude-code',
  description: '',
  source: source(`/agents/${name}.md`),
  status: 'active',
  problems: [],
  bodyStartLine: 7,
  tools: null,
  model: null,
  color: null,
  preloadedSkills: preloaded,
  body,
  bodyTokens: 0,
})

const skill = (name: string): Skill => ({
  id: `skill:claude-code/user/${name}`,
  kind: 'skill',
  name,
  scope: 'user',
  provider: 'claude-code',
  description: '',
  source: source(`/skills/${name}/SKILL.md`),
  status: 'active',
  problems: [],
  bodyStartLine: 5,
  allowedTools: null,
  disabledForModel: false,
  metadata: null,
  dir: `/skills/${name}`,
  body: '',
  descriptionTokens: 0,
  bodyTokens: 0,
})

const skills = [skill('style-guide'), skill('release-tools'), skill('dataviz')]

test('encuentra una skill citada en la prosa y cita la linea real del archivo', () => {
  // La cita esta en la linea 3 del cuerpo; con bodyStartLine 7 es la 9 del archivo.
  const a = agent(
    'code-reviewer',
    '\n\nAntes de trabajar, lee `~/.claude/skills/style-guide/SKILL.md`.\n',
  )
  const edges = agentSkillEdges([a], skills)
  const e = edges.find((x) => x.to.endsWith('style-guide'))
  assert.ok(e, 'debe encontrar la arista declarada')
  assert.equal(e.layer, 'declared')
  assert.equal(e.evidence[0]?.line, 9)
})

test('el campo skills: produce una arista precargada, no declarada', () => {
  const edges = agentSkillEdges([agent('x', 'cuerpo sin citas', ['release-tools'])], skills)
  assert.equal(edges.length, 1)
  assert.equal(edges[0]?.layer, 'preloaded')
  assert.equal(edges[0]?.evidence[0]?.field, 'skills')
})

test('marca como rota una precarga que apunta a una skill inexistente', () => {
  const edges = agentSkillEdges([agent('x', '', ['no-existe'])], skills)
  assert.equal(edges[0]?.dangling, true)
})

test('ignora menciones dentro de bloques de codigo', () => {
  const a = agent('x', '```\nrelease-tools\nrelease-tools\n```\n')
  assert.equal(agentSkillEdges([a], skills).length, 0)
})

test('una sola mencion suelta y ambigua no basta para afirmar una relacion', () => {
  const debil = agent('x', 'hablamos de dataviz en general\n')
  assert.equal(agentSkillEdges([debil], skills).length, 0)
  const fuerte = agent('y', 'usa el skill `dataviz` para graficos\n')
  assert.equal(agentSkillEdges([fuerte], skills).length, 1)
})

test('no inventa autodelegaciones ni aristas de sustring', () => {
  const a = agent('x', 'el paquete mi-release-tools-viejo no es release-tools\n')
  const edges = agentSkillEdges([a], skills)
  // "mi-release-tools-viejo" no debe contar; solo la mencion real al final.
  assert.equal(edges.length, 0, 'una sola mencion no explicita no basta')
})
