import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planInstall, planUninstall } from '../src/claude-code/install.ts'

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
