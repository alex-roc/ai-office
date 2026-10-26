import type { Catalog } from '@ai-office/core'

/**
 * Qué parte del catálogo es la que Claude Code carga de verdad, y cuál es del usuario.
 *
 * El catálogo lista TODO lo que hay en disco (archivados, tapados por otro ámbito, plugins
 * deshabilitados) para poder enseñarlo; los grafos y las estadísticas solo cuentan lo vivo.
 */

/** Claves (`nombre@marketplace`) de los plugins habilitados. */
export const enabledPluginKeys = (catalog: Pick<Catalog, 'plugins'>): Set<string> =>
  new Set(catalog.plugins.filter((p) => p.enabled).map((p) => p.key))

/**
 * Lo que se carga: ni archivados, ni tapados, ni de un plugin deshabilitado. Los servidores MCP
 * desactivados (`enabled: false`) tampoco, pero un `null` (no se sabe) cuenta como cargado.
 */
export const liveCatalog = (catalog: Catalog): Catalog => {
  const plugins = enabledPluginKeys(catalog)
  const live = <T extends { status: string; plugin?: string }>(e: T): boolean =>
    e.status !== 'shadowed' && (e.plugin === undefined || plugins.has(e.plugin))
  return {
    ...catalog,
    agents: catalog.agents.filter((a) => !a.archived && live(a)),
    skills: catalog.skills.filter(live),
    commands: catalog.commands.filter(live),
    mcpServers: catalog.mcpServers.filter((m) => live(m) && m.enabled !== false),
  }
}

/** Lo vivo que es del usuario o del proyecto: lo que se puede editar, jubilar y mejorar. */
export const ownCatalog = (catalog: Catalog): Catalog => {
  const live = liveCatalog(catalog)
  return {
    ...live,
    agents: live.agents.filter((a) => a.scope !== 'plugin'),
    skills: live.skills.filter((s) => s.scope !== 'plugin'),
    commands: live.commands.filter((c) => c.scope !== 'plugin'),
    mcpServers: live.mcpServers.filter((m) => m.scope !== 'plugin'),
  }
}
