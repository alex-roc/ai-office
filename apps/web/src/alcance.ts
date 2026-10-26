import { getLang, type Lang, tr } from './i18n/index.ts'
import type {
  EntityBase,
  EntityScope,
  KnownProject,
  McpServer,
  Plugin,
  ScopeSelection,
  Snapshot,
} from './types.ts'

/**
 * Ámbito y origen: de dónde sale cada entidad (usuario, proyecto, plugin) y qué ámbito de trabajo
 * tiene abierto el daemon. Puro y sin React: se prueba en Node.
 *
 * Todo se lee de forma defensiva: un daemon anterior a los ámbitos no manda `scope` en las
 * entidades ni `plugins`/`mcpServers` en el catálogo, y la interfaz sigue funcionando con lo que
 * tenía (todo es del usuario y no hay plugins ni servidores).
 */

export const ambitoDe = (e: Pick<EntityBase, 'scope'>): EntityScope => e.scope ?? 'user'

export const pluginsDe = (s: Snapshot): Plugin[] => s.catalog.plugins ?? []
export const servidoresMcpDe = (s: Snapshot): McpServer[] => s.catalog.mcpServers ?? []

/** `release-kit@acme-tools` → `release-kit`. */
export const nombreDePlugin = (key: string): string => key.split('@')[0] ?? key

export const esDePlugin = (e: Pick<EntityBase, 'scope'>): boolean => ambitoDe(e) === 'plugin'
export const estaTapada = (e: Pick<EntityBase, 'status'>): boolean => e.status === 'shadowed'

/** Quién tapa a una entidad, con su nombre y su ámbito. */
export interface Tapadora {
  name: string
  scope: EntityScope
}

/**
 * Quién tapa a una entidad tapada. El nombre y el ámbito salen del propio id
 * (`tipo:proveedor/ámbito/nombre`): así se puede citar aunque la tapadora no esté dibujada.
 */
export const quienTapa = (e: Pick<EntityBase, 'status' | 'shadowedBy'>): Tapadora | undefined => {
  if (!estaTapada(e)) return undefined
  const m = /^[a-z]+:[^/]+\/([a-z]+)\/(.+)$/.exec(e.shadowedBy ?? '')
  return { name: m?.[2] ?? '?', scope: (m?.[1] as EntityScope | undefined) ?? 'user' }
}

/** ¿Es de solo lectura? Lo de un plugin son copias que una actualización sobrescribe. */
export const esSoloLectura = (e: Pick<EntityBase, 'source'>): boolean => e.source.readOnly === true

/** El plugin dueño de una entidad (por su `plugin: <nombre>@<marketplace>`), si lo hay. */
export const pluginDe = (s: Snapshot, e: Pick<EntityBase, 'plugin'>): Plugin | undefined =>
  e.plugin ? pluginsDe(s).find((p) => p.key === e.plugin) : undefined

/** La etiqueta corta de origen: `user`, `project`, `plugin release-kit`… */
export const etiquetaAmbito = (
  e: Pick<EntityBase, 'scope' | 'plugin'>,
  lang: Lang = getLang(),
): string => {
  const ambito = ambitoDe(e)
  if (ambito === 'plugin') {
    return tr(lang, 'scope.plugin', { name: e.plugin ? nombreDePlugin(e.plugin) : '?' })
  }
  return tr(lang, `scope.${ambito}`)
}

/**
 * Los tres cubos del filtro de ámbito del Registro. Un servidor `local` (privado del proyecto, en
 * `~/.claude.json`) cuenta como del proyecto; `managed` no es de ninguno y solo sale con "todos".
 */
export type GrupoAmbito = 'user' | 'project' | 'plugin'

export const grupoDeAmbito = (ambito: EntityScope): GrupoAmbito | null =>
  ambito === 'user' || ambito === 'builtin'
    ? 'user'
    : ambito === 'project' || ambito === 'local'
      ? 'project'
      : ambito === 'plugin'
        ? 'plugin'
        : null

// --- El ámbito de trabajo (selector de la cabecera) -------------------------------------------

/** El ámbito activo del snapshot; sin él (daemon antiguo) es el de usuario. */
export const ambitoActivo = (s: Snapshot): ScopeSelection => s.scope ?? { kind: 'user' }

export const hayProyecto = (s: Snapshot): boolean => ambitoActivo(s).kind === 'project'

/** El valor de una opción del selector: `user` o `project:<ruta>`. */
export const valorDeAmbito = (a: ScopeSelection): string =>
  a.kind === 'user' ? 'user' : `project:${a.path}`

/** El PARCHE de `POST /api/config` que lleva a esa opción. Cambiar a usuario no borra el proyecto guardado. */
export const parcheDeAmbito = (
  valor: string,
): { scope: 'user' } | { scope: 'project'; project: string } =>
  valor.startsWith('project:')
    ? { scope: 'project', project: valor.slice('project:'.length) }
    : { scope: 'user' }

/** Nombre del proyecto activo (el último tramo de su ruta), o `null` en el ámbito de usuario. */
export const nombreDeProyecto = (a: ScopeSelection): string | null =>
  a.kind === 'project' ? (a.path.split(/[\\/]/).filter(Boolean).pop() ?? a.path) : null

export interface GruposProyectos {
  /** Con carpeta `.claude/`: son los que de verdad aportan configuración. */
  conClaude: KnownProject[]
  /** Sin ella: solo se ha trabajado ahí. */
  sinClaude: KnownProject[]
}

/** Más sesiones primero y el nombre como desempate: el orden no se baraja al refrescar. */
const masActivosPrimero = (a: KnownProject, b: KnownProject): number =>
  b.sessions - a.sessions || a.name.localeCompare(b.name) || a.path.localeCompare(b.path)

export const agruparProyectos = (proyectos: KnownProject[]): GruposProyectos => ({
  conClaude: proyectos.filter((p) => p.hasClaudeDir).sort(masActivosPrimero),
  sinClaude: proyectos.filter((p) => !p.hasClaudeDir).sort(masActivosPrimero),
})
