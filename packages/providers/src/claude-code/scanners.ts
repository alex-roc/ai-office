import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { type Agent, type Command, makeId, type Skill, type Source } from '@ai-office/core'
import { estimateTokens, parseMarkdownDoc } from './frontmatter.ts'
import { ARCHIVE_DIR, LEGACY_ARCHIVE_DIR, paths } from './paths.ts'

const asStringList = (v: unknown): string[] | null => {
  if (v == null) return null
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return null
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v.trim() : null)

/**
 * Describe la procedencia de un archivo resolviendo symlinks.
 * Importa mucho: ~/.claude/skills suele ser una proyección de otro store (p. ej. ~/.agents/skills,
 * compartido con otros agentes). Toda escritura debe ir al `realPath`, nunca al enlace.
 */
const sourceOf = async (path: string, readOnly = false): Promise<Source> => {
  const st = await stat(path)
  let real = path
  try {
    real = await realpath(path)
  } catch {
    /* enlace roto: se queda el path original y el llamante lo marca como orphan-link */
  }
  return {
    path,
    realPath: real,
    mtimeMs: st.mtimeMs,
    size: st.size,
    symlink: real !== path,
    projections: real !== path ? [path] : [],
    readOnly,
  }
}

/**
 * De dónde se escanea una carpeta de agentes, skills o comandos. Decide el `scope` y el id, y con
 * un plugin el nombre lleva el prefijo del plugin (`<plugin>:<nombre>`) y la entidad es de solo
 * lectura: sus archivos son copias que una actualización sobrescribe.
 */
export interface Origin {
  scope: 'user' | 'project' | 'plugin'
  /** `<nombre>@<marketplace>`, solo con `scope: 'plugin'`. */
  plugin?: string
}

const USER_ORIGIN: Origin = { scope: 'user' }

/** `release-kit@acme` -> `release-kit`. */
export const pluginName = (key: string): string => key.slice(0, key.lastIndexOf('@')) || key

const qualify = (origin: Origin, name: string): string =>
  origin.plugin ? `${pluginName(origin.plugin)}:${name}` : name

/** Campos comunes de toda entidad escaneada que dependen del origen. */
const originFields = (origin: Origin) => ({
  scope: origin.scope,
  provider: 'claude-code',
  ...(origin.plugin ? { plugin: origin.plugin } : {}),
})

const listDir = async (dir: string): Promise<string[]> => {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/** Lo que un escaneo no pudo leer: se acumula en vez de tumbar el resto del catálogo. */
const reportError = (errors: string[] | undefined, path: string, err: unknown): void => {
  errors?.push(`${path}: ${err instanceof Error ? err.message : String(err)}`)
}

/** `archiveDir` es la carpeta de retirados de la que viene (`.archive` o la antigua `.archivo`),
 * o `null` si el agente está activo. */
const readAgent = async (
  path: string,
  file: string,
  archiveDir: string | null,
  origin: Origin,
  /** Nombre que da el archivo (con subcarpetas en un plugin: `review:security`). */
  fileName = basename(file, '.md'),
): Promise<Agent> => {
  const archived = archiveDir !== null
  const text = await readFile(path, 'utf8')
  const doc = parseMarkdownDoc(text)
  const rawName = str(doc.data.name) ?? fileName
  const name = qualify(origin, rawName)
  const description = str(doc.data.description) ?? ''
  const problemDetails = [...doc.problems]
  if (!description) {
    problemDetails.push({
      code: 'agent-no-description',
      message: 'no description: the model will not know when to delegate to it',
    })
  }
  if (rawName !== fileName && rawName !== basename(file, '.md')) {
    problemDetails.push({
      code: 'name-mismatch',
      message: `name "${rawName}" does not match the file name`,
      params: { name: rawName },
    })
  }
  return {
    // Un archivado puede compartir nombre con uno activo: el id lleva el directorio de retirados
    // para que nunca se confundan.
    id: makeId('agent', 'claude-code', origin.scope, archived ? `${archiveDir}/${name}` : name),
    kind: 'agent',
    name,
    ...originFields(origin),
    description,
    source: await sourceOf(path, origin.scope === 'plugin'),
    status: problemDetails.some((p) => p.code.startsWith('yaml')) ? 'invalid' : 'active',
    problems: problemDetails.map((p) => p.message),
    problemDetails,
    bodyStartLine: doc.bodyStartLine,
    tools: asStringList(doc.data.tools),
    model: str(doc.data.model),
    color: str(doc.data.color),
    preloadedSkills: asStringList(doc.data.skills) ?? [],
    body: doc.body,
    bodyTokens: estimateTokens(doc.body),
    ...(archived ? { archived: true } : {}),
  }
}

export const scanAgents = async (
  dir = paths().agents,
  errors?: string[],
  origin: Origin = USER_ORIGIN,
): Promise<Agent[]> => {
  const out: Agent[] = []
  if (origin.scope === 'plugin') {
    // Un plugin no tiene archivo de retirados, y sus subcarpetas añaden segmentos al nombre.
    for (const { path, name } of await listMarkdownFiles(dir, errors)) {
      try {
        out.push(await readAgent(path, basename(path), null, origin, name))
      } catch (err) {
        reportError(errors, path, err)
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }
  for (const [folder, archiveDir] of [
    [dir, null],
    [join(dir, ARCHIVE_DIR), ARCHIVE_DIR],
    [join(dir, LEGACY_ARCHIVE_DIR), LEGACY_ARCHIVE_DIR],
  ] as const) {
    for (const file of await listDir(folder)) {
      if (!file.endsWith('.md')) continue
      const path = join(folder, file)
      try {
        out.push(await readAgent(path, file, archiveDir, origin))
      } catch (err) {
        // Un symlink roto o un .md ilegible no puede tumbar el escaneo entero.
        reportError(errors, path, err)
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Los `.md` bajo `commands/`, con subcarpetas: Claude Code nombra `commands/ns/x.md` como
 * `/ns:x`. Profundidad acotada y sin carpetas ocultas, por si hay un enlace circular.
 */
const listMarkdownFiles = async (
  root: string,
  errors: string[] | undefined,
  prefix: string[] = [],
): Promise<{ path: string; name: string }[]> => {
  const out: { path: string; name: string }[] = []
  for (const entry of await listDir(join(root, ...prefix))) {
    if (entry.startsWith('.')) continue
    const rel = [...prefix, entry]
    const path = join(root, ...rel)
    try {
      if ((await stat(path)).isDirectory()) {
        if (prefix.length < 3) out.push(...(await listMarkdownFiles(root, errors, rel)))
      } else if (entry.endsWith('.md')) {
        out.push({ path, name: rel.join(':').slice(0, -'.md'.length) })
      }
    } catch (err) {
      reportError(errors, path, err)
    }
  }
  return out
}

export const scanCommands = async (
  dir = paths().commands,
  errors?: string[],
  origin: Origin = USER_ORIGIN,
): Promise<Command[]> => {
  const out: Command[] = []
  for (const { path, name } of await listMarkdownFiles(dir, errors)) {
    try {
      const doc = parseMarkdownDoc(await readFile(path, 'utf8'))
      out.push({
        id: makeId('command', 'claude-code', origin.scope, qualify(origin, name)),
        kind: 'command',
        name: qualify(origin, name),
        ...originFields(origin),
        description: str(doc.data.description) ?? '',
        source: await sourceOf(path, origin.scope === 'plugin'),
        status: 'active',
        problems: doc.problems.map((p) => p.message),
        problemDetails: doc.problems,
        bodyStartLine: doc.bodyStartLine,
        argumentHint: str(doc.data['argument-hint']),
        body: doc.body,
      })
    } catch (err) {
      reportError(errors, path, err)
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export const scanSkills = async (
  dir = paths().skills,
  errors?: string[],
  origin: Origin = USER_ORIGIN,
): Promise<Skill[]> => {
  const out: Skill[] = []
  /** Un mismo skill puede verse desde varias rutas; se agrupa por destino real. */
  const byRealPath = new Map<string, Skill>()

  for (const entry of await listDir(dir)) {
    if (entry.startsWith('.')) continue
    const skillDir = join(dir, entry)
    const mdPath = join(skillDir, 'SKILL.md')
    try {
      let text: string
      try {
        text = await readFile(mdPath, 'utf8')
      } catch {
        // El directorio existe pero no hay SKILL.md legible: enlace roto o carpeta suelta.
        out.push({
          id: makeId('skill', 'claude-code', origin.scope, qualify(origin, entry)),
          kind: 'skill',
          name: qualify(origin, entry),
          ...originFields(origin),
          description: '',
          source: await sourceOf(skillDir, origin.scope === 'plugin'),
          status: 'orphan-link',
          problems: ['no readable SKILL.md'],
          problemDetails: [{ code: 'no-skill-md', message: 'no readable SKILL.md' }],
          bodyStartLine: 1,
          allowedTools: null,
          disabledForModel: false,
          metadata: null,
          dir: skillDir,
          body: '',
          descriptionTokens: 0,
          bodyTokens: 0,
        })
        continue
      }
      const doc = parseMarkdownDoc(text)
      const name = qualify(origin, str(doc.data.name) ?? entry)
      const description = str(doc.data.description) ?? ''
      const source = await sourceOf(mdPath, origin.scope === 'plugin')
      const problemDetails = [...doc.problems]
      if (!description) {
        problemDetails.push({
          code: 'skill-no-description',
          message: 'no description: the model will never pick it on its own',
        })
      }

      const existing = byRealPath.get(source.realPath)
      if (existing) {
        existing.source.projections.push(mdPath)
        continue
      }
      const skill: Skill = {
        id: makeId('skill', 'claude-code', origin.scope, name),
        kind: 'skill',
        name,
        ...originFields(origin),
        description,
        source,
        status: problemDetails.some((p) => p.code.startsWith('yaml')) ? 'invalid' : 'active',
        problems: problemDetails.map((p) => p.message),
        problemDetails,
        bodyStartLine: doc.bodyStartLine,
        allowedTools: asStringList(doc.data['allowed-tools']),
        disabledForModel: doc.data['disable-model-invocation'] === true,
        metadata:
          doc.data.metadata && typeof doc.data.metadata === 'object'
            ? (doc.data.metadata as Record<string, unknown>)
            : null,
        dir: skillDir,
        body: doc.body,
        descriptionTokens: estimateTokens(description),
        bodyTokens: estimateTokens(doc.body),
      }
      byRealPath.set(source.realPath, skill)
      out.push(skill)
    } catch (err) {
      // Ni el directorio se puede leer (enlace roto): se avisa y se sigue con el resto.
      reportError(errors, skillDir, err)
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
