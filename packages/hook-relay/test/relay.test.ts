import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const BIN = fileURLToPath(new URL('../bin/ai-office-hook.mjs', import.meta.url))

// Los sockets Unix tienen un límite de ruta de ~104 bytes en macOS (sockaddr_un.sun_path). El
// directorio de scratchpad del proyecto es demasiado largo para eso, así que estas pruebas usan
// un HOME propio y corto bajo /tmp en vez de la carpeta temporal habitual.
const createdHomes: string[] = []
const tmpHome = () => {
  const dir = mkdtempSync('/tmp/aio-')
  createdHomes.push(dir)
  return dir
}
test.after(() => {
  for (const dir of createdHomes) rmSync(dir, { recursive: true, force: true })
})

/** Corre el relay como lo correría Claude Code: stdin con el payload, sin heredar nuestro tty. */
const runHook = (
  input: string,
  home: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN], {
      env: { ...process.env, HOME: home },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += String(d)
    })
    child.stderr.on('data', (d) => {
      stderr += String(d)
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input)
  })

const spoolLines = (home: string): unknown[] => {
  const dir = join(home, '.claude', 'ai-office', 'spool')
  if (!existsSync(dir)) return []
  const lines: unknown[] = []
  for (const file of readdirSync(dir)) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (line.trim()) lines.push(JSON.parse(line))
    }
  }
  return lines
}

test('socket caído: cae al spool y sale limpio', async () => {
  const home = tmpHome()
  const payload = { hook_event_name: 'SessionStart', session_id: 'abc123', cwd: '/x' }
  const r = await runHook(JSON.stringify(payload), home)
  assert.equal(r.code, 0)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, '')
  const lines = spoolLines(home) as Array<Record<string, unknown>>
  assert.equal(lines.length, 1)
  assert.equal(lines[0]?.hook_event_name, 'SessionStart')
  assert.equal(lines[0]?.session_id, 'abc123')
  assert.equal(typeof lines[0]?.ts, 'number')
})

test('socket vivo: entrega la línea y recorta los payloads grandes', async () => {
  const home = tmpHome()
  const sockPath = join(home, '.claude', 'ai-office', 'run', 'ingest.sock')
  mkdirSync(join(home, '.claude', 'ai-office', 'run'), { recursive: true })

  const received: string[] = []
  const server = createServer((socket) => {
    let buf = ''
    socket.on('data', (d) => {
      buf += String(d)
    })
    socket.on('end', () => received.push(buf))
  })
  await new Promise<void>((resolve) => server.listen(sockPath, resolve))

  const bigCommand = 'x'.repeat(5000)
  const bigOutput = 'y'.repeat(5000)
  const payload = {
    hook_event_name: 'PreToolUse',
    session_id: 's1',
    cwd: '/proj',
    tool_name: 'Bash',
    tool_use_id: 'tu-1',
    tool_input: { command: bigCommand, unrelatedBigField: 'z'.repeat(3000) },
    tool_output: bigOutput,
  }
  const r = await runHook(JSON.stringify(payload), home)
  server.close()

  assert.equal(r.code, 0)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, '')
  assert.equal(received.length, 1)
  const line = received[0]!.trim()
  assert.ok(!line.includes('\n'), 'una conexión = una línea NDJSON')
  const event = JSON.parse(line)
  assert.equal(event.tool_name, 'Bash')
  assert.equal(event.tool_use_id, 'tu-1')
  assert.equal(event.tool_input.command, bigCommand.slice(0, 200))
  assert.ok(event.tool_input.preview.length <= 1024)
  assert.equal(event.tool_input.bytes, Buffer.byteLength(JSON.stringify(payload.tool_input)))
  assert.equal(event.tool_input.unrelatedBigField, undefined)
  assert.ok(event.tool_output.preview.length <= 1024)
  assert.equal(event.tool_output.bytes, Buffer.byteLength(bigOutput))
  assert.equal(spoolLines(home).length, 0, 'con el socket vivo no debe tocar el spool')
})

test('conserva enteros skill, subagent_type y description', async () => {
  const home = tmpHome()
  const payload = {
    hook_event_name: 'PreToolUse',
    session_id: 's2',
    tool_name: 'Skill',
    tool_input: {
      skill: 'mi-skill',
      subagent_type: 'general-purpose',
      description: 'una tarea',
      file_path: '/'.repeat(300),
    },
  }
  const r = await runHook(JSON.stringify(payload), home)
  assert.equal(r.code, 0)
  const lines = spoolLines(home) as Array<{ tool_input: Record<string, unknown> }>
  const input = lines[0]!.tool_input
  assert.equal(input.skill, 'mi-skill')
  assert.equal(input.subagent_type, 'general-purpose')
  assert.equal(input.description, 'una tarea')
  assert.equal((input.file_path as string).length, 200)
})

test('JSON inválido: sale con 0 y sin salida, sin escribir al spool', async () => {
  const home = tmpHome()
  const r = await runHook('{ esto no es json', home)
  assert.equal(r.code, 0)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, '')
  assert.equal(spoolLines(home).length, 0)
})

test('stdin vacío: sale con 0 y sin salida', async () => {
  const home = tmpHome()
  const r = await runHook('', home)
  assert.equal(r.code, 0)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, '')
})

test('stdin gigante: se trunca a 256 KB y el proceso igual termina limpio', async () => {
  const home = tmpHome()
  const payload = JSON.stringify({
    hook_event_name: 'PreToolUse',
    session_id: 's3',
    tool_name: 'Bash',
    tool_input: { command: 'x'.repeat(400 * 1024) },
  })
  const r = await runHook(payload, home)
  assert.equal(r.code, 0)
  assert.equal(r.stdout, '')
  assert.equal(r.stderr, '')
})
