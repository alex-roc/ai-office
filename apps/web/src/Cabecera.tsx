import { memo } from 'react'
import { skillsJubiladas, ventanaDeHistorial } from './derivados.ts'
import type { Vista } from './Ficha.tsx'
import { useLiveSelector } from './live.ts'
import { plural, shortPath } from './texto.ts'
import type { Snapshot } from './types.ts'

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Indicador de la conexión en vivo. Vive aparte: solo él se re-renderiza con cada evento. */
const IndicadorVivo = () => {
  const conectado = useLiveSelector((s) => s.connected)
  const sesiones = useLiveSelector((s) => s.sessions.length)
  const fallos = useLiveSelector((s) => s.fallos)
  if (!conectado) {
    return (
      <span
        className="stat desconectado"
        role="status"
        title={
          fallos > 2
            ? 'El WebSocket de eventos en vivo no se conecta. Si acabas de reiniciar el daemon, pega el enlace nuevo (con su #t=…) en esta pestaña.'
            : 'Sin conexión con el daemon: no llegan eventos en vivo. Se reintenta solo, cada vez más despacio.'
        }
      >
        <span className="dot" /> sin conexión
      </span>
    )
  }
  return (
    <span
      className="stat live"
      role="status"
      title="Eventos en vivo de los hooks de Claude Code, por WebSocket desde el daemon local."
    >
      <span className="dot" /> en vivo
      {sesiones > 0 && ` · ${plural(sesiones, 'sesión', 'sesiones')} en curso`}
    </span>
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
  const s = snapshot.stats
  const raiz = shortPath(snapshot.catalog.roots[0] ?? '~/.claude')
  const dias = ventanaDeHistorial(snapshot)
  const ventana =
    dias === undefined
      ? ''
      : dias === null
        ? ', todo el historial'
        : `, últimos ${plural(dias, 'día', 'días')}`
  const transcripts = `transcripts de ${raiz}/projects${ventana}`
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
              title={`${v === 'sala' ? 'Sala' : 'Plano'} (tecla ${v === 'sala' ? '1' : '2'})`}
            >
              {v === 'sala' ? 'Sala' : 'Plano'}
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
          title={
            vista === 'plano'
              ? 'Arrastra de un agente a una skill para escribir la relación en su prompt'
              : 'Solo disponible en el Plano: cambia de vista para editar el grafo'
          }
        >
          {editing ? 'editando' : 'editar grafo'}
        </button>
        <button
          type="button"
          className="modo"
          onClick={onNuevoFlujo}
          title="Componer un slash command"
        >
          nuevo flujo
        </button>
      </div>

      <div className="bar-grupo bar-herramientas">
        <button type="button" className="modo" onClick={onBuscar} title="Buscar (tecla /)">
          buscar <kbd>/</kbd>
        </button>
        <button
          type="button"
          className="modo"
          onClick={onEncuadrar}
          title="Encuadrar todo (tecla 0)"
        >
          encuadrar
        </button>
        <button type="button" className="modo" onClick={onAyuda} title="Ayuda y atajos (tecla ?)">
          <kbd>?</kbd>
        </button>
        <IndicadorVivo />
      </div>

      {/* El número primero y el rótulo debajo: una barra de estado se lee de un vistazo o no
          se lee. Lo que está sin estrenar va en rojo porque es la lista de trabajo. Cada cifra
          lleva en su tooltip el archivo del que sale. */}
      <div className="lecturas">
        <Lectura
          valor={s.agents}
          rotulo="agentes"
          cita={`Archivos agents/*.md bajo ${snapshot.catalog.roots.map(shortPath).join(', ')}`}
        />
        <Lectura
          clase="alerta"
          valor={s.agentsUnused}
          rotulo="sin estrenar"
          cita={`Agentes sin una sola delegación en los ${transcripts}`}
        />
        <Lectura
          valor={s.skills}
          rotulo="skills"
          cita={`Carpetas skills/*/SKILL.md bajo ${raiz}`}
        />
        <Lectura
          clase="alerta"
          valor={s.skillsUnused}
          rotulo="sin usar"
          cita={`Skills que no aparecen invocadas en los ${transcripts}`}
        />
        {jubiladas !== undefined && (
          <Lectura
            valor={jubiladas}
            rotulo="jubiladas"
            cita="Skills con disable-model-invocation: true en su SKILL.md"
          />
        )}
        <Lectura
          valor={s.commands}
          rotulo="comandos"
          cita={`Archivos commands/*.md bajo ${raiz}`}
        />
        <Lectura
          clase="alerta"
          valor={s.commands - s.commandsUsed}
          rotulo="sin ejecutar"
          cita={`Comandos que no figuran tecleados en ${raiz}/history.jsonl`}
        />
        <Lectura
          clase="grande"
          valor={pct(s.activeRatio)}
          rotulo="ratio activo"
          cita={`Skills con uso reciente (en práctica o acreditadas; el grado caduca a los 90 días) sobre el total. Fuente: ${transcripts}`}
        />
        <Lectura
          valor={s.declaredAgentSkill}
          rotulo="declaradas"
          cita="Pares agente→skill que el prompt de un agente manda leer (capa declarada, agents/*.md)"
        />
        <Lectura
          valor={s.provenAgentSkill}
          rotulo="demostradas"
          cita={`Pares agente→skill con invocaciones reales en los ${transcripts}`}
        />
      </div>
    </header>
  )
}

export const Cabecera = memo(CabeceraImpl)
