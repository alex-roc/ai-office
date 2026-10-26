import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { archetypeOf } from '../src/sala/archetypes.ts'

const de = (d: string) => archetypeOf(d, 'x')

describe('arquetipos en inglés', () => {
  it('reconoce los oficios más comunes de una instalación en inglés', () => {
    assert.equal(de('Reviews pull requests for correctness'), 'auditor')
    assert.equal(de('Runs the test suite and QA checks'), 'auditor')
    assert.equal(de('Security audit of dependencies'), 'auditor')
    assert.equal(de('Deep research on a topic with citations'), 'investigador')
    assert.equal(de('Technical writer for API documentation'), 'redactor')
    assert.equal(de('Data analyst for BigQuery'), 'analista')
    assert.equal(de('Handles release and deploy pipelines'), 'ingeniero')
    assert.equal(de('Legal counsel for contract questions'), 'jurista')
    assert.equal(de('Tracks the finance and tax filings'), 'contable')
    assert.equal(de('Marketing campaign planner'), 'estratega')
    assert.equal(de('Answers customer support tickets'), 'gestor')
  })

  it('no confunde palabras que solo contienen un término corto', () => {
    // "flaw" contiene "law" y "syntax" contiene "tax": no son jurista ni contable.
    assert.equal(de('Fixes a flaw in the syntax tree'), 'generico')
  })

  it('el español sigue igual', () => {
    assert.equal(de('Redacta artículos para el boletín'), 'redactor')
    assert.equal(de('Revisión de contratos y normativa'), 'jurista')
  })

  it('sin pistas cae en genérico', () => {
    assert.equal(de('Hace cosas variadas'), 'generico')
  })
})
