import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { cliVersion, resolvePort } from '../src/env.ts'

const INDEX = fileURLToPath(new URL('../src/index.ts', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
}

const run = (...args: string[]) =>
  execFileSync(process.execPath, [INDEX, ...args], { encoding: 'utf8' })

test('--version y -v imprimen la versión de packages/cli/package.json', () => {
  assert.equal(cliVersion(), pkg.version)
  assert.equal(run('--version').trim(), pkg.version)
  assert.equal(run('-v').trim(), pkg.version)
})

test('la ayuda lleva acentos y lista los comandos y opciones', () => {
  const help = run('--help')
  for (const expected of [
    'diagnóstico',
    'instalación',
    'esta máquina',
    '--no-open',
    'doctor',
    '--version',
  ]) {
    assert.ok(help.includes(expected), `falta «${expected}» en la ayuda`)
  }
  assert.ok(!/diagnostico|maquina|instalacion/.test(help), 'palabras sin acento en la ayuda')
})

test('el puerto sale de AI_OFFICE_PORT o de la opción del plugin, y se valida', () => {
  assert.equal(resolvePort({}), 7377)
  assert.equal(resolvePort({ CLAUDE_PLUGIN_OPTION_PORT: '8123' }), 8123)
  assert.equal(resolvePort({ AI_OFFICE_PORT: '9000', CLAUDE_PLUGIN_OPTION_PORT: '8123' }), 9000)
  assert.throws(() => resolvePort({ AI_OFFICE_PORT: 'abc' }), /no es válido/)
  assert.throws(() => resolvePort({ AI_OFFICE_PORT: '70000' }), /no es válido/)
})
