import { memo } from 'react'
import { skillsJubiladas, ventanaDeHistorial } from './derivados.ts'
import type { Vista } from './Ficha.tsx'
import { LANGS, type Lang, setLang } from './i18n/index.ts'
import { useLang, useT } from './i18n/react.ts'
import { useLiveSelector } from './live.ts'
import { shortPath } from './texto.ts'
import type { Snapshot } from './types.ts'

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Indicador de la conexión en vivo. Vive aparte: solo él se re-renderiza con cada evento. */
const IndicadorVivo = () => {
  const t = useT()
  const conectado = useLiveSelector((s) => s.connected)
  const sesiones = useLiveSelector((s) => s.sessions.length)
  const fallos = useLiveSelector((s) => s.fallos)
  if (!conectado) {
    return (
      <span
        className="stat desconectado"
        role="status"
        title={t(fallos > 2 ? 'live.disconnected.title.stuck' : 'live.disconnected.title')}
      >
        <span className="dot" /> {t('live.disconnected')}
      </span>
    )
  }
  return (
    <span className="stat live" role="status" title={t('live.connected.title')}>
      <span className="dot" /> {t('live.connected')}
      {sesiones > 0 && ` · ${t('live.sessions', { n: sesiones })}`}
    </span>
  )
}

/**
 * Conmutador de idioma. Dos botones en un grupo etiquetado: `aria-pressed` dice cuál está activo y
 * cada uno lleva su nombre completo para el lector de pantalla (el rótulo visible es solo EN / ES).
 */
const NOMBRE_LANG: Record<Lang, string> = { en: 'English', es: 'Español' }

const ConmutadorIdioma = () => {
  const t = useT()
  const lang = useLang()
  return (
    <fieldset className="views idioma" aria-label={t('header.lang')} title={t('header.lang.title')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          data-on={lang === l}
          aria-pressed={lang === l}
          aria-label={NOMBRE_LANG[l]}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </fieldset>
  )
}

const Lectura = ({
  valor,
  rotulo,
  cita,
  clase = '',
}: {
  valor: string | number
  rotulo: string
  /** De dónde sale la cifra: toda lectura cita su fuente. */
  cita: string
  clase?: string
}) => (
  <div className={`lectura ${clase}`} title={cita}>
    <b>{valor}</b>
    <span>{rotulo}</span>
  </div>
)

const CabeceraImpl = ({
  snapshot,
  vista,
  onVista,
  editing,
  onEditing,
  onNuevoFlujo,
  onEncuadrar,
  onBuscar,
  onAyuda,
}: {
  snapshot: Snapshot
  vista: Vista
  onVista: (v: Vista) => void
  editing: boolean
  onEditing: (v: boolean) => void
  onNuevoFlujo: () => void
  onEncuadrar: () => void
  onBuscar: () => void
  onAyuda: () => void
}) => {
  const t = useT()
  const s = snapshot.stats
  // `roots` son las tres carpetas que se leen (agents, commands, skills); la raíz de Claude Code
  // es la que las contiene, y de ella cuelgan projects/ e history.jsonl.
  const [
    dirAgentes = '~/.claude/agents',
    dirComandos = '~/.claude/commands',
    dirSkills = '~/.claude/skills',
  ] = snapshot.catalog.roots
  const raiz = shortPath(dirAgentes.replace(/[\\/]agents[\\/]?$/, ''))
  const dias = ventanaDeHistorial(snapshot)
  const ventana =
    dias === undefined
      ? ''
      : dias === null
        ? t('src.window.all')
        : t('src.window.days', { n: dias })
  const transcripts = t('src.transcripts', { root: raiz, window: ventana })
  const jubiladas = skillsJubiladas(snapshot)

  return (
    <header className="bar">
      <div className="bar-grupo">
        <h1 className="marca">
          ai<span>-</span>office
        </h1>
        <div className="views">
          {(['sala', 'plano'] as const).map((v) => (
            <button
              key={v}
              type="button"
              data-on={vista === v}
              aria-pressed={vista === v}
              onClick={() => onVista(v)}
              title={t('header.view.title', {
                view: t(v === 'sala' ? 'view.office' : 'view.blueprint'),
                key: v === 'sala' ? '1' : '2',
              })}
            >
              {t(v === 'sala' ? 'view.office' : 'view.blueprint')}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="modo"
          data-on={editing}
          aria-pressed={editing}
          disabled={vista !== 'plano'}
          onClick={() => onEditing(!editing)}
          title={t(vista === 'plano' ? 'header.edit.title.blueprint' : 'header.edit.title.office')}
        >
          {t(editing ? 'header.edit.on' : 'header.edit.off')}
        </button>
        <button
          type="button"
          className="modo"
          onClick={onNuevoFlujo}
          title={t('header.newFlow.title')}
        >
          {t('header.newFlow')}
        </button>
      </div>

      <div className="bar-grupo bar-herramientas">
        <button type="button" className="modo" onClick={onBuscar} title={t('header.search.title')}>
          {t('header.search')} <kbd>/</kbd>
        </button>
        <button type="button" className="modo" onClick={onEncuadrar} title={t('header.fit.title')}>
          {t('header.fit')}
        </button>
        <button type="button" className="modo" onClick={onAyuda} title={t('header.help.title')}>
          <kbd>?</kbd>
        </button>
        <ConmutadorIdioma />
        <IndicadorVivo />
      </div>

      {/* El número primero y el rótulo debajo: una barra de estado se lee de un vistazo o no
          se lee. Lo que está sin estrenar va en rojo porque es la lista de trabajo. Cada cifra
          lleva en su tooltip el archivo del que sale. */}
      <div className="lecturas">
        <Lectura
          valor={s.agents}
          rotulo={t('read.agents')}
          cita={t('read.agents.src', { path: shortPath(dirAgentes) })}
        />
        <Lectura
          clase="alerta"
          valor={s.agentsUnused}
          rotulo={t('read.agents.unused')}
          cita={t('read.agents.unused.src', { transcripts })}
        />
        <Lectura
          valor={s.skills}
          rotulo={t('read.skills')}
          cita={t('read.skills.src', { path: shortPath(dirSkills) })}
        />
        <Lectura
          clase="alerta"
          valor={s.skillsUnused}
          rotulo={t('read.skills.unused')}
          cita={t('read.skills.unused.src', { transcripts })}
        />
        {jubiladas !== undefined && (
          <Lectura valor={jubiladas} rotulo={t('read.retired')} cita={t('read.retired.src')} />
        )}
        <Lectura
          valor={s.commands}
          rotulo={t('read.commands')}
          cita={t('read.commands.src', { path: shortPath(dirComandos) })}
        />
        <Lectura
          clase="alerta"
          valor={s.commands - s.commandsUsed}
          rotulo={t('read.commands.unused')}
          cita={t('read.commands.unused.src', { root: raiz })}
        />
        <Lectura
          clase="grande"
          valor={pct(s.activeRatio)}
          rotulo={t('read.ratio')}
          cita={t('read.ratio.src', { transcripts })}
        />
        <Lectura
          valor={s.declaredAgentSkill}
          rotulo={t('read.declared')}
          cita={t('read.declared.src')}
        />
        <Lectura
          valor={s.provenAgentSkill}
          rotulo={t('read.proven')}
          cita={t('read.proven.src', { transcripts })}
        />
      </div>
    </header>
  )
}

export const Cabecera = memo(CabeceraImpl)
