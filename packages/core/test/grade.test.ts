import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CERTIFICATION_TTL_DAYS, gradeOf, isActiveGrade } from '../src/graph/types.ts'

const DAY = 86400000
const now = Date.now()

test('sin usos no hay grado', () => {
  assert.equal(gradeOf({ uses: 0, sessions: 0, projects: 0, lastUsedAt: null }, now), 'unused')
})

test('la escala satura: el uso 50 no vale mas que el 3', () => {
  const pocos = gradeOf({ uses: 3, sessions: 3, projects: 2, lastUsedAt: now }, now)
  const muchos = gradeOf({ uses: 500, sessions: 3, projects: 2, lastUsedAt: now }, now)
  assert.equal(pocos, muchos)
  assert.equal(pocos, 'certified')
})

test('acreditar exige variedad de proyectos, no volumen', () => {
  assert.equal(gradeOf({ uses: 99, sessions: 30, projects: 1, lastUsedAt: now }, now), 'practicing')
})

test('la acreditacion caduca y solo se renueva trabajando', () => {
  const viejo = now - (CERTIFICATION_TTL_DAYS + 1) * DAY
  assert.equal(
    gradeOf({ uses: 50, sessions: 9, projects: 3, lastUsedAt: viejo }, now),
    'practicing',
  )
})

test('solo cuentan como activos practicing y certified', () => {
  assert.equal(isActiveGrade('certified'), true)
  assert.equal(isActiveGrade('practicing'), true)
  assert.equal(isActiveGrade('tried'), false)
  assert.equal(isActiveGrade('unused'), false)
})
