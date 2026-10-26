import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { interfaceUrl } from '../src/commands/start.ts'
import { writeDemoHome } from '../src/demo/synth.ts'
import { cliVersion, resolvePort } from '../src/env.ts'
import { flatKeys, messagesFor, resolveLang } from '../src/i18n.ts'

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

test('la ayuda sale en inglés por defecto y en español con --lang es', () => {
  const help = run('--help')
  for (const expected of ['diagnosis', 'census', '--poster', '--no-open', 'doctor', '--lang']) {
    assert.ok(help.includes(expected), `missing «${expected}» in the help`)
  }
  assert.ok(!/diagnóstico|instalación|esta máquina/.test(help), 'Spanish in the English help')
  assert.ok(!/ai-office censo/.test(help), 'the alias is not advertised')

  for (const es of [run('--help', '--lang', 'es'), run('--lang=es', '--help')]) {
    for (const expected of ['diagnóstico', 'instalación', 'esta máquina', '--poster']) {
      assert.ok(es.includes(expected), `falta «${expected}» en la ayuda`)
    }
    assert.ok(!/diagnostico|maquina|instalacion/.test(es), 'palabras sin acento en la ayuda')
  }
})

test('el idioma sale de --lang, AI_OFFICE_LANG o la opción del plugin; por defecto en', () => {
  assert.equal(resolveLang([], {}).lang, 'en')
  // El idioma del sistema NO cuenta.
  assert.equal(resolveLang([], { LANG: 'es_ES.UTF-8' }).lang, 'en')
  assert.equal(resolveLang([], { CLAUDE_PLUGIN_OPTION_LANGUAGE: 'es' }).lang, 'es')
  assert.equal(
    resolveLang([], { AI_OFFICE_LANG: 'en', CLAUDE_PLUGIN_OPTION_LANGUAGE: 'es' }).lang,
    'en',
  )
  const r = resolveLang(['census', '--lang', 'ES', '--poster'], { AI_OFFICE_LANG: 'en' })
  assert.equal(r.lang, 'es')
  assert.deepEqual(r.args, ['census', '--poster'], 'la opción se retira de los argumentos')
  assert.equal(resolveLang(['--lang=es'], {}).lang, 'es')
  assert.throws(() => resolveLang(['--lang', 'fr'], {}), /not supported/)
  assert.throws(() => resolveLang(['--lang'], {}), /needs a value/)
})

test('el catálogo es tiene exactamente las mismas claves que en', () => {
  const en = flatKeys(messagesFor('en')).sort()
  const es = flatKeys(messagesFor('es')).sort()
  assert.deepEqual(es, en)
  assert.ok(en.length > 60)
})

test('los mensajes con función dan texto distinto en cada idioma', () => {
  const en = messagesFor('en')
  const es = messagesFor('es')
  assert.equal(en.census.agentsIdle(1234, 'x'), '1,234 have not worked x')
  assert.equal(es.census.agentsIdle(1234, 'x'), '1.234 no han trabajado x')
  assert.equal(en.census.cites(1), 'cites 1 skill')
  assert.equal(en.census.cites(2), 'cites 2 skills')
  assert.equal(es.census.rel.days(3), 'hace 3 días')
})

test('la URL lleva ?lang=es antes del hash solo en español', () => {
  const url = 'http://127.0.0.1:7377/#t=abc'
  assert.equal(interfaceUrl(url, 'en'), url)
  assert.equal(interfaceUrl(url, 'es'), 'http://127.0.0.1:7377/?lang=es#t=abc')
  assert.equal(interfaceUrl('http://h/?x=1#t=a', 'es'), 'http://h/?x=1&lang=es#t=a')
})

test('census sobre la demo: inglés por defecto, español con --lang, y los alias antiguos', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aio-cli-census-'))
  try {
    await writeDemoHome(home)
    const env = { ...process.env, CLAUDE_HOME: home, CLAUDE_CONFIG_DIR: home, NO_COLOR: '1' }
    const exec = (...args: string[]) =>
      execFileSync(process.execPath, [INDEX, ...args], { encoding: 'utf8', env, cwd: home })
    const en = exec('census')
    assert.match(en, /ai-office · census/)
    assert.match(en, /agents/)
    assert.match(en, /active ratio/)
    assert.doesNotMatch(en, /censo|ratio activo/)
    const es = exec('census', '--lang', 'es')
    assert.match(es, /ai-office · censo/)
    assert.match(es, /ratio activo/)
    // `censo` sigue siendo un alias, y `--cartel` de `--poster`.
    assert.match(exec('censo'), /ai-office · census/)
    exec('census', '--cartel')
    const svg = readFileSync(join(home, 'ai-office-census.svg'), 'utf8')
    assert.match(svg, /My Claude Code setup/)
    exec('census', '--poster', 'cartel.svg', '--lang', 'es')
    assert.match(readFileSync(join(home, 'cartel.svg'), 'utf8'), /Mi configuración de Claude Code/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('el puerto sale de AI_OFFICE_PORT o de la opción del plugin, y se valida', () => {
  assert.equal(resolvePort({}), 7377)
  assert.equal(resolvePort({ CLAUDE_PLUGIN_OPTION_PORT: '8123' }), 8123)
  assert.equal(resolvePort({ AI_OFFICE_PORT: '9000', CLAUDE_PLUGIN_OPTION_PORT: '8123' }), 9000)
  assert.throws(() => resolvePort({ AI_OFFICE_PORT: 'abc' }), /is not valid/)
  assert.throws(() => resolvePort({ AI_OFFICE_PORT: '70000' }), /is not valid/)
})
