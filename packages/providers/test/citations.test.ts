import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Agent, Scope, Skill } from '@ai-office/core'
import { parseMarkdownDoc } from '../src/claude-code/frontmatter.ts'
import { agentSkillEdges } from '../src/claude-code/graph.ts'
import { planSetAgentSkillMentions, skillCitation } from '../src/claude-code/mutations.ts'

const source = (path: string) => ({
  path,
  realPath: path,
  mtimeMs: 0,
  size: 0,
  symlink: false,
  projections: [],
  readOnly: false,
})

const skill = (name: string, scope: Scope, status: Skill['status'] = 'active'): Skill => ({
  id: `skill:claude-code/${scope}/${name}`,
  kind: 'skill',
  name,
  scope,
  provider: 'claude-code',
  description: '',
  source: source(`/skills/${name}/SKILL.md`),
  status,
  problems: [],
  bodyStartLine: 1,
  allowedTools: null,
  disabledForModel: false,
  metadata: null,
  dir: `/skills/${name}`,
  body: '',
  descriptionTokens: 0,
  bodyTokens: 0,
})

const agentWith = (body: string): Agent => ({
  id: 'agent:claude-code/user/rev',
  kind: 'agent',
  name: 'rev',
  scope: 'user',
  provider: 'claude-code',
  description: '',
  source: source('/agents/rev.md'),
  status: 'active',
  problems: [],
  bodyStartLine: 1,
  tools: null,
  model: null,
  color: null,
  preloadedSkills: [],
  body,
  bodyTokens: 0,
})

const SKILLS = [
  skill('style-guide', 'user'),
  skill('deploy', 'project'),
  skill('kit:lint', 'plugin'),
]
const DOC = '---\nname: rev\ndescription: d\n---\nProsa a mano.\n'

test('la cita dice la skill como se invoca y donde vive, según su ámbito', () => {
  assert.equal(skillCitation('style-guide', SKILLS), '`~/.claude/skills/style-guide/SKILL.md`')
  assert.equal(skillCitation('deploy', SKILLS), '`.claude/skills/deploy/SKILL.md`')
  // Un plugin se cita por su nombre invocable: sus archivos cambian de versión y de carpeta.
  assert.equal(skillCitation('kit:lint', SKILLS), '`kit:lint`')
  // Una skill que el catálogo no conoce se cita como de usuario (lo de siempre).
  assert.equal(skillCitation('fantasma', SKILLS), '`~/.claude/skills/fantasma/SKILL.md`')
  // Con el mismo nombre en dos ámbitos, la que se carga y no la tapada.
  const dup = [skill('x', 'project', 'shadowed'), skill('x', 'user')]
  assert.equal(skillCitation('x', dup), '`~/.claude/skills/x/SKILL.md`')
})

test('ida y vuelta: lo que se escribe como cita lo lee el grafo declarado, en las tres formas', () => {
  const names = ['style-guide', 'deploy', 'kit:lint']
  const plan = planSetAgentSkillMentions('/agents/rev.md', DOC, names, SKILLS)
  assert.match(plan.after, /- \*\*kit:lint\*\* — `kit:lint`/)
  assert.match(plan.after, /- \*\*deploy\*\* — `\.claude\/skills\/deploy\/SKILL\.md`/)
  const body = parseMarkdownDoc(plan.after).body
  const edges = agentSkillEdges([agentWith(body)], SKILLS)
  assert.deepEqual(
    edges.map((e) => [e.to, e.layer]).sort(),
    SKILLS.map((s) => [s.id, 'declared']).sort(),
  )
})

test('citar `plugin:nombre` no cuenta como citar la skill de usuario `nombre`', () => {
  const skills = [skill('lint', 'user'), skill('kit:lint', 'plugin')]
  const body = '\nUsa `kit:lint` siempre.\n'
  const edges = agentSkillEdges([agentWith(body)], skills)
  assert.deepEqual(
    edges.map((e) => e.to),
    ['skill:claude-code/plugin/kit:lint'],
  )
})
