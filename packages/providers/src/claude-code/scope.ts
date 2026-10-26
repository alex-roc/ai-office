import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { OurConfig, ScopeSelection } from '@ai-office/core'
import { OfficeError } from './errors.ts'
import { readOurConfig } from './our-config.ts'
import { paths } from './paths.ts'

/**
 * Ámbito: ¿se mira solo lo del usuario o también lo de un proyecto? Se resuelve en este orden:
 * flag (`--project`, `--scope`) > `config.json` > autodetección (solo la CLI) > usuario.
 */

export type ScopeSource = 'flag' | 'config' | 'auto' | 'default'

export interface ResolvedScope {
  scope: ScopeSelection
  source: ScopeSource
  /** Con `auto`: se encontró en el directorio actual o en la raíz git por encima. */
  via?: 'cwd' | 'git-root'
}

export interface ScopeRequest {
  scope?: 'user' | 'project'
  /** Ruta del proyecto (relativa al `cwd` si no es absoluta). Implica ámbito de proyecto. */
  project?: string
  /** Configuración ya leída; si no se pasa se lee `config.json`. */
  config?: OurConfig
  cwd?: string
  /** Autodetectar desde el `cwd`. Solo la CLI: el daemon no mira desde dónde se lanzó. */
  auto?: boolean
}

const isDir = (path: string): Promise<boolean> =>
  stat(path).then(
    (st) => st.isDirectory(),
    () => false,
  )

const isFile = (path: string): Promise<boolean> =>
  stat(path).then(
    (st) => st.isFile(),
    () => false,
  )

/** Un directorio de proyecto que existe, en su forma real (así se comparan y se autorizan las rutas). */
export const checkProject = async (path: string, cwd = process.cwd()): Promise<string> => {
  const abs = resolve(cwd, path)
  if (!(await isDir(abs))) {
    throw new OfficeError('project-not-found', `the project directory does not exist: ${abs}`, {
      kind: 'not-found',
      params: { path: abs },
    })
  }
  return realpath(abs)
}

/** Raíz git por encima de `dir` (la carpeta con `.git`, que en un worktree es un archivo). */
const gitRoot = async (dir: string): Promise<string | null> => {
  for (let cur = dir; ; cur = dirname(cur)) {
    if (
      await stat(join(cur, '.git')).then(
        () => true,
        () => false,
      )
    )
      return cur
    if (dirname(cur) === cur) return null
  }
}

/**
 * ¿Es esta carpeta un proyecto de Claude Code? Si tiene `.claude/` con agents, skills o commands,
 * o un `.mcp.json`. Excluye `~` y el propio directorio de Claude Code: su `.claude/` es el del usuario.
 */
const looksLikeProject = async (dir: string): Promise<boolean> => {
  const claude = join(dir, '.claude')
  const [home, userHome, claudeReal] = await Promise.all([
    realpath(homedir()).catch(() => homedir()),
    realpath(paths().home).catch(() => paths().home),
    realpath(claude).catch(() => claude),
  ])
  if (dir === home || claudeReal === userHome) return false
  for (const sub of ['agents', 'skills', 'commands']) {
    if (await isDir(join(claude, sub))) return true
  }
  return isFile(join(dir, '.mcp.json'))
}

export const detectProject = async (
  cwd: string,
): Promise<{ path: string; via: 'cwd' | 'git-root' } | null> => {
  const here = await realpath(cwd).catch(() => resolve(cwd))
  if (await looksLikeProject(here)) return { path: here, via: 'cwd' }
  const root = await gitRoot(here)
  if (root && root !== here && (await looksLikeProject(root)))
    return { path: root, via: 'git-root' }
  return null
}

/** El proyecto que dice `config.json`, si todavía existe. Un proyecto que ya no está no es un error. */
const configuredProject = async (config: OurConfig): Promise<string | null> => {
  if (config.scope === 'user' || !config.project) return null
  return (await isDir(config.project)) ? realpath(config.project) : null
}

export const resolveScope = async (req: ScopeRequest = {}): Promise<ResolvedScope> => {
  const cwd = req.cwd ?? process.cwd()
  const config = req.config ?? (await readOurConfig()).config

  if (req.scope === 'user' && req.project !== undefined) {
    throw new OfficeError(
      'conflicting-scope',
      '--scope user contradicts --project: a project implies the project scope',
    )
  }
  if (req.project !== undefined) {
    return {
      scope: { kind: 'project', path: await checkProject(req.project, cwd) },
      source: 'flag',
    }
  }
  if (req.scope === 'user') return { scope: { kind: 'user' }, source: 'flag' }
  if (req.scope === 'project') {
    // `--scope project` sin ruta: el de la configuración o, si no hay, el del directorio actual.
    const path = (await configuredProject(config)) ?? (await detectProject(cwd))?.path
    if (!path) {
      throw new OfficeError(
        'needs-project',
        '--scope project needs a project: pass --project <path> or run it inside one',
      )
    }
    return { scope: { kind: 'project', path }, source: 'flag' }
  }

  if (config.scope === 'user') return { scope: { kind: 'user' }, source: 'config' }
  const project = await configuredProject(config)
  if (project) return { scope: { kind: 'project', path: project }, source: 'config' }

  if (req.auto) {
    const found = await detectProject(cwd)
    if (found)
      return { scope: { kind: 'project', path: found.path }, source: 'auto', via: found.via }
  }
  return { scope: { kind: 'user' }, source: 'default' }
}

/** Raíces donde las escrituras de ESTE ámbito tienen permitido caer, además de `~/.claude`. */
export const scopeRoots = (scope: ScopeSelection): string[] =>
  scope.kind === 'project' ? [join(scope.path, '.claude'), join(scope.path, '.mcp.json')] : []

/**
 * Lo que una petición de `config.json` exige además de ser válida de forma: que un ámbito de
 * proyecto traiga un proyecto, y que ese proyecto exista.
 */
export const assertUsableConfig = async (config: OurConfig): Promise<void> => {
  if (config.scope === 'project' && !config.project) {
    throw new OfficeError('needs-project', 'scope "project" needs a project path')
  }
  if (config.project) await checkProject(config.project)
}
