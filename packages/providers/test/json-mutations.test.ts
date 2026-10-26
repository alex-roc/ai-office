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
import { OfficeError } from '../src/claude-code/errors.ts'
import {
  ABSENT_ETAG,
  applySetClaudeJsonMcpDisabled,
  applySetMcpjsonDisabled,
  applySetPluginEnabled,
  planSetClaudeJsonMcpDisabled,
  planSetMcpjsonDisabled,
  planSetPluginEnabled,
  readJsonTarget,
} from '../src/claude-code/json-mutations.ts'
import { ConflictError } from '../src/claude-code/mutations.ts'

const sandbox = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aio-jsonmut-')))
  const home = join(root, 'claude')
  const proj = join(root, 'proj')
  mkdirSync(home, { recursive: true })
  mkdirSync(proj, { recursive: true })
  process.env.CLAUDE_HOME = home
  return { root, home, proj }
}

const SETTINGS = `${JSON.stringify(
  {
    permissions: { allow: ['Bash(ls)'] },
    enabledPlugins: { 'kit@mk': true, 'otro@mk': false },
    hooks: {},
  },
  null,
  2,
)}\n`

const read = (p: string) => readFileSync(p, 'utf8')

/** plan → apply con el etag del plan, como hace el daemon. */
const planApplyPlugin = async (
  path: string,
  key: string,
  enabled: boolean,
  roots: string[] = [],
) => {
  const target = await readJsonTarget(path)
  const plan = planSetPluginEnabled(target.path, target.text, key, enabled)
  const result = await applySetPluginEnabled(
    key,
    `plugin:claude-code/plugin/${key}`,
    path,
    enabled,
    target.etag,
    {
      extraAllowedRoots: roots,
    },
  )
  return { plan, result }
}

test('plugin.disable y enable: diff mínimo y vuelta byte a byte', async () => {
  const { home } = sandbox()
  const path = join(home, 'settings.json')
  writeFileSync(path, SETTINGS)
  chmodSync(path, 0o600)

  const off = await planApplyPlugin(path, 'kit@mk', false)
  assert.match(off.plan.diff, /^-\s+"kit@mk": true,$/m)
  assert.match(off.plan.diff, /^\+\s+"kit@mk": false,$/m)
  assert.equal(off.plan.changed, true)
  assert.deepEqual(
    off.plan.warningDetails.map((w) => w.code),
    ['reload-needed'],
  )
  assert.equal(read(path), SETTINGS.replace('"kit@mk": true', '"kit@mk": false'))
  assert.equal(statSync(path).mode & 0o777, 0o600, 'conserva los permisos')
  // El backup es el original, byte a byte.
  assert.equal(read(off.result.backup), SETTINGS)
  assert.ok(off.result.backup.endsWith('.json'))

  await planApplyPlugin(path, 'kit@mk', true)
  assert.equal(read(path), SETTINGS, 'revertir deja el archivo idéntico')
})

test('plugin.enable sobre una clave que no existe añade solo esa clave, con el formato del archivo', async () => {
  const { home } = sandbox()
  const path = join(home, 'settings.json')
  // Cuatro espacios y sin salto final: se respeta.
  const original = JSON.stringify({ model: 'opus', hooks: { Stop: [] } }, null, 4)
  writeFileSync(path, original)
  const { plan } = await planApplyPlugin(path, 'nuevo@mk', true)
  assert.equal(
    read(path),
    JSON.stringify(
      { model: 'opus', hooks: { Stop: [] }, enabledPlugins: { 'nuevo@mk': true } },
      null,
      4,
    ),
  )
  assert.ok(!read(path).endsWith('\n'))
  assert.match(plan.diff, /^\+\s+"enabledPlugins": \{$/m)
})

test('plugin.enable sin cambios no escribe ni hace backup', async () => {
  const { home } = sandbox()
  const path = join(home, 'settings.json')
  writeFileSync(path, SETTINGS)
  const { plan, result } = await planApplyPlugin(path, 'kit@mk', true)
  assert.deepEqual([plan.changed, plan.diff, plan.warnings], [false, '', []])
  assert.equal(result.backup, '')
  assert.equal(read(path), SETTINGS)
})

test('un settings que no existe se crea (con su carpeta) y el etag es absent', async () => {
  const { proj } = sandbox()
  const path = join(proj, '.claude/settings.local.json')
  const roots = [join(proj, '.claude')]
  const target = await readJsonTarget(path)
  assert.deepEqual([target.text, target.etag], [null, ABSENT_ETAG])
  const plan = planSetPluginEnabled(target.path, target.text, 'kit@mk', true)
  assert.equal(plan.before, '')
  assert.equal(plan.after, '{\n  "enabledPlugins": {\n    "kit@mk": true\n  }\n}\n')
  assert.ok(!existsSync(path), 'planear no escribe')

  const result = await applySetPluginEnabled('kit@mk', 'plugin:x', path, true, target.etag, {
    extraAllowedRoots: roots,
  })
  assert.equal(result.backup, '', 'nada que respaldar')
  assert.equal(read(path), plan.after)
  // Con un etag viejo (otro lo creó mientras tanto) es un conflicto.
  await assert.rejects(
    () =>
      applySetPluginEnabled('kit@mk', 'plugin:x', path, false, ABSENT_ETAG, {
        extraAllowedRoots: roots,
      }),
    ConflictError,
  )
})

test('un etag viejo es un conflicto y no se escribe nada', async () => {
  const { home } = sandbox()
  const path = join(home, 'settings.json')
  writeFileSync(path, SETTINGS)
  const target = await readJsonTarget(path)
  writeFileSync(path, SETTINGS.replace('"allow"', '"deny"'))
  await assert.rejects(
    () => applySetPluginEnabled('kit@mk', 'plugin:x', path, false, target.etag),
    ConflictError,
  )
  assert.ok(read(path).includes('"deny"') && read(path).includes('"kit@mk": true'))
})

test('escribe al realPath de un symlink sin reemplazarlo', async () => {
  const { root, home } = sandbox()
  const store = join(root, 'dotfiles/settings.json')
  mkdirSync(join(root, 'dotfiles'))
  writeFileSync(store, SETTINGS)
  symlinkSync(store, join(home, 'settings.json'))
  await planApplyPlugin(join(home, 'settings.json'), 'kit@mk', false, [store])
  assert.ok(
    lstatSync(join(home, 'settings.json')).isSymbolicLink(),
    'el enlace sigue siendo un enlace',
  )
  assert.equal(realpathSync(join(home, 'settings.json')), store)
  assert.ok(read(store).includes('"kit@mk": false'))
})

test('fuera de las raíces permitidas no se escribe (path-outside-roots)', async () => {
  const { proj } = sandbox()
  const path = join(proj, '.claude/settings.json')
  const target = await readJsonTarget(path)
  await assert.rejects(() => applySetPluginEnabled('kit@mk', 'plugin:x', path, true, target.etag), {
    code: 'path-outside-roots',
  })
  assert.ok(!existsSync(path))
})

test('JSON ilegible o con otra forma se rechaza con su motivo', () => {
  assert.throws(() => planSetPluginEnabled('/x', '{no', 'a@b', true), { code: 'unreadable-json' })
  assert.throws(() => planSetPluginEnabled('/x', '[1]', 'a@b', true), { code: 'unexpected-format' })
  assert.throws(() => planSetPluginEnabled('/x', '{"enabledPlugins": []}', 'a@b', true), {
    code: 'unexpected-format',
  })
  assert.throws(() => planSetMcpjsonDisabled('/x', '{"disabledMcpjsonServers": "a"}', 'a', true), {
    code: 'unexpected-format',
  })
})

test('mcp.disable de un servidor de .mcp.json: disabledMcpjsonServers; activarlo deja el archivo como estaba', async () => {
  const { proj } = sandbox()
  const path = join(proj, '.claude/settings.local.json')
  mkdirSync(join(proj, '.claude'))
  const original = `${JSON.stringify({ permissions: { allow: [] } }, null, 2)}\n`
  writeFileSync(path, original)
  const roots = [join(proj, '.claude')]
  const go = async (disabled: boolean) => {
    const t = await readJsonTarget(path)
    const plan = planSetMcpjsonDisabled(t.path, t.text, 'figma', disabled)
    await applySetMcpjsonDisabled(
      'figma',
      'mcp:claude-code/project/figma',
      path,
      disabled,
      t.etag,
      {
        extraAllowedRoots: roots,
      },
    )
    return plan
  }
  const off = await go(true)
  assert.match(off.diff, /^\+\s+"disabledMcpjsonServers": \[$/m)
  assert.equal(JSON.parse(read(path)).disabledMcpjsonServers[0], 'figma')
  assert.equal(off.warningDetails.length, 0)
  await go(true) // idempotente
  assert.equal(JSON.parse(read(path)).disabledMcpjsonServers.length, 1)
  await go(false)
  assert.equal(read(path), original)
})

const CLAUDE_JSON = `${JSON.stringify(
  {
    numStartups: 7,
    mcpServers: { a: { command: 'a' } },
    projects: { '/p': { allowedTools: [], disabledMcpServers: ['viejo'] }, '/q': {} },
  },
  null,
  2,
)}\n`

test('~/.claude.json ausente: plan y apply fallan con claude-json-missing (not-found) y no lo crean', async () => {
  const { home } = sandbox()
  const path = join(home, '.claude.json')
  const t = await readJsonTarget(path)
  assert.equal(t.text, null)
  const missing = (err: unknown) =>
    err instanceof OfficeError && err.code === 'claude-json-missing' && err.kind === 'not-found'
  for (const disabled of [true, false]) {
    assert.throws(() => planSetClaudeJsonMcpDisabled(t.path, t.text, '/p', 'a', disabled), missing)
    await assert.rejects(
      applySetClaudeJsonMcpDisabled('a', 'mcp:x', path, '/p', disabled, t.etag, {
        extraAllowedRoots: [path],
      }),
      missing,
    )
  }
  assert.equal(existsSync(path), false)
  assert.throws(
    () => planSetClaudeJsonMcpDisabled(t.path, t.text, '/p', 'a', true),
    /Claude Code has not created it/,
  )
})

test('mcp.disable en ~/.claude.json: toca solo disabledMcpServers del proyecto y vuelve byte a byte', async () => {
  const { home } = sandbox()
  const path = join(home, '.claude.json')
  writeFileSync(path, CLAUDE_JSON)
  const roots = [path]
  const go = async (name: string, disabled: boolean) => {
    const t = await readJsonTarget(path)
    const plan = planSetClaudeJsonMcpDisabled(t.path, t.text, '/p', name, disabled)
    await applySetClaudeJsonMcpDisabled(name, 'mcp:x', path, '/p', disabled, t.etag, {
      extraAllowedRoots: roots,
    })
    return plan
  }
  const off = await go('a', true)
  assert.match(off.diff, /^\+\s+"a"$/m)
  const doc = JSON.parse(read(path))
  assert.deepEqual(doc.projects['/p'].disabledMcpServers, ['viejo', 'a'])
  assert.deepEqual(doc.projects['/q'], {}, 'el resto del archivo no se toca')
  assert.equal(doc.numStartups, 7)
  await go('a', false)
  assert.equal(read(path), CLAUDE_JSON)
})

test('~/.claude.json con otro formato se rechaza con unexpected-format en vez de reformatearlo', async () => {
  const { home } = sandbox()
  const path = join(home, '.claude.json')
  const cases = [
    JSON.stringify(JSON.parse(CLAUDE_JSON)), // minificado
    JSON.stringify(JSON.parse(CLAUDE_JSON), null, 4), // cuatro espacios
    CLAUDE_JSON.replace('7', '7.0'), // un número que no sobrevive al viaje
    `${CLAUDE_JSON}\n`, // dos saltos finales
  ]
  for (const text of cases) {
    writeFileSync(path, text)
    const t = await readJsonTarget(path)
    assert.throws(
      () => planSetClaudeJsonMcpDisabled(t.path, t.text, '/p', 'a', true),
      { code: 'unexpected-format' },
      text.slice(0, 40),
    )
    await assert.rejects(
      () =>
        applySetClaudeJsonMcpDisabled('a', 'mcp:x', path, '/p', true, t.etag, {
          extraAllowedRoots: [path],
        }),
      { code: 'unexpected-format' },
    )
    assert.equal(read(path), text, 'el archivo no cambió')
  }
  // Sin salto final también es el formato de Claude Code: se acepta y se conserva.
  const noNewline = CLAUDE_JSON.trimEnd()
  writeFileSync(path, noNewline)
  const t = await readJsonTarget(path)
  await applySetClaudeJsonMcpDisabled('a', 'mcp:x', path, '/p', true, t.etag, {
    extraAllowedRoots: [path],
  })
  assert.ok(!read(path).endsWith('\n'))
  assert.deepEqual(JSON.parse(read(path)).projects['/p'].disabledMcpServers, ['viejo', 'a'])
})

test('~/.claude.json: un proyecto sin entrada se crea al desactivar y activar no inventa nada', async () => {
  const { home } = sandbox()
  const path = join(home, '.claude.json')
  writeFileSync(path, CLAUDE_JSON)
  const t = await readJsonTarget(path)
  const none = planSetClaudeJsonMcpDisabled(t.path, t.text, '/nuevo', 'a', false)
  assert.equal(none.changed, false)
  const created = planSetClaudeJsonMcpDisabled(t.path, t.text, '/nuevo', 'a', true)
  assert.deepEqual(JSON.parse(created.after).projects['/nuevo'], { disabledMcpServers: ['a'] })
  assert.throws(
    () =>
      planSetClaudeJsonMcpDisabled(
        '/x',
        `${JSON.stringify({ projects: { '/p': { disabledMcpServers: 'a' } } }, null, 2)}\n`,
        '/p',
        'a',
        true,
      ),
    { code: 'unexpected-format' },
  )
})

test('cada escritura deja su línea de auditoría con el id de la entidad', async () => {
  const { home } = sandbox()
  const path = join(home, 'settings.json')
  writeFileSync(path, SETTINGS)
  await planApplyPlugin(path, 'kit@mk', false)
  const [line] = read(join(home, 'ai-office/logs/audit.ndjson')).trim().split('\n')
  const entry = JSON.parse(line as string)
  assert.equal(entry.action, 'plugin.disable')
  assert.equal(entry.entityId, 'plugin:claude-code/plugin/kit@mk')
  assert.equal(entry.path, path)
  assert.notEqual(entry.shaBefore, entry.shaAfter)
})
