import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CERTIFICATION_TTL_DAYS, GRADE_LABELS, gradeOf, isActiveGrade } from '../src/graph/types.ts'

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

test('las etiquetas de grado existen en los dos idiomas y cubren los mismos grados', () => {
  assert.deepEqual(Object.keys(GRADE_LABELS.es).sort(), Object.keys(GRADE_LABELS.en).sort())
  assert.equal(GRADE_LABELS.en.certified, 'certified')
  assert.equal(GRADE_LABELS.es.certified, 'acreditada')
})

const DIA = 24 * 60 * 60 * 1000
const ahora = Date.UTC(2026, 9, 26)

test('midiendo un proyecto, acreditada pide dos semanas distintas en vez de dos proyectos', () => {
  const base = { uses: 5, sessions: 4, projects: 1, lastUsedAt: ahora - DIA }
  assert.equal(gradeOf({ ...base, weeks: 1 }, ahora, { singleProject: true }), 'practicing')
  assert.equal(gradeOf({ ...base, weeks: 2 }, ahora, { singleProject: true }), 'certified')
  // Sin medir un proyecto, sigue mandando el número de proyectos.
  assert.equal(gradeOf({ ...base, weeks: 5 }, ahora), 'practicing')
  assert.equal(gradeOf({ ...base, projects: 2 }, ahora), 'certified')
})

test('caducada no se acredita ni midiendo un proyecto', () => {
  const viejo = { uses: 9, sessions: 9, projects: 1, weeks: 6, lastUsedAt: ahora - 120 * DIA }
  assert.equal(gradeOf(viejo, ahora, { singleProject: true }), 'practicing')
})
