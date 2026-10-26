import { memo, useEffect, useRef, useState } from 'react'
import { fuenteTranscripts, skillsJubiladas } from './derivados.ts'
import type { Vista } from './Ficha.tsx'
import { LANGS, type Lang, setLang } from './i18n/index.ts'
import { useLang, useT } from './i18n/react.ts'
import { useLiveSelector } from './live.ts'
import type { CreateRequest } from './mutations.ts'
import { shortPath } from './texto.ts'
import type { Snapshot } from './types.ts'

const VISTAS = [
  { id: 'sala', rotulo: 'view.office', tecla: '1' },
  { id: 'plano', rotulo: 'view.blueprint', tecla: '2' },
  { id: 'registro', rotulo: 'view.ledger', tecla: '3' },
] as const

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

/**
 * Menú "nuevo ▾": agente, skill, comando en blanco o el lienzo de flujos. Un botón con
 * `aria-haspopup`, una lista de botones, y Esc / clic fuera / elegir lo cierran devolviendo el foco.
 */
const MenuNuevo = ({
  onNuevo,
  onNuevoFlujo,
}: {
  onNuevo: (kind: CreateRequest['kind']) => void
  onNuevoFlujo: () => void
}) => {
  const t = useT()
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!abierto) return
    raiz.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAbierto(false)
        boton.current?.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = Array.from(
          raiz.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
        )
        const i = items.indexOf(document.activeElement as HTMLElement)
        const paso = e.key === 'ArrowDown' ? 1 : -1
        items[(i + paso + items.length) % items.length]?.focus()
      }
    }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla, true)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', tecla, true)
    }
  }, [abierto])

  const elegir = (f: () => void) => () => {
    setAbierto(false)
    f()
  }
  return (
    <div className="menu-nuevo" ref={raiz}>
      <button
        ref={boton}
        type="button"
        className="modo"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        title={t('header.new.title')}
      >
        {t('header.new')} ▾
      </button>
      {abierto && (
        <div className="menu-lista" role="menu" aria-label={t('header.new.title')}>
          {(['agent', 'skill', 'command'] as const).map((k) => (
            <button key={k} type="button" role="menuitem" onClick={elegir(() => onNuevo(k))}>
              {t(`header.new.${k}`)}
            </button>
          ))}
          <button type="button" role="menuitem" onClick={elegir(onNuevoFlujo)}>
            {t('header.newFlow')}
          </button>
        </div>
      )}
    </div>
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
  onNuevo,
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
  onNuevo: (kind: CreateRequest['kind']) => void
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
  const transcripts = fuenteTranscripts(snapshot)
  const jubiladas = skillsJubiladas(snapshot)

  return (
    <header className="bar">
      <div className="bar-grupo">
        <h1 className="marca">
          ai<span>-</span>office
        </h1>
        <div className="views">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              data-on={vista === v.id}
              aria-pressed={vista === v.id}
              onClick={() => onVista(v.id)}
              title={t('header.view.title', { view: t(v.rotulo), key: v.tecla })}
            >
              {t(v.rotulo)}
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
          title={t(
            vista === 'plano'
              ? 'header.edit.title.blueprint'
              : vista === 'sala'
                ? 'header.edit.title.office'
                : 'header.edit.title.ledger',
          )}
        >
          {t(editing ? 'header.edit.on' : 'header.edit.off')}
        </button>
        <MenuNuevo onNuevo={onNuevo} onNuevoFlujo={onNuevoFlujo} />
      </div>

      <div className="bar-grupo bar-herramientas">
        <button type="button" className="modo" onClick={onBuscar} title={t('header.search.title')}>
          {t('header.search')} <kbd>/</kbd>
        </button>
        <button
          type="button"
          className="modo"
          onClick={onEncuadrar}
          disabled={vista === 'registro'}
          title={t('header.fit.title')}
        >
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
