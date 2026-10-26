import { agruparProyectos, ambitoActivo, valorDeAmbito } from './alcance.ts'
import { useT } from './i18n/react.ts'
import { shortPath } from './texto.ts'
import type { KnownProject, Snapshot } from './types.ts'

/**
 * Selector de ÁMBITO: solo lo del usuario, o además lo de uno de los proyectos conocidos. Es un
 * `<select>` nativo a propósito: ya es accesible por teclado y por lector de pantalla, y cada
 * opción lleva la ruta abreviada y las sesiones que se han tenido en ese proyecto. Los proyectos
 * con carpeta `.claude/` van primero, en su propio grupo: son los que de verdad añaden algo.
 */
export const SelectorAmbito = ({
  snapshot,
  onCambiar,
  deshabilitado = false,
  titulo,
  id,
}: {
  snapshot: Snapshot
  /** Recibe `user` o `project:<ruta>`. */
  onCambiar: (valor: string) => void
  deshabilitado?: boolean
  /** Lo que explica por qué está deshabilitado (la demo estática no puede cambiar de ámbito). */
  titulo?: string
  id?: string
}) => {
  const t = useT()
  const activo = ambitoActivo(snapshot)
  const conocidos = snapshot.knownProjects ?? []
  const grupos = agruparProyectos(conocidos)
  // El proyecto activo siempre tiene su opción, aunque la lista de conocidos no lo traiga.
  const falta =
    activo.kind === 'project' && !conocidos.some((p) => p.path === activo.path) ? activo.path : null
  const [dirAgentes = '~/.claude/agents'] = snapshot.catalog.roots
  const raiz = shortPath(dirAgentes.replace(/[\\/]agents[\\/]?$/, ''))

  const opcion = (p: KnownProject) => (
    <option key={p.path} value={`project:${p.path}`} disabled={!p.exists}>
      {`${p.name} · ${shortPath(p.path)} · ${t('count.sessions', { n: p.sessions })}${
        p.exists ? '' : ` · ${t('scope.missing')}`
      }`}
    </option>
  )

  return (
    <label className="selector-ambito" title={titulo ?? t('scope.title')}>
      <span>{t('scope.label')}</span>
      <select
        id={id}
        value={valorDeAmbito(activo)}
        disabled={deshabilitado}
        onChange={(e) => onCambiar(e.target.value)}
        aria-label={t('scope.label')}
      >
        <option value="user">{t('scope.option.user', { root: raiz })}</option>
        {falta && (
          <option
            value={`project:${falta}`}
          >{`${shortPath(falta)} · ${t('scope.current')}`}</option>
        )}
        {grupos.conClaude.length > 0 && (
          <optgroup label={t('scope.group.claude')}>{grupos.conClaude.map(opcion)}</optgroup>
        )}
        {grupos.sinClaude.length > 0 && (
          <optgroup label={t('scope.group.other')}>{grupos.sinClaude.map(opcion)}</optgroup>
        )}
      </select>
    </label>
  )
}
