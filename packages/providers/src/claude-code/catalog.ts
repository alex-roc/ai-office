import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Agent,
  type Catalog,
  type Command,
  emptyCatalog,
  type ScopeSelection,
  type Skill,
} from '@ai-office/core'
import { scanMcpServers } from './mcp.ts'
import { paths } from './paths.ts'
import { scanPlugins } from './plugins.ts'
import { scanAgents, scanCommands, scanSkills } from './scanners.ts'
import { readSettingsFiles } from './settings.ts'

export * from './scanners.ts'

export const USER_SCOPE: ScopeSelection = { kind: 'user' }

export interface CatalogScan {
  catalog: Catalog
  /** Archivos que no se pudieron leer, con el motivo. Viajan en el snapshot. */
  errors: string[]
}

/**
 * Precedencia entre lo del usuario y lo del proyecto (ver docs/CLAUDE-CODE-CONFIG.md): el perdedor
 * se queda en el catálogo con `status: 'shadowed'` y `shadowedBy` apuntando al ganador.
 *
 * - Agentes: proyecto > usuario (documentado).
 * - Skills: personal (usuario) > proyecto (documentado).
 * - Comandos: no hay tabla documentada; se asume lo mismo que las skills, que usan el mismo
 *   mecanismo. NO DOCUMENTADO: si Claude Code resuelve distinto, esto es lo único que cambia.
 *
 * Los de plugin no compiten (van con prefijo), y un archivado o uno que no carga (enlace roto,
 * YAML inválido) ni tapa ni es tapado.
 */
export const applyPrecedence = (catalog: Catalog): Catalog => {
  const shadow = <T extends Agent | Skill | Command>(
    list: T[],
    loser: 'user' | 'project',
    winner: 'user' | 'project',
  ): T[] => {
    const winners = new Map(
      list
        .filter(
          (e) => e.scope === winner && e.status === 'active' && !('archived' in e && e.archived),
        )
        .map((e) => [e.name, e]),
    )
    return list.map((e) => {
      const w = winners.get(e.name)
      return e.scope === loser && e.status === 'active' && !('archived' in e && e.archived) && w
        ? { ...e, status: 'shadowed' as const, shadowedBy: w.id }
        : e
    })
  }
  return {
    ...catalog,
    agents: shadow(catalog.agents, 'user', 'project'),
    skills: shadow(catalog.skills, 'project', 'user'),
    commands: shadow(catalog.commands, 'project', 'user'),
  }
}

/** Nos quedamos con la primera entidad de cada id: dos plugins que dan el mismo nombre no se pisan. */
const uniqueById = <T extends { id: string; source: { path: string } }>(
  list: T[],
  errors: string[],
): T[] => {
  const seen = new Set<string>()
  return list.filter((e) => {
    if (!seen.has(e.id)) {
      seen.add(e.id)
      return true
    }
    errors.push(`${e.source.path}: duplicate id ${e.id}`)
    return false
  })
}

/** El `.claude/` del proyecto, salvo que sea el directorio de Claude Code (proyecto = `~`). */
const projectClaudeDir = async (scope: ScopeSelection): Promise<string | null> => {
  if (scope.kind !== 'project') return null
  const dir = join(scope.path, '.claude')
  const real = await realpath(dir).catch(() => dir)
  const home = await realpath(paths().home).catch(() => paths().home)
  return real === home ? null : dir
}

/**
 * El catálogo y, aparte, lo que no se pudo leer. Un archivo roto no tumba el escaneo. Con un
 * ámbito de proyecto suma lo de `<proyecto>/.claude/` y los servidores MCP del proyecto.
 */
export const scanCatalogReport = async (
  scope: ScopeSelection = USER_SCOPE,
): Promise<CatalogScan> => {
  const p = paths()
  const errors: string[] = []
  const projectDir = await projectClaudeDir(scope)
  const project = { scope: 'project' as const }
  const [agents, commands, skills, pAgents, pCommands, pSkills, settings] = await Promise.all([
    scanAgents(p.agents, errors),
    scanCommands(p.commands, errors),
    scanSkills(p.skills, errors),
    projectDir ? scanAgents(join(projectDir, 'agents'), errors, project) : [],
    projectDir ? scanCommands(join(projectDir, 'commands'), errors, project) : [],
    projectDir ? scanSkills(join(projectDir, 'skills'), errors, project) : [],
    readSettingsFiles(scope, errors),
  ])
  const plugins = await scanPlugins(scope, settings, errors)
  const mcpServers = await scanMcpServers({
    scope,
    settings,
    pluginServers: plugins.mcpServers,
    pluginEnabled: new Map(plugins.plugins.map((pl) => [pl.key, pl.enabled])),
    errors,
  })

  const catalog = applyPrecedence({
    ...emptyCatalog(),
    agents: uniqueById([...agents, ...pAgents, ...plugins.agents], errors),
    commands: uniqueById([...commands, ...pCommands, ...plugins.commands], errors),
    skills: uniqueById([...skills, ...pSkills, ...plugins.skills], errors),
    mcpServers: uniqueById(mcpServers, errors),
    plugins: plugins.plugins,
    roots: [
      p.agents,
      p.commands,
      p.skills,
      ...(projectDir
        ? [join(projectDir, 'agents'), join(projectDir, 'commands'), join(projectDir, 'skills')]
        : []),
    ],
  })
  return { catalog, errors: errors.sort() }
}

export const scanCatalog = async (scope?: ScopeSelection): Promise<Catalog> =>
  (await scanCatalogReport(scope)).catalog
