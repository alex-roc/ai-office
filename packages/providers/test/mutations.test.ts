import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { etagOf } from '../src/claude-code/etag.ts'
import {
  applyArchiveAgent,
  applyCreateFile,
  applyRetireSkill,
  applySetAgentColor,
  applySetAgentModel,
  applySetAgentPreloadedSkills,
  applySetAgentSkillMentions,
  applySetAgentTools,
  applySetSkillDescription,
  applyUnarchiveAgent,
  applyUnretireSkill,
  applyWriteCommand,
  ConflictError,
  planRetireSkill,
  planSetAgentColor,
  planSetAgentPreloadedSkills,
} from '../src/claude-code/mutations.ts'

/**
 * Todo el suite trabaja sobre directorios de scratch bajo el tmpdir del sistema, nunca sobre
 * `~/.claude` real. `CLAUDE_HOME`/`AGENTS_HOME` son las variables que `paths.ts` y `mutations.ts`
 * respectivamente miran para resolver las raíces permitidas del guard de rutas.
 */
const scratch = async (): Promise<{ claudeHome: string; agentsHome: string }> => {
  // realpath del tmpdir: en macOS /var es un symlink a /private/var, y las funciones de
  // mutations.ts siempre resuelven al destino real antes de escribir o comparar rutas.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ai-office-mutations-')))
  const claudeHome = join(root, '.claude')
  const agentsHome = join(root, '.agents')
  await mkdir(join(claudeHome, 'agents'), { recursive: true })
  await mkdir(join(claudeHome, 'skills'), { recursive: true })
  await mkdir(agentsHome, { recursive: true })
  process.env.CLAUDE_HOME = claudeHome
  process.env.AGENTS_HOME = agentsHome
  return { claudeHome, agentsHome }
}

const etagOfFile = async (path: string): Promise<string> => {
  const text = await readFile(path, 'utf8')
  const st = await stat(path)
  return etagOf(text, st.mtimeMs, st.size)
}

const AGENT_DOC = `---
name: code-reviewer
description: "Asesor contable"
model: opus
---

# Cuerpo

Prosa escrita por el usuario, intocable.
`

const SKILL_DOC = `---
name: release-tools
description: "Herramientas de publicación"
---

# release-tools

Cuerpo de la skill.
`

test('setAgentColor: aplicar y revertir deja el archivo idéntico', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')

  const etag1 = await etagOfFile(path)
  const r1 = await applySetAgentColor('code-reviewer', path, 'blue', etag1)
  const conColor = await readFile(path, 'utf8')
  assert.match(conColor, /color: blue/)
  assert.ok(r1.backup, 'debe dejar un backup')
  assert.equal(await readFile(r1.backup, 'utf8'), AGENT_DOC, 'el backup guarda el texto previo')

  const r2 = await applySetAgentColor('code-reviewer', path, null, r1.etag)
  const vuelta = await readFile(path, 'utf8')
  assert.equal(vuelta, AGENT_DOC, 'quitar el color debe devolver el archivo original byte a byte')
  assert.ok(r2.backup)
})

test('setAgentColor: color inválido lanza al planear', () => {
  assert.throws(
    () => planSetAgentColor('/x/agent.md', AGENT_DOC, 'magenta' as never),
    /invalid color/,
  )
})

test('el diff generado marca las líneas añadidas y borradas', () => {
  const plan = planSetAgentColor('/agents/code-reviewer.md', AGENT_DOC, 'blue')
  assert.equal(plan.changed, true)
  // La cabecera no duplica la barra: `a/agents/...`, como cualquier `diff -u`.
  assert.match(plan.diff, /^--- a\/agents\/code-reviewer\.md/m)
  assert.match(plan.diff, /^\+\+\+ b\/agents\/code-reviewer\.md/m)
  const hunkLines = plan.diff.split('\n').slice(2) // las dos primeras son la cabecera --- a/ / +++ b/
  assert.ok(
    hunkLines.some((l) => l === '+color: blue'),
    'marca la línea añadida',
  )
  assert.ok(!hunkLines.some((l) => l.startsWith('-')), 'una adición pura no borra líneas')

  const conColor = AGENT_DOC.replace('model: opus', 'model: opus\ncolor: blue')
  const cambio = planSetAgentColor('/agents/code-reviewer.md', conColor, 'red')
  assert.ok(
    cambio.diff.split('\n').some((l) => l === '-color: blue'),
    'marca la línea borrada',
  )
  assert.ok(
    cambio.diff.split('\n').some((l) => l === '+color: red'),
    'marca la línea añadida',
  )
})

test('setAgentModel: avisa (no falla) con un modelo desconocido, y hace el viaje de ida y vuelta', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')

  const etag1 = await etagOfFile(path)
  const r1 = await applySetAgentModel('code-reviewer', path, 'claude-x-preview', etag1)
  assert.match(await readFile(path, 'utf8'), /model: claude-x-preview/)

  const r2 = await applySetAgentModel('code-reviewer', path, 'opus', r1.etag)
  assert.equal(await readFile(path, 'utf8'), AGENT_DOC)
  assert.ok(r2.backup)
})

test('setAgentTools: guarda la lista como cadena separada por comas, y revierte exacto', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')

  const etag1 = await etagOfFile(path)
  const r1 = await applySetAgentTools('code-reviewer', path, ['Read', 'Grep'], etag1)
  assert.match(await readFile(path, 'utf8'), /tools: Read, Grep/)

  const r2 = await applySetAgentTools('code-reviewer', path, null, r1.etag)
  assert.equal(await readFile(path, 'utf8'), AGENT_DOC)
  void r2
})

test('setAgentPreloadedSkills: warning obligatorio con el costo estimado, y cita rota si falta la skill', () => {
  const skillsCatalog = [{ name: 'release-tools', body: 'x'.repeat(400) }]
  const plan = planSetAgentPreloadedSkills(
    '/agents/x.md',
    AGENT_DOC,
    ['release-tools', 'no-existe'],
    skillsCatalog,
  )
  assert.ok(
    plan.warnings.some((w) => w.includes('preloading adds no capability')),
    'debe explicar que precargar no da capacidad nueva',
  )
  assert.ok(
    plan.warnings.some((w) => w.includes('100')),
    'debe estimar los tokens (400 chars ~ 100 tokens)',
  )
  assert.ok(plan.warnings.some((w) => w.includes('broken citation') && w.includes('no-existe')))
})

test('setAgentPreloadedSkills: aplicar y revertir deja el archivo idéntico', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')
  const skillsCatalog = [{ name: 'release-tools', body: 'cuerpo' }]

  const etag1 = await etagOfFile(path)
  const r1 = await applySetAgentPreloadedSkills(
    'code-reviewer',
    path,
    ['release-tools'],
    skillsCatalog,
    etag1,
  )
  assert.match(await readFile(path, 'utf8'), /skills: release-tools/)

  await applySetAgentPreloadedSkills('code-reviewer', path, [], skillsCatalog, r1.etag)
  assert.equal(await readFile(path, 'utf8'), AGENT_DOC)
})

test('setAgentSkillMentions: escribe la sección del cuerpo y revertir deja el archivo idéntico', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')

  const etag1 = await etagOfFile(path)
  const r1 = await applySetAgentSkillMentions('code-reviewer', path, ['release-tools'], etag1)
  const conMencion = await readFile(path, 'utf8')
  assert.match(conMencion, /<!-- ai-office:skills:inicio -->/)
  assert.match(conMencion, /~\/\.claude\/skills\/release-tools\/SKILL\.md/)
  assert.match(
    conMencion,
    /Prosa escrita por el usuario, intocable\./,
    'no debe tocar la prosa existente',
  )

  await applySetAgentSkillMentions('code-reviewer', path, [], r1.etag)
  assert.equal(await readFile(path, 'utf8'), AGENT_DOC)
})

test('setSkillDescription: aplicar y revertir deja el archivo idéntico', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'skills', 'release-tools', 'SKILL.md')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, SKILL_DOC, 'utf8')

  const etag1 = await etagOfFile(path)
  const r1 = await applySetSkillDescription('release-tools', path, 'Nueva descripción', etag1)
  assert.match(await readFile(path, 'utf8'), /description: "Nueva descripción"/)

  await applySetSkillDescription('release-tools', path, 'Herramientas de publicación', r1.etag)
  assert.equal(await readFile(path, 'utf8'), SKILL_DOC)
})

test('retireSkill/unretireSkill: aplicar y revertir deja el archivo idéntico', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'skills', 'release-tools', 'SKILL.md')
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, SKILL_DOC, 'utf8')

  const etag1 = await etagOfFile(path)
  const r1 = await applyRetireSkill('release-tools', path, etag1)
  assert.match(await readFile(path, 'utf8'), /disable-model-invocation: true/)

  await applyUnretireSkill('release-tools', path, r1.etag)
  assert.equal(await readFile(path, 'utf8'), SKILL_DOC)
})

test('retireSkill sobre un symlink escribe en el destino real y el symlink sigue siendo symlink', async () => {
  const { claudeHome, agentsHome } = await scratch()
  const realDir = join(agentsHome, 'skills', 'release-tools')
  await mkdir(realDir, { recursive: true })
  const realPath = join(realDir, 'SKILL.md')
  await writeFile(realPath, SKILL_DOC, 'utf8')

  // ~/.claude/skills/release-tools es una proyección (symlink de directorio) del store compartido.
  const linkDir = join(claudeHome, 'skills', 'release-tools')
  await symlink(realDir, linkDir, 'dir')
  const visiblePath = join(linkDir, 'SKILL.md')

  const etag1 = await etagOfFile(visiblePath)
  const result = await applyRetireSkill('release-tools', visiblePath, etag1)

  assert.equal(result.path, realPath, 'debe escribir en el realPath, no en la ruta visible')
  assert.match(await readFile(realPath, 'utf8'), /disable-model-invocation: true/)

  const { lstat } = await import('node:fs/promises')
  assert.ok((await lstat(linkDir)).isSymbolicLink(), 'el symlink debe seguir siendo un symlink')
})

test('archiveAgent/unarchiveAgent: mover y devolver deja el archivo idéntico y en su sitio', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')

  const etag1 = await etagOfFile(path)
  const archived = await applyArchiveAgent('code-reviewer', path, etag1)
  assert.equal(archived.path, join(claudeHome, 'agents', '.archive', 'code-reviewer.md'))
  assert.equal(await readFile(archived.path, 'utf8'), AGENT_DOC)
  await assert.rejects(readFile(path, 'utf8'), 'ya no debe existir en la ruta original')

  const restored = await applyUnarchiveAgent('code-reviewer', archived.path, archived.etag)
  assert.equal(restored.path, path)
  assert.equal(await readFile(path, 'utf8'), AGENT_DOC, 'vuelve idéntico byte a byte')
})

test('un agente de la carpeta antigua .archivo se restaura a su sitio', async () => {
  const { claudeHome } = await scratch()
  await mkdir(join(claudeHome, 'agents', '.archivo'), { recursive: true })
  const legacy = join(claudeHome, 'agents', '.archivo', 'code-reviewer.md')
  await writeFile(legacy, AGENT_DOC, 'utf8')
  const restored = await applyUnarchiveAgent('code-reviewer', legacy, await etagOfFile(legacy))
  assert.equal(restored.path, join(claudeHome, 'agents', 'code-reviewer.md'))
})

test('el plan de una mutación trae los avisos con código', () => {
  const plan = planSetAgentPreloadedSkills('/x/a.md', AGENT_DOC, ['no-existe'], [])
  assert.deepEqual(
    plan.warningDetails.map((w) => w.code),
    ['broken-citation', 'preload-cost'],
  )
  assert.deepEqual(
    plan.warnings,
    plan.warningDetails.map((w) => w.message),
  )
})

test('archivar o restaurar nunca pisa un archivo que ya está en el destino', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')
  const archived = await applyArchiveAgent('code-reviewer', path, await etagOfFile(path))

  // Alguien crea otro code-reviewer.md con el archivado aún apartado: restaurar no lo pisa.
  await writeFile(path, 'el nuevo', 'utf8')
  await assert.rejects(
    applyUnarchiveAgent('code-reviewer', archived.path, archived.etag),
    /already exists/,
  )
  assert.equal(await readFile(path, 'utf8'), 'el nuevo')

  // Y archivar el nuevo tampoco pisa el archivado anterior.
  await assert.rejects(
    applyArchiveAgent('code-reviewer', path, await etagOfFile(path)),
    /already exists/,
  )
  assert.equal(await readFile(archived.path, 'utf8'), AGENT_DOC)
})

test('archivar un agente que es symlink se rechaza: dejaría un enlace roto', async () => {
  const { claudeHome, agentsHome } = await scratch()
  const real = join(agentsHome, 'agents', 'code-reviewer.md')
  await mkdir(dirname(real), { recursive: true })
  await writeFile(real, AGENT_DOC, 'utf8')
  const link = join(claudeHome, 'agents', 'code-reviewer.md')
  await symlink(real, link)
  await assert.rejects(
    applyArchiveAgent('code-reviewer', link, await etagOfFile(real)),
    /symbolic link/,
  )
  assert.equal(await readFile(real, 'utf8'), AGENT_DOC)
})

test('conflicto: modificar el archivo entre plan y apply lanza ConflictError', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')

  const etagViejo = await etagOfFile(path)
  // Alguien más edita el archivo mientras tanto (a mano, o desde otra sesión).
  await writeFile(path, AGENT_DOC.replace('opus', 'sonnet'), 'utf8')

  await assert.rejects(applySetAgentColor('code-reviewer', path, 'blue', etagViejo), (err) => {
    assert.ok(err instanceof ConflictError)
    assert.equal(err.path, path)
    assert.match(err.currentText, /model: sonnet/)
    return true
  })
})

test('guard de rutas: rechaza un destino fuera de las raíces permitidas', async () => {
  await scratch() // fija CLAUDE_HOME/AGENTS_HOME, pero el destino de esta prueba queda fuera de ambos
  const fuera = await mkdtemp(join(tmpdir(), 'ai-office-fuera-'))
  const path = join(fuera, 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')
  const etag1 = await etagOfFile(path)

  await assert.rejects(applySetAgentColor('code-reviewer', path, 'blue', etag1), /allowed roots/)
})

test('planRetireSkill es puro: no toca disco ni cambia si ya está retirada', () => {
  const yaRetirada = `---
name: x
description: "d"
disable-model-invocation: true
---
cuerpo
`
  const plan = planRetireSkill('/skills/x/SKILL.md', yaRetirada)
  assert.equal(plan.changed, false)
  assert.equal(plan.diff, '')
})

test('applyCreateFile no sobrescribe un archivo que ya existe', async () => {
  const { claudeHome } = await scratch()
  await mkdir(join(claudeHome, 'commands'), { recursive: true })
  const path = join(claudeHome, 'commands', 'nuevo.md')

  const creado = await applyCreateFile('command', 'nuevo', path, 'primero\n')
  assert.equal(await readFile(creado.path, 'utf8'), 'primero\n')

  await assert.rejects(
    () => applyCreateFile('command', 'nuevo', path, 'segundo\n'),
    /already exists/,
  )
  assert.equal(await readFile(path, 'utf8'), 'primero\n', 'el contenido original sigue intacto')
})

test('applyCreateFile no pisa lo que aparece justo antes de escribir (carrera)', async () => {
  const { claudeHome } = await scratch()
  await mkdir(join(claudeHome, 'commands'), { recursive: true })
  const path = join(claudeHome, 'commands', 'carrera.md')
  // Dos creaciones simultáneas: exactamente una gana, la otra falla, y nada se mezcla.
  const results = await Promise.allSettled([
    applyCreateFile('command', 'carrera', path, 'A'.repeat(5000)),
    applyCreateFile('command', 'carrera', path, 'B'.repeat(5000)),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  const text = await readFile(path, 'utf8')
  assert.ok(/^(A+|B+)$/.test(text), 'el archivo es entero de uno de los dos')
})

test('el backup no puede salir de backups/ aunque el nombre traiga ../ o /', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')

  const r = await applySetAgentColor('../../../escapado', path, 'blue', await etagOfFile(path))
  const raiz = join(claudeHome, 'ai-office', 'backups')
  assert.ok(r.backup.startsWith(`${raiz}/`), r.backup)
  assert.ok(!r.backup.slice(raiz.length).includes('..'), r.backup)
})

test('dos escrituras en el mismo milisegundo no se pisan el backup', async () => {
  const { claudeHome } = await scratch()
  const path = join(claudeHome, 'agents', 'code-reviewer.md')
  await writeFile(path, AGENT_DOC, 'utf8')
  const real = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    const a = await applySetAgentColor('code-reviewer', path, 'blue', await etagOfFile(path))
    const b = await applySetAgentColor('code-reviewer', path, 'red', a.etag)
    assert.notEqual(a.backup, b.backup)
  } finally {
    Date.now = real
  }
})

test('applyWriteCommand sobre un comando en subcarpeta escribe en su propio archivo', async () => {
  const { claudeHome } = await scratch()
  await mkdir(join(claudeHome, 'commands', 'ns'), { recursive: true })
  const path = join(claudeHome, 'commands', 'ns', 'x.md')
  await writeFile(path, 'viejo\n', 'utf8')
  await applyWriteCommand('ns:x', path, 'nuevo\n', await etagOfFile(path))
  assert.equal(await readFile(path, 'utf8'), 'nuevo\n')
})
