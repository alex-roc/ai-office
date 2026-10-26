import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  type Agent,
  type Catalog,
  type Command,
  emptyCatalog,
  makeId,
  type Skill,
  type Source,
} from '@ai-office/core'
import { estimateTokens, parseMarkdownDoc } from './frontmatter.ts'
import { paths } from './paths.ts'

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
const sourceOf = async (path: string): Promise<Source> => {
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
    readOnly: false,
  }
}

const listDir = async (dir: string): Promise<string[]> => {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

export const scanAgents = async (dir = paths().agents): Promise<Agent[]> => {
  const out: Agent[] = []
  for (const file of await listDir(dir)) {
    if (!file.endsWith('.md')) continue
    const path = join(dir, file)
    const text = await readFile(path, 'utf8')
    const doc = parseMarkdownDoc(text)
    const name = str(doc.data.name) ?? basename(file, '.md')
    const description = str(doc.data.description) ?? ''
    const problems = [...doc.problems]
    if (!description) problems.push('sin description: el modelo no sabrá cuándo delegarle')
    if (name !== basename(file, '.md')) problems.push(`name "${name}" no coincide con el archivo`)
    out.push({
      id: makeId('agent', 'claude-code', 'user', name),
      kind: 'agent',
      name,
      scope: 'user',
      provider: 'claude-code',
      description,
      source: await sourceOf(path),
      status: problems.some((p) => p.startsWith('YAML')) ? 'invalid' : 'active',
      problems,
      bodyStartLine: doc.bodyStartLine,
      tools: asStringList(doc.data.tools),
      model: str(doc.data.model),
      color: str(doc.data.color),
      preloadedSkills: asStringList(doc.data.skills) ?? [],
      body: doc.body,
      bodyTokens: estimateTokens(doc.body),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export const scanCommands = async (dir = paths().commands): Promise<Command[]> => {
  const out: Command[] = []
  for (const file of await listDir(dir)) {
    if (!file.endsWith('.md')) continue
    const path = join(dir, file)
    const text = await readFile(path, 'utf8')
    const doc = parseMarkdownDoc(text)
    const name = basename(file, '.md')
    out.push({
      id: makeId('command', 'claude-code', 'user', name),
      kind: 'command',
      name,
      scope: 'user',
      provider: 'claude-code',
      description: str(doc.data.description) ?? '',
      source: await sourceOf(path),
      status: 'active',
      problems: doc.problems,
      bodyStartLine: doc.bodyStartLine,
      argumentHint: str(doc.data['argument-hint']),
      body: doc.body,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export const scanSkills = async (dir = paths().skills): Promise<Skill[]> => {
  const out: Skill[] = []
  /** Un mismo skill puede verse desde varias rutas; se agrupa por destino real. */
  const byRealPath = new Map<string, Skill>()

  for (const entry of await listDir(dir)) {
    if (entry.startsWith('.')) continue
    const skillDir = join(dir, entry)
    const mdPath = join(skillDir, 'SKILL.md')
    let text: string
    try {
      text = await readFile(mdPath, 'utf8')
    } catch {
      // El directorio existe pero no hay SKILL.md: enlace roto o carpeta suelta.
      try {
        const src = await sourceOf(skillDir)
        out.push({
          id: makeId('skill', 'claude-code', 'user', entry),
          kind: 'skill',
          name: entry,
          scope: 'user',
          provider: 'claude-code',
          description: '',
          source: src,
          status: 'orphan-link',
          problems: ['sin SKILL.md legible'],
          bodyStartLine: 1,
          allowedTools: null,
          disabledForModel: false,
          metadata: null,
          dir: skillDir,
          body: '',
          descriptionTokens: 0,
          bodyTokens: 0,
        })
      } catch {
        /* ni el directorio existe: se ignora */
      }
      continue
    }
    const doc = parseMarkdownDoc(text)
    const name = str(doc.data.name) ?? entry
    const description = str(doc.data.description) ?? ''
    const source = await sourceOf(mdPath)
    const problems = [...doc.problems]
    if (!description) problems.push('sin description: el modelo nunca la elegirá por su cuenta')

    const existing = byRealPath.get(source.realPath)
    if (existing) {
      existing.source.projections.push(mdPath)
      continue
    }
    const skill: Skill = {
      id: makeId('skill', 'claude-code', 'user', name),
      kind: 'skill',
      name,
      scope: 'user',
      provider: 'claude-code',
      description,
      source,
      status: problems.some((p) => p.startsWith('YAML')) ? 'invalid' : 'active',
      problems,
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
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export const scanCatalog = async (): Promise<Catalog> => {
  const p = paths()
  const [agents, commands, skills] = await Promise.all([
    scanAgents(p.agents),
    scanCommands(p.commands),
    scanSkills(p.skills),
  ])
  return {
    ...emptyCatalog(),
    agents,
    commands,
    skills,
    roots: [p.agents, p.commands, p.skills],
  }
}
