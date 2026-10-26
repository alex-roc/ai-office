import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { paths } from '../src/claude-code/paths.ts'

const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
  const saved = {
    CLAUDE_HOME: process.env.CLAUDE_HOME,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  }
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('sin variables: ~/.claude y ~/.claude.json fuera de él', () => {
  withEnv({ CLAUDE_HOME: undefined, CLAUDE_CONFIG_DIR: undefined }, () => {
    const p = paths()
    assert.equal(p.home, join(homedir(), '.claude'))
    assert.equal(p.usageJson, join(homedir(), '.claude.json'))
  })
})

test('CLAUDE_CONFIG_DIR (la oficial) mueve todo, incluido .claude.json, dentro del directorio', () => {
  withEnv({ CLAUDE_HOME: undefined, CLAUDE_CONFIG_DIR: '/cuentas/trabajo' }, () => {
    const p = paths()
    assert.equal(p.home, '/cuentas/trabajo')
    assert.equal(p.settings, '/cuentas/trabajo/settings.json')
    assert.equal(p.ours, '/cuentas/trabajo/ai-office')
    assert.equal(p.usageJson, '/cuentas/trabajo/.claude.json')
  })
})

test('CLAUDE_HOME (la nuestra, para pruebas) manda sobre CLAUDE_CONFIG_DIR', () => {
  withEnv({ CLAUDE_HOME: '/prueba', CLAUDE_CONFIG_DIR: '/cuentas/trabajo' }, () => {
    assert.equal(paths().home, '/prueba')
  })
})
