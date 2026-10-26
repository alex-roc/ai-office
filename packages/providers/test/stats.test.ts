import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyCatalog, type Skill } from '@ai-office/core'
import type { EntityActivity } from '../src/claude-code/proven.ts'
import { parseHistoryWindowDays, skillStats } from '../src/claude-code/stats.ts'

const skill = (name: string, disabledForModel = false): Skill =>
  ({
    id: `skill:claude-code/user/${name}`,
    kind: 'skill',
    name,
    disabledForModel,
    descriptionTokens: 10,
  }) as Skill

const active = (id: string): [string, EntityActivity] => [
  id,
  {
    id,
    name: id,
    uses: 5,
    sessions: 3,
    projects: 1,
    lastUsedAt: Date.now(),
    grade: 'practicing',
    active: true,
  },
]

test('jubilar una skill sin uso sube el ratio activo', () => {
  const usada = skill('usada')
  const activity = new Map([active(usada.id)])
  const antes = skillStats({ ...emptyCatalog(), skills: [usada, skill('muerta')] }, activity)
  const despues = skillStats(
    { ...emptyCatalog(), skills: [usada, skill('muerta', true)] },
    activity,
  )

  assert.equal(antes.activeRatio, 0.5)
  assert.equal(despues.activeRatio, 1)
  assert.equal(despues.skillsRetired, 1)
  assert.equal(despues.skillsLive, 1)
})

test('una jubilada no cuenta ni como sin usar ni en el coste de descriptions', () => {
  const s = skillStats({ ...emptyCatalog(), skills: [skill('a'), skill('b', true)] }, new Map())
  assert.equal(s.skillsUnused, 1)
  assert.equal(s.descriptionTokens, 10)
  assert.equal(s.deadDescriptionTokens, 10)
})

test('sin skills vivas el ratio es 0, no NaN', () => {
  const s = skillStats({ ...emptyCatalog(), skills: [skill('a', true)] }, new Map())
  assert.equal(s.activeRatio, 0)
})

test('la ventana del historial sale de cleanupPeriodDays, con 30 por defecto', () => {
  assert.equal(parseHistoryWindowDays(null), 30)
  assert.equal(parseHistoryWindowDays('{}'), 30)
  assert.equal(parseHistoryWindowDays('{"cleanupPeriodDays": 90}'), 90)
  assert.equal(parseHistoryWindowDays('{"cleanupPeriodDays": 0}'), null)
  assert.equal(parseHistoryWindowDays('{"cleanupPeriodDays": "mucho"}'), null)
  assert.equal(parseHistoryWindowDays('no es json'), 30)
})
