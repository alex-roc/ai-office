import { createHash, randomBytes } from 'node:crypto'
import {
  appendFile,
  chmod,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { makeId } from '@ai-office/core'
import { removeSection, upsertSection } from './body-sections.ts'
import { etagOf } from './etag.ts'
import { estimateTokens, parseMarkdownDoc, setFrontmatterFields } from './frontmatter.ts'
import { paths } from './paths.ts'

/**
 * Capa de escritura segura para agentes y skills de Claude Code.
 *
 * Toda mutación sigue el mismo patrón en dos tiempos:
 *   1. `plan*` — puro, no toca disco. Recibe el texto ya leído y devuelve el texto resultante
 *      más un diff legible, para que quien llama pueda mostrarlo y pedir confirmación.
 *   2. `apply*` — con efectos: relee el archivo, comprueba el etag (control de concurrencia
 *      optimista), hace una copia de seguridad, y escribe de forma atómica.
 *
 * "Nada se borra" es la regla de producto que gobierna todo esto: jubilar un agente o una skill
 * mueve el archivo, nunca lo elimina, y cada escritura deja detrás un backup y una línea de
 * auditoría con las que se puede reconstruir cualquier estado anterior a mano.
 */

// ---------------------------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------------------------

export interface MutationPlan {
  /** El realPath donde se escribirá cuando se aplique. */
  path: string
  before: string
  after: string
  /** Diff unificado legible (formato `diff -u`), vacío si `changed` es `false`. */
  diff: string
  changed: boolean
  warnings: string[]
}

export interface ApplyResult {
  path: string
  etag: string
  /** Ruta del backup escrito antes de mutar; cadena vacía si no hubo cambios que aplicar. */
  backup: string
}

/** El archivo cambió en disco entre el `plan` y el `apply`: hay que releer y volver a intentar. */
export class ConflictError extends Error {
  readonly path: string
  readonly currentEtag: string
  readonly currentText: string

  constructor(path: string, currentEtag: string, currentText: string) {
    super(`el archivo cambió en disco desde que se leyó su etag: ${path}`)
    this.name = 'ConflictError'
    this.path = path
    this.currentEtag = currentEtag
    this.currentText = currentText
  }
}

export interface MutationOptions {
  /**
   * Raíces adicionales a las por defecto (`~/.claude`, `~/.agents`) donde esta escritura en
   * concreto tiene permitido caer. Sirve para el caso de una skill cuyo symlink apunta al
   * repositorio de un proyecto: el llamante, que conoce ese repo, lo añade explícitamente.
   */
  extraAllowedRoots?: string[]
}

/** Lo mínimo de una skill que necesita `setAgentPreloadedSkills` para estimar su coste. */
export interface SkillRef {
  name: string
  body: string
}

export const AGENT_COLORS = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
] as const
export type AgentColor = (typeof AGENT_COLORS)[number]

/** Los alias que reconoce Claude Code; cualquier otro string es un id de modelo literal válido. */
export const KNOWN_AGENT_MODELS = ['inherit', 'haiku', 'sonnet', 'opus', 'fable'] as const
export type KnownAgentModel = (typeof KNOWN_AGENT_MODELS)[number]

// ---------------------------------------------------------------------------------------------
// Diff unificado, sin dependencias
// ---------------------------------------------------------------------------------------------

interface DiffOp {
  kind: 'ctx' | 'add' | 'del'
  text: string
}

/** LCS por líneas mediante programación dinámica: suficiente para archivos del tamaño de un .md. */
const lcsDiff = (a: string[], b: string[]): DiffOp[] => {
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const dpI = dp[i]!
    const dpI1 = dp[i + 1]!
    for (let j = m - 1; j >= 0; j--) {
      dpI[j] = a[i] === b[j] ? dpI1[j + 1]! + 1 : Math.max(dpI1[j]!, dpI[j + 1]!)
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'ctx', text: a[i]! })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ kind: 'del', text: a[i]! })
      i++
    } else {
      ops.push({ kind: 'add', text: b[j]! })
      j++
    }
  }
  while (i < n) {
    ops.push({ kind: 'del', text: a[i]! })
    i++
  }
  while (j < m) {
    ops.push({ kind: 'add', text: b[j]! })
    j++
  }
  return ops
}

const CONTEXT_LINES = 3

/** Diff unificado (estilo `diff -u`) entre dos textos, con 3 líneas de contexto por hunk. */
const buildUnifiedDiff = (path: string, before: string, after: string): string => {
  if (before === after) return ''
  const a = before.split('\n')
  const b = after.split('\n')
  const rawOps = lcsDiff(a, b)

  // Cada operación lleva su posición 1-indexada en "antes" y "después", para poder titular
  // los hunks (`@@ -aStart,aLen +bStart,bLen @@`) sin volver a recorrer las líneas.
  let aPos = 1
  let bPos = 1
  const ops = rawOps.map((op) => {
    const annotated = { ...op, aPos, bPos }
    if (op.kind !== 'add') aPos++
    if (op.kind !== 'del') bPos++
    return annotated
  })

  const changeIdxs: number[] = []
  ops.forEach((op, idx) => {
    if (op.kind !== 'ctx') changeIdxs.push(idx)
  })
  if (changeIdxs.length === 0) return ''

  // Cada cambio se rodea de CONTEXT_LINES líneas; los rangos que se solapan o son contiguos
  // se fusionan en un único hunk.
  const ranges = changeIdxs.map((idx): [number, number] => [
    Math.max(0, idx - CONTEXT_LINES),
    Math.min(ops.length - 1, idx + CONTEXT_LINES),
  ])
  const merged: Array<[number, number]> = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1])
    else merged.push(range)
  }

  const hunks = merged.map(([start, end]) => {
    const slice = ops.slice(start, end + 1)
    const first = slice[0]!
    const aLen = slice.filter((o) => o.kind !== 'add').length
    const bLen = slice.filter((o) => o.kind !== 'del').length
    const lines = slice.map((o) => {
      const prefix = o.kind === 'ctx' ? ' ' : o.kind === 'del' ? '-' : '+'
      return `${prefix}${o.text}`
    })
    return `@@ -${first.aPos},${aLen} +${first.bPos},${bLen} @@\n${lines.join('\n')}`
  })

  // `path` ya es absoluto: se recorta la barra inicial para no escribir `a//Users/...`.
  const rel = path.replace(/^\//, '')
  return `${[`--- a/${rel}`, `+++ b/${rel}`, ...hunks].join('\n')}\n`
}

// ---------------------------------------------------------------------------------------------
// Guard de rutas
// ---------------------------------------------------------------------------------------------

/**
 * `~/.agents` es el store canónico compartido entre agentes de IA (Claude Code, Codex, ...) al
 * que suelen apuntar los symlinks de `~/.claude/skills`. `paths()` (en `paths.ts`) solo modela
 * `~/.claude`, así que esta segunda raíz vive aquí. Tiene su propia variable de entorno para
 * poder aislar los tests exactamente igual que `CLAUDE_HOME` aísla a `paths()`.
 */
const agentsHome = (): string => process.env.AGENTS_HOME ?? join(homedir(), '.agents')

const defaultAllowedRoots = (): string[] => [paths().home, agentsHome()]

/**
 * Resuelve la ruta real de una escritura exista o no todavía el archivo: si existe, su realpath;
 * si no (por ejemplo, el destino de un archivo que se está archivando), el realpath de su
 * directorio contenedor más el nombre de archivo. Así toda escritura -exista ya o sea nueva-
 * pasa por el mismo resuelto de symlinks antes del guard de rutas.
 */
const resolveWriteTarget = async (target: string): Promise<string> => {
  try {
    return await realpath(target)
  } catch {
    const dir = await realpath(dirname(target))
    return join(dir, basename(target))
  }
}

/**
 * Lanza si `realTarget` cae fuera de las raíces permitidas. Como `realTarget` ya pasó por
 * `resolveWriteTarget` (que resuelve symlinks), esto también es la defensa contra `..` y contra
 * symlinks que apunten fuera: lo que se compara es siempre el destino final, no la ruta visible.
 */
const assertWithinRoots = async (realTarget: string, extraRoots: string[] = []): Promise<void> => {
  const roots = await Promise.all(
    [...defaultAllowedRoots(), ...extraRoots].map(async (root) => {
      try {
        return await realpath(root)
      } catch {
        return resolve(root)
      }
    }),
  )
  const ok = roots.some((root) => realTarget === root || realTarget.startsWith(root + sep))
  if (!ok) {
    throw new Error(
      `ruta fuera de las raíces permitidas: ${realTarget} (raíces: ${roots.join(', ')})`,
    )
  }
}

// ---------------------------------------------------------------------------------------------
// Primitivas de disco: lectura con etag, backup, log de auditoría, escritura atómica
// ---------------------------------------------------------------------------------------------

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

const readWithEtag = async (
  path: string,
): Promise<{ text: string; etag: string; mode: number }> => {
  const text = await readFile(path, 'utf8')
  const st = await stat(path)
  return { text, etag: etagOf(text, st.mtimeMs, st.size), mode: st.mode }
}

/**
 * `~/.claude/ai-office/backups/<kind>/<nombre>/<epoch>-<aleatorio>.md`
 *
 * El nombre viene de la interfaz o de un archivo del usuario, así que se sanea: un `../` o una
 * `/` lo sacarían de `backups/`. Y el sufijo aleatorio evita que dos escrituras en el mismo
 * milisegundo (un guardado doble) se pisen el respaldo.
 */
const backupPathFor = (kind: string, name: string): string => {
  const safe =
    name
      .replace(/[^\p{L}\p{N}._-]+/gu, '_')
      .replace(/\.{2,}/g, '_')
      .replace(/^\./, '_') || '_'
  return join(
    paths().ours,
    'backups',
    kind,
    safe,
    `${Date.now()}-${randomBytes(3).toString('hex')}.md`,
  )
}

const writeBackup = async (kind: string, name: string, text: string): Promise<string> => {
  const backupPath = backupPathFor(kind, name)
  await mkdir(dirname(backupPath), { recursive: true })
  await writeFile(backupPath, text, 'utf8')
  return backupPath
}

interface AuditEntry {
  ts: number
  action: string
  entityId: string
  path: string
  shaBefore: string
  shaAfter: string
  bytesDelta: number
}

const appendAudit = async (entry: AuditEntry): Promise<void> => {
  const logPath = join(paths().ours, 'logs', 'audit.ndjson')
  await mkdir(dirname(logPath), { recursive: true })
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

/** tmp en el MISMO directorio que el destino + rename: la escritura es atómica frente a lecturas. */
const writeAtomic = async (path: string, data: string, mode: number): Promise<void> => {
  const tmp = join(dirname(path), `.ai-office.tmp.${basename(path)}.${process.pid}-${Date.now()}`)
  await writeFile(tmp, data, 'utf8')
  await chmod(tmp, mode)
  await rename(tmp, path)
}

// ---------------------------------------------------------------------------------------------
// Motor genérico compartido por las mutaciones de texto (frontmatter y secciones del cuerpo)
// ---------------------------------------------------------------------------------------------

type ComputeFn = (before: string) => { after: string; changed: boolean; warnings: string[] }

const planTextChange = (path: string, before: string, compute: ComputeFn): MutationPlan => {
  const { after, changed, warnings } = compute(before)
  return {
    path,
    before,
    after,
    diff: changed ? buildUnifiedDiff(path, before, after) : '',
    changed,
    warnings,
  }
}

interface ApplyTextArgs {
  kind: 'agent' | 'skill' | 'command'
  name: string
  action: string
  visiblePath: string
  etag: string
  compute: ComputeFn
  extraAllowedRoots?: string[]
}

const applyTextMutation = async (args: ApplyTextArgs): Promise<ApplyResult> => {
  const realTarget = await resolveWriteTarget(args.visiblePath)
  await assertWithinRoots(realTarget, args.extraAllowedRoots)

  const current = await readWithEtag(realTarget)
  if (current.etag !== args.etag) throw new ConflictError(realTarget, current.etag, current.text)

  const { after, changed } = args.compute(current.text)
  if (!changed) return { path: realTarget, etag: current.etag, backup: '' }

  const backup = await writeBackup(args.kind, args.name, current.text)
  // Escribir siempre en `realTarget` (nunca sobre un symlink visible) es lo que hace que jubilar
  // una skill que vive en un store compartido no reemplace la proyección por un archivo suelto.
  await writeAtomic(realTarget, after, current.mode)

  const newStat = await stat(realTarget)
  const newEtag = etagOf(after, newStat.mtimeMs, newStat.size)
  await appendAudit({
    ts: Date.now(),
    action: args.action,
    entityId: makeId(args.kind, 'claude-code', 'user', args.name),
    path: realTarget,
    shaBefore: sha256(current.text),
    shaAfter: sha256(after),
    bytesDelta: Buffer.byteLength(after, 'utf8') - Buffer.byteLength(current.text, 'utf8'),
  })
  return { path: realTarget, etag: newEtag, backup }
}

// ---------------------------------------------------------------------------------------------
// 1. Color del agente
// ---------------------------------------------------------------------------------------------

const computeSetAgentColor = (color: AgentColor | null): ComputeFn => {
  if (color !== null && !AGENT_COLORS.includes(color)) {
    throw new Error(`color inválido: "${color}". Valores permitidos: ${AGENT_COLORS.join(', ')}`)
  }
  return (before) => {
    const r = setFrontmatterFields(before, { color: color ?? undefined })
    return { after: r.text, changed: r.changed, warnings: [] }
  }
}

export const planSetAgentColor = (
  path: string,
  before: string,
  color: AgentColor | null,
): MutationPlan => planTextChange(path, before, computeSetAgentColor(color))

export const applySetAgentColor = (
  agentName: string,
  visiblePath: string,
  color: AgentColor | null,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'agent',
    name: agentName,
    action: 'setAgentColor',
    visiblePath,
    etag,
    compute: computeSetAgentColor(color),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

// ---------------------------------------------------------------------------------------------
// 2. Modelo del agente
// ---------------------------------------------------------------------------------------------

const computeSetAgentModel =
  (model: string | null): ComputeFn =>
  (before) => {
    const warnings: string[] = []
    if (model !== null && !(KNOWN_AGENT_MODELS as readonly string[]).includes(model)) {
      warnings.push(
        `"${model}" no es uno de los alias conocidos (${KNOWN_AGENT_MODELS.join(', ')}); ` +
          'se guarda igual como id de modelo literal',
      )
    }
    const r = setFrontmatterFields(before, { model: model ?? undefined })
    return { after: r.text, changed: r.changed, warnings }
  }

export const planSetAgentModel = (
  path: string,
  before: string,
  model: string | null,
): MutationPlan => planTextChange(path, before, computeSetAgentModel(model))

export const applySetAgentModel = (
  agentName: string,
  visiblePath: string,
  model: string | null,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'agent',
    name: agentName,
    action: 'setAgentModel',
    visiblePath,
    etag,
    compute: computeSetAgentModel(model),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

// ---------------------------------------------------------------------------------------------
// 3. Herramientas del agente
// ---------------------------------------------------------------------------------------------

const computeSetAgentTools =
  (tools: string[] | null): ComputeFn =>
  (before) => {
    // Los agentes reales escriben `tools:` como una cadena separada por comas, no como una lista
    // YAML (ver `asStringList` en catalog.ts); se respeta esa convención para no ensuciar el diff.
    const value = tools === null ? undefined : tools.join(', ')
    const r = setFrontmatterFields(before, { tools: value })
    return { after: r.text, changed: r.changed, warnings: [] }
  }

export const planSetAgentTools = (
  path: string,
  before: string,
  tools: string[] | null,
): MutationPlan => planTextChange(path, before, computeSetAgentTools(tools))

export const applySetAgentTools = (
  agentName: string,
  visiblePath: string,
  tools: string[] | null,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'agent',
    name: agentName,
    action: 'setAgentTools',
    visiblePath,
    etag,
    compute: computeSetAgentTools(tools),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

// ---------------------------------------------------------------------------------------------
// 4. Skills precargadas (frontmatter `skills:`)
// ---------------------------------------------------------------------------------------------

const computeSetAgentPreloadedSkills =
  (skillNames: string[], skillsCatalog: SkillRef[]): ComputeFn =>
  (before) => {
    const warnings: string[] = []
    const byName = new Map(skillsCatalog.map((s) => [s.name, s]))
    let totalTokens = 0
    for (const name of skillNames) {
      const found = byName.get(name)
      if (!found) {
        warnings.push(`cita rota: "${name}" no existe en el catálogo de skills`)
        continue
      }
      totalTokens += estimateTokens(found.body)
    }
    if (skillNames.length > 0) {
      warnings.push(
        'precargar no añade capacidad: el subagente podría invocar estas skills igual bajo demanda ' +
          `si las necesitara. Solo adelanta el coste: ~${totalTokens} tokens estimados en cada arranque.`,
      )
    }
    const value = skillNames.length === 0 ? undefined : skillNames.join(', ')
    const r = setFrontmatterFields(before, { skills: value })
    return { after: r.text, changed: r.changed, warnings }
  }

export const planSetAgentPreloadedSkills = (
  path: string,
  before: string,
  skillNames: string[],
  skillsCatalog: SkillRef[],
): MutationPlan =>
  planTextChange(path, before, computeSetAgentPreloadedSkills(skillNames, skillsCatalog))

export const applySetAgentPreloadedSkills = (
  agentName: string,
  visiblePath: string,
  skillNames: string[],
  skillsCatalog: SkillRef[],
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'agent',
    name: agentName,
    action: 'setAgentPreloadedSkills',
    visiblePath,
    etag,
    compute: computeSetAgentPreloadedSkills(skillNames, skillsCatalog),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

// ---------------------------------------------------------------------------------------------
// 5. Menciones de skills en el cuerpo (la arista "declarada" del editor de grafo)
// ---------------------------------------------------------------------------------------------

const SKILL_MENTIONS_SECTION = 'skills'

const renderSkillMentions = (skillNames: string[]): string =>
  skillNames.map((name) => `- **${name}** — \`~/.claude/skills/${name}/SKILL.md\``).join('\n')

const computeSetAgentSkillMentions =
  (skillNames: string[]): ComputeFn =>
  (before) => {
    const parsed = parseMarkdownDoc(before)
    const newBody =
      skillNames.length === 0
        ? removeSection(parsed.body, SKILL_MENTIONS_SECTION)
        : upsertSection(parsed.body, SKILL_MENTIONS_SECTION, renderSkillMentions(skillNames))
    if (newBody === parsed.body) return { after: before, changed: false, warnings: [] }
    return { after: before.slice(0, parsed.bodyOffset) + newBody, changed: true, warnings: [] }
  }

export const planSetAgentSkillMentions = (
  path: string,
  before: string,
  skillNames: string[],
): MutationPlan => planTextChange(path, before, computeSetAgentSkillMentions(skillNames))

export const applySetAgentSkillMentions = (
  agentName: string,
  visiblePath: string,
  skillNames: string[],
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'agent',
    name: agentName,
    action: 'setAgentSkillMentions',
    visiblePath,
    etag,
    compute: computeSetAgentSkillMentions(skillNames),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

// ---------------------------------------------------------------------------------------------
// 6. Descripción de la skill
// ---------------------------------------------------------------------------------------------

const computeSetSkillDescription =
  (description: string): ComputeFn =>
  (before) => {
    const r = setFrontmatterFields(before, { description })
    return { after: r.text, changed: r.changed, warnings: [] }
  }

export const planSetSkillDescription = (
  path: string,
  before: string,
  description: string,
): MutationPlan => planTextChange(path, before, computeSetSkillDescription(description))

export const applySetSkillDescription = (
  skillName: string,
  visiblePath: string,
  description: string,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'skill',
    name: skillName,
    action: 'setSkillDescription',
    visiblePath,
    etag,
    compute: computeSetSkillDescription(description),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

// ---------------------------------------------------------------------------------------------
// 7. Jubilar / reactivar una skill
// ---------------------------------------------------------------------------------------------

const computeSetSkillRetired =
  (retired: boolean): ComputeFn =>
  (before) => {
    const r = setFrontmatterFields(before, {
      'disable-model-invocation': retired ? true : undefined,
    })
    return { after: r.text, changed: r.changed, warnings: [] }
  }

export const planRetireSkill = (path: string, before: string): MutationPlan =>
  planTextChange(path, before, computeSetSkillRetired(true))

export const planUnretireSkill = (path: string, before: string): MutationPlan =>
  planTextChange(path, before, computeSetSkillRetired(false))

/**
 * Escribe `disable-model-invocation: true` en el SKILL.md real. No se mueve el directorio ni el
 * symlink: el store de skills suele ser compartido con otros agentes (ver `agentsHome` arriba) y
 * un script de enlazado ajeno recrearía cualquier symlink que se tocara. `applyTextMutation` ya
 * resuelve el `realPath` antes de escribir, así que el symlink visible nunca se reemplaza.
 */
export const applyRetireSkill = (
  skillName: string,
  visiblePath: string,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'skill',
    name: skillName,
    action: 'retireSkill',
    visiblePath,
    etag,
    compute: computeSetSkillRetired(true),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

export const applyUnretireSkill = (
  skillName: string,
  visiblePath: string,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'skill',
    name: skillName,
    action: 'unretireSkill',
    visiblePath,
    etag,
    compute: computeSetSkillRetired(false),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

// ---------------------------------------------------------------------------------------------
// 8. Archivar / desarchivar un agente
// ---------------------------------------------------------------------------------------------

/** Nombre del directorio de retirados: reversible por construcción, nunca se borra nada. */
const ARCHIVE_DIRNAME = '.archivo'

export const planArchiveAgent = (sourcePath: string, before: string): MutationPlan => {
  const destPath = join(dirname(sourcePath), ARCHIVE_DIRNAME, basename(sourcePath))
  return {
    path: destPath,
    before,
    after: before,
    diff: `${sourcePath} -> ${destPath}\n(el contenido no cambia; solo se traslada el archivo a los retirados)\n`,
    changed: true,
    warnings: [],
  }
}

export const planUnarchiveAgent = (archivedPath: string, before: string): MutationPlan => {
  const destPath = join(dirname(dirname(archivedPath)), basename(archivedPath))
  return {
    path: destPath,
    before,
    after: before,
    diff: `${archivedPath} -> ${destPath}\n(el contenido no cambia; el archivo vuelve a estar activo)\n`,
    changed: true,
    warnings: [],
  }
}

/**
 * Mueve el `.md` a `.archivo/`. Se usa `rename` (nunca `unlink`): es una operación de sistema de
 * archivos atómica que "borra" el origen y "crea" el destino a la vez, así que jamás hay un
 * instante en el que el archivo no exista en ningún sitio, y deshacerla es, literalmente, la
 * operación inversa (`unarchiveAgent`).
 */
export const applyArchiveAgent = async (
  agentName: string,
  visibleSourcePath: string,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> => {
  const realSource = await resolveWriteTarget(visibleSourcePath)
  await assertWithinRoots(realSource, opts?.extraAllowedRoots)

  const current = await readWithEtag(realSource)
  if (current.etag !== etag) throw new ConflictError(realSource, current.etag, current.text)

  const archiveDir = join(dirname(realSource), ARCHIVE_DIRNAME)
  await mkdir(archiveDir, { recursive: true })
  const destPath = join(archiveDir, basename(realSource))
  const realDest = await resolveWriteTarget(destPath)
  await assertWithinRoots(realDest, opts?.extraAllowedRoots)

  const backup = await writeBackup('agent', agentName, current.text)
  await rename(realSource, realDest)

  await appendAudit({
    ts: Date.now(),
    action: 'archiveAgent',
    entityId: makeId('agent', 'claude-code', 'user', agentName),
    path: realDest,
    shaBefore: sha256(current.text),
    shaAfter: sha256(current.text),
    bytesDelta: 0,
  })
  const newStat = await stat(realDest)
  return { path: realDest, etag: etagOf(current.text, newStat.mtimeMs, newStat.size), backup }
}

export const applyUnarchiveAgent = async (
  agentName: string,
  visibleArchivedPath: string,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> => {
  const realSource = await resolveWriteTarget(visibleArchivedPath)
  await assertWithinRoots(realSource, opts?.extraAllowedRoots)

  const current = await readWithEtag(realSource)
  if (current.etag !== etag) throw new ConflictError(realSource, current.etag, current.text)

  const destPath = join(dirname(dirname(realSource)), basename(realSource))
  const realDest = await resolveWriteTarget(destPath)
  await assertWithinRoots(realDest, opts?.extraAllowedRoots)

  const backup = await writeBackup('agent', agentName, current.text)
  await rename(realSource, realDest)

  await appendAudit({
    ts: Date.now(),
    action: 'unarchiveAgent',
    entityId: makeId('agent', 'claude-code', 'user', agentName),
    path: realDest,
    shaBefore: sha256(current.text),
    shaAfter: sha256(current.text),
    bytesDelta: 0,
  })
  const newStat = await stat(realDest)
  return { path: realDest, etag: etagOf(current.text, newStat.mtimeMs, newStat.size), backup }
}

// ---------------------------------------------------------------------------------------------
// 9. Cuerpo completo de un slash command (lo que escribe el editor de flujos)
// ---------------------------------------------------------------------------------------------

/**
 * A diferencia del resto, aquí se reemplaza el archivo entero: un comando compilado desde el
 * lienzo ES su contenido. Pasa por el mismo motor, así que conserva backup, etag, escritura
 * atómica y auditoría.
 */
const computeWriteCommand =
  (markdown: string): ComputeFn =>
  (before) => ({
    after: markdown,
    changed: markdown !== before,
    warnings:
      before.trim() && !before.includes('ai-office:flujo:inicio')
        ? [
            'Este comando lo escribiste a mano. Al guardar desde el lienzo se reemplaza por la ' +
              'versión compilada: revisa el diff, porque lo que el lienzo no supo importar se pierde.',
          ]
        : [],
  })

export const planWriteCommand = (path: string, before: string, markdown: string): MutationPlan =>
  planTextChange(path, before, computeWriteCommand(markdown))

export const applyWriteCommand = (
  commandName: string,
  visiblePath: string,
  markdown: string,
  etag: string,
  opts?: MutationOptions,
): Promise<ApplyResult> =>
  applyTextMutation({
    kind: 'command',
    name: commandName,
    action: 'writeCommand',
    visiblePath,
    etag,
    compute: computeWriteCommand(markdown),
    extraAllowedRoots: opts?.extraAllowedRoots,
  })

/**
 * Crea un archivo que todavía no existe (un comando nuevo compilado desde el lienzo).
 *
 * Va aparte del motor de mutaciones porque ese exige leer el estado previo para comparar etags,
 * y aquí no hay estado previo que preservar. Lo que sí comparte: validación de la raíz de
 * destino, escritura atómica y la misma línea de auditoría, para que crear no sea un agujero
 * por el que se escriba sin dejar rastro.
 */
export const applyCreateFile = async (
  kind: 'agent' | 'skill' | 'command',
  name: string,
  path: string,
  content: string,
  opts?: MutationOptions,
): Promise<ApplyResult> => {
  // La carpeta contenedora sí tiene que existir y estar dentro de las raíces permitidas.
  const parent = await realpath(dirname(path))
  await assertWithinRoots(join(parent, basename(path)), opts?.extraAllowedRoots)

  const target = join(parent, basename(path))
  // `wx` falla con EEXIST si el archivo ya existe: comprobar con `stat` y escribir después dejaba
  // una ventana en la que otro proceso lo creaba y esta escritura lo pisaba sin aviso.
  try {
    await writeFile(target, content, { encoding: 'utf8', mode: 0o644, flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(
        `ya existe un archivo en ${target}: usa la operación de edición, no la de creación`,
      )
    }
    throw err
  }
  const st = await stat(target)
  await appendAudit({
    ts: Date.now(),
    action: `create:${kind}`,
    entityId: makeId(kind, 'claude-code', 'user', name),
    path: target,
    shaBefore: '',
    shaAfter: sha256(content),
    bytesDelta: Buffer.byteLength(content, 'utf8'),
  })
  return { path: target, etag: etagOf(content, st.mtimeMs, st.size), backup: '' }
}
