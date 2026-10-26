import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  applyInstall,
  applyUninstall,
  EVENTS_TO_INSTALL,
  installRelay,
  planInstall,
  planUninstall,
  stableRelayPath,
} from '../src/claude-code/install.ts'

const RELAY_PATH = '/home/dev/ai-office/packages/hook-relay/bin/ai-office-hook.mjs'

/**
 * Réplica de un settings.json típico con tres hooks ajenos (más un puñado de
 * claves ajenas alrededor, para comprobar que ni se tocan). Se genera con `JSON.stringify(obj,
 * null, 2)`, exactamente como lo escribe Claude Code, para que la prueba de ida y vuelta byte a
 * byte sea honesta: el archivo real también sale de una herramienta, no de alguien tecleando JSON
 * a mano.
 */
const fixtureObj = {
  cleanupPeriodDays: 30,
  attribution: { commit: '', pr: '' },
  permissions: {
    allow: ['Bash(ls:*)', 'Bash(git status:*)'],
    defaultMode: 'default',
  },
  model: 'opus',
  hooks: {
    SessionStart: [
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: "bash '/home/dev/.claude/hooks/session-status.sh' session",
            timeout: 10,
          },
        ],
      },
    ],
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: "bash '/home/dev/tools/guard/pre-bash.sh'",
            timeout: 15,
            statusMessage: 'Checking dev servers…',
          },
        ],
      },
    ],
    SessionEnd: [
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: "bash '/home/dev/tools/journal/on-session-end.sh'",
            timeout: 5,
            statusMessage: 'Anotando la sesión…',
            async: true,
          },
        ],
      },
    ],
  },
  worktree: { symlinkDirectories: ['node_modules', 'target', '.venv'] },
}

const FIXTURE = `${JSON.stringify(fixtureObj, null, 2)}\n`

test('los tres hooks ajenos sobreviven intactos y en su posición', () => {
  const plan = planInstall(FIXTURE, RELAY_PATH)
  const out = JSON.parse(plan.text)

  assert.deepEqual(out.hooks.SessionStart[0].hooks[0], fixtureObj.hooks.SessionStart[0]!.hooks[0])
  assert.deepEqual(out.hooks.SessionEnd[0].hooks[0], fixtureObj.hooks.SessionEnd[0]!.hooks[0])
  assert.deepEqual(out.hooks.PreToolUse[0], fixtureObj.hooks.PreToolUse[0])

  // el nuestro se sumó al MISMO grupo matcher "*" que ya tenían SessionStart y SessionEnd
  assert.equal(out.hooks.SessionStart.length, 1)
  assert.equal(out.hooks.SessionStart[0].hooks.length, 2)
  assert.equal(out.hooks.SessionEnd.length, 1)
  assert.equal(out.hooks.SessionEnd[0].hooks.length, 2)
})

test('el hook de PreToolUse queda después del del guardián de Bash', () => {
  const plan = planInstall(FIXTURE, RELAY_PATH)
  const out = JSON.parse(plan.text)

  assert.equal(out.hooks.PreToolUse.length, 2)
  assert.equal(out.hooks.PreToolUse[0].matcher, 'Bash') // el ajeno: intacto, sigue primero
  assert.equal(out.hooks.PreToolUse[1].matcher, '*') // el nuestro: grupo nuevo, al final
  assert.ok(out.hooks.PreToolUse[1].hooks[0].command.includes('ai-office-hook'))
})

test('instalar añade un hook marcado en cada evento de la lista', () => {
  const plan = planInstall(FIXTURE, RELAY_PATH)
  const out = JSON.parse(plan.text)
  for (const evento of [
    'SessionStart',
    'SessionEnd',
    'UserPromptSubmit',
    'Stop',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'SubagentStart',
    'SubagentStop',
    'PermissionRequest',
    'PermissionDenied',
    'Notification',
    'PreCompact',
    'PostCompact',
  ]) {
    const groups = out.hooks[evento]
    assert.ok(Array.isArray(groups) && groups.length > 0, `falta el evento ${evento}`)
    const tieneNuestro = groups.some((g: { hooks: Array<{ command: string }> }) =>
      g.hooks.some((h) => h.command.includes('ai-office-hook')),
    )
    assert.ok(tieneNuestro, `${evento} no tiene el hook de ai-office`)
  }
  assert.equal(plan.changed, true)
})

test('un evento nuevo (sin grupo previo) se crea con matcher "*" y un solo hook', () => {
  const plan = planInstall(FIXTURE, RELAY_PATH)
  const out = JSON.parse(plan.text)
  assert.equal(out.hooks.PermissionRequest.length, 1)
  assert.equal(out.hooks.PermissionRequest[0].matcher, '*')
  assert.equal(out.hooks.PermissionRequest[0].hooks.length, 1)
})

test('los hooks propios llevan async, timeout 5 y statusMessage', () => {
  const plan = planInstall(FIXTURE, RELAY_PATH)
  const out = JSON.parse(plan.text)
  const ours = out.hooks.UserPromptSubmit[0].hooks[0]
  assert.equal(ours.async, true)
  assert.equal(ours.timeout, 5)
  assert.equal(ours.statusMessage, 'ai-office')
  assert.match(ours.command, /ai-office-hook/)
})

test('instalar dos veces no duplica', () => {
  const once = planInstall(FIXTURE, RELAY_PATH)
  const twice = planInstall(once.text, RELAY_PATH)
  assert.equal(twice.changed, false)
  assert.equal(twice.text, once.text)

  const out = JSON.parse(twice.text)
  const count = out.hooks.SessionStart[0].hooks.filter((h: { command: string }) =>
    h.command.includes('ai-office-hook'),
  ).length
  assert.equal(count, 1)
})

test('instalar + desinstalar devuelve el JSON byte a byte idéntico al original', () => {
  const installed = planInstall(FIXTURE, RELAY_PATH)
  const uninstalled = planUninstall(installed.text)
  assert.equal(uninstalled.text, FIXTURE)
  assert.equal(uninstalled.changed, true)
})

test('desinstalar sin haber instalado no cambia nada', () => {
  const plan = planUninstall(FIXTURE)
  assert.equal(plan.changed, false)
  assert.equal(plan.text, FIXTURE)
})

test('desinstalar no toca el grupo ajeno de PreToolUse aunque quede el único de ese evento', () => {
  const installed = planInstall(FIXTURE, RELAY_PATH)
  const uninstalled = planUninstall(installed.text)
  const out = JSON.parse(uninstalled.text)
  assert.equal(out.hooks.PreToolUse.length, 1)
  assert.equal(out.hooks.PreToolUse[0].matcher, 'Bash')
  assert.deepEqual(out.hooks.PreToolUse[0], fixtureObj.hooks.PreToolUse[0])
})

test('un settings.json ilegible no revienta con una excepción críptica', () => {
  assert.throws(() => planInstall('{ esto no es json', RELAY_PATH), /ilegible/)
  assert.throws(() => planInstall('[]', RELAY_PATH), /objeto JSON/)
})

// --- eventos, creación, symlink, ruta estable --------------------------------------------------

/** Un CLAUDE_HOME de usar y tirar: el backup y el relay estable caen dentro, no en ~/.claude. */
const scratchHome = (): string => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aio-install-')))
  process.env.CLAUDE_HOME = home
  return home
}

test('la lista de eventos coincide con hooks/hooks.json del plugin', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../../hooks/hooks.json', import.meta.url), 'utf8'),
  ) as { hooks: Record<string, unknown> }
  assert.deepEqual([...EVENTS_TO_INSTALL].sort(), Object.keys(manifest.hooks).sort())
})

test('applyInstall crea settings.json cuando no existe', async () => {
  const home = scratchHome()
  const settings = join(home, 'settings.json')
  const plan = await applyInstall(settings, RELAY_PATH)
  assert.equal(plan.changed, true)
  const out = JSON.parse(readFileSync(settings, 'utf8'))
  assert.equal(Object.keys(out.hooks).length, EVENTS_TO_INSTALL.length)
  assert.ok(readFileSync(settings, 'utf8').endsWith('\n'))

  // Y desinstalar lo deja sin hooks, sin romper.
  await applyUninstall(settings)
  assert.equal(JSON.parse(readFileSync(settings, 'utf8')).hooks, undefined)
})

test('si settings.json es un symlink, se escribe en su destino y el enlace sigue siendo enlace', async () => {
  const home = scratchHome()
  const store = join(home, 'dotfiles')
  mkdirSync(store)
  const real = join(store, 'settings.json')
  writeFileSync(real, FIXTURE)
  chmodSync(real, 0o640)
  const link = join(home, 'settings.json')
  symlinkSync(real, link)

  await applyInstall(link, RELAY_PATH)

  assert.ok(lstatSync(link).isSymbolicLink(), 'el enlace no se reemplaza por un archivo suelto')
  assert.match(readFileSync(real, 'utf8'), /ai-office-hook/)
  assert.equal(statSync(real).mode & 0o777, 0o640, 'conserva los permisos')

  await applyUninstall(link)
  assert.equal(readFileSync(real, 'utf8'), FIXTURE)
})

test('un symlink roto no se reemplaza: error claro', async () => {
  const home = scratchHome()
  const link = join(home, 'settings.json')
  symlinkSync(join(home, 'no-existe.json'), link)
  await assert.rejects(() => applyInstall(link, RELAY_PATH), /enlace roto/)
  assert.ok(lstatSync(link).isSymbolicLink())
})

test('el relay se copia a una ruta estable bajo ~/.claude/ai-office/bin', async () => {
  const home = scratchHome()
  const source = join(home, 'cache-npx-_npx-123-ai-office-hook.mjs')
  writeFileSync(source, '// relay v1\n')
  assert.equal(stableRelayPath(), join(home, 'ai-office', 'bin', 'ai-office-hook.mjs'))

  assert.equal(await installRelay(source), true)
  assert.equal(readFileSync(stableRelayPath(), 'utf8'), '// relay v1\n')
  assert.equal(await installRelay(source), false, 'sin cambios no reescribe')
  writeFileSync(source, '// relay v2\n')
  assert.equal(await installRelay(source), true)
  assert.ok(existsSync(stableRelayPath()))
})

test('un hook propio con otra ruta (caché de npx purgada) se corrige en el sitio', () => {
  const viejo = planInstall(FIXTURE, '/home/u/.npm/_npx/abc/ai-office-hook.mjs')
  const nuevo = planInstall(viejo.text, RELAY_PATH)
  assert.equal(nuevo.changed, true)
  const out = JSON.parse(nuevo.text)
  const ours = out.hooks.SessionStart[0].hooks.filter((h: { command: string }) =>
    h.command.includes('ai-office-hook'),
  )
  assert.equal(ours.length, 1)
  assert.ok(ours[0].command.includes(RELAY_PATH))
})

test('desinstalar no borra arrays ni grupos vacíos que puso el usuario', () => {
  // Eventos que ai-office no instala: ni el array vacío ni el grupo sin hooks son nuestros.
  const text = JSON.stringify(
    { hooks: { Elicitation: [], Setup: [{ matcher: 'x', hooks: [] }] } },
    null,
    2,
  )
  const plan = planUninstall(text)
  assert.equal(plan.changed, false)
  assert.equal(plan.text, text)

  // Y tras instalar y desinstalar siguen ahí: solo se va lo nuestro.
  const out = JSON.parse(planUninstall(planInstall(text, RELAY_PATH).text).text)
  assert.deepEqual(out.hooks, { Elicitation: [], Setup: [{ matcher: 'x', hooks: [] }] })
})
