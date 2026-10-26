import { type ReactNode, useId, useMemo, useState } from 'react'
import { ordenarMarcadas } from './campos.ts'
import { Confirmar, Dialogo } from './Dialogo.tsx'
import { useT } from './i18n/react.ts'
import { normalizar } from './texto.ts'

/**
 * Los diálogos de edición de la ficha. Todos siguen el mismo patrón que el editor de flujos:
 * el diálogo NO se cierra al pedir el diff (el diff se abre encima), cerrar con cambios sin
 * guardar pide confirmación, y solo un guardado con éxito lo cierra (lo hace quien lo abrió).
 */

export const DialogoEdicion = ({
  titulo,
  sucio,
  puede = true,
  onCerrar,
  onRevisar,
  claseModal = '',
  children,
}: {
  titulo: string
  /** ¿Hay cambios sin guardar? Sin ellos no hay nada que revisar ni que confirmar al salir. */
  sucio: boolean
  /** ¿Lo escrito es válido? Si no, no se puede pedir el diff. */
  puede?: boolean
  onCerrar: () => void
  onRevisar: () => void
  claseModal?: string
  children: ReactNode
}) => {
  const t = useT()
  const [saliendo, setSaliendo] = useState(false)
  const intentarCerrar = () => (sucio ? setSaliendo(true) : onCerrar())
  return (
    <>
      <Dialogo titulo={titulo} onCerrar={intentarCerrar} claseModal={claseModal}>
        {children}
        <div className="acciones">
          <button type="button" onClick={intentarCerrar}>
            {t('edit.cancel')}
          </button>
          <button
            type="button"
            className="primario"
            disabled={!sucio || !puede}
            onClick={onRevisar}
          >
            {t('edit.review')}
          </button>
        </div>
      </Dialogo>
      {saliendo && (
        <Confirmar
          titulo={t('edit.discard.title')}
          texto={t('edit.discard.text')}
          confirmar={t('edit.discard.confirm')}
          onConfirmar={onCerrar}
          onCancelar={() => setSaliendo(false)}
        />
      )}
    </>
  )
}

/**
 * Un texto: `linea` (una pista de argumento), `parrafo` (una description) o `documento` (un
 * prompt entero, en un diálogo casi a pantalla completa y en monoespaciada). El valor se entrega
 * tal cual salvo en `linea` y `parrafo`, donde se recortan los espacios de los extremos.
 */
export const EditarTexto = ({
  titulo,
  etiqueta,
  inicial,
  variante,
  ayuda,
  nota,
  onCerrar,
  onRevisar,
}: {
  titulo: string
  etiqueta: string
  inicial: string
  variante: 'linea' | 'parrafo' | 'documento'
  /** Un lado del campo con ayuda para escribir (las palabras que nunca has tecleado). */
  ayuda?: ReactNode
  nota?: string
  onCerrar: () => void
  onRevisar: (valor: string) => void
}) => {
  const t = useT()
  const [valor, setValor] = useState(inicial)
  const id = useId()
  const salida = variante === 'documento' ? valor : valor.trim()
  const lineas = valor === '' ? 0 : valor.split('\n').length
  return (
    <DialogoEdicion
      titulo={titulo}
      sucio={salida !== inicial}
      onCerrar={onCerrar}
      onRevisar={() => onRevisar(salida)}
      claseModal={variante === 'documento' ? 'editor-texto' : 'edicion'}
    >
      <div className={ayuda ? 'edicion-cuerpo edicion-cols' : 'edicion-cuerpo'}>
        <div className="campo-texto">
          <label htmlFor={id}>{etiqueta}</label>
          {variante === 'linea' ? (
            <input id={id} value={valor} onChange={(e) => setValor(e.target.value)} />
          ) : (
            <textarea
              id={id}
              className={variante === 'documento' ? 'texto-mono' : 'texto-parrafo'}
              value={valor}
              spellCheck={variante !== 'documento'}
              onChange={(e) => setValor(e.target.value)}
            />
          )}
          {variante === 'documento' && (
            <p className="nota-dialogo">{t('edit.lines', { n: lineas })}</p>
          )}
          {nota && <p className="nota-dialogo">{nota}</p>}
        </div>
        {ayuda}
      </div>
    </DialogoEdicion>
  )
}

export interface OpcionLista {
  valor: string
  etiqueta: string
  /** Texto pequeño a la derecha (un coste, un motivo). */
  nota?: string
  /** Marcada y sin poder cambiarla: algo que esta pantalla no sabe retirar. */
  fija?: boolean
}

/** Pasa a partir de este número de opciones el diálogo ofrece un campo para filtrarlas. */
const UMBRAL_FILTRO = 12

/**
 * Una selección múltiple con casillas. Con `todas` aparece arriba la opción de "todas" (el
 * `tools:` ausente = hereda todo), que apaga las casillas. Entrega las marcadas en orden estable, o
 * `null` si se eligió "todas".
 */
export const EditarLista = ({
  titulo,
  leyenda,
  intro,
  opciones,
  inicial,
  todas,
  vacio,
  onCerrar,
  onRevisar,
}: {
  titulo: string
  leyenda: string
  intro?: string
  opciones: OpcionLista[]
  inicial: string[]
  todas?: { etiqueta: string; inicial: boolean }
  /** Qué decir si no hay ninguna opción que ofrecer. */
  vacio?: string
  onCerrar: () => void
  onRevisar: (valor: string[] | null) => void
}) => {
  const t = useT()
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(() => new Set(inicial))
  const [todasOn, setTodasOn] = useState(todas?.inicial ?? false)
  const [filtro, setFiltro] = useState('')
  const orden = useMemo(() => opciones.map((o) => o.valor), [opciones])
  const valor = ordenarMarcadas(inicial, marcadas, orden)
  const q = normalizar(filtro.trim())
  const visibles = q ? opciones.filter((o) => normalizar(o.etiqueta).includes(q)) : opciones
  const sucio = todas
    ? todasOn !== todas.inicial ||
      (!todasOn && (valor.length !== inicial.length || valor.some((v) => !inicial.includes(v))))
    : valor.length !== inicial.length || valor.some((v) => !inicial.includes(v))
  const alternar = (v: string, on: boolean) =>
    setMarcadas((prev) => {
      const sig = new Set(prev)
      if (on) sig.add(v)
      else sig.delete(v)
      return sig
    })
  return (
    <DialogoEdicion
      titulo={titulo}
      sucio={sucio}
      // Con `todas`, una lista vacía sin marcar "todas" escribiría `tools: []`: ninguna herramienta.
      puede={!todas || todasOn || valor.length > 0}
      onCerrar={onCerrar}
      onRevisar={() => onRevisar(todasOn ? null : valor)}
      claseModal="edicion"
    >
      {intro && <p className="nota-dialogo">{intro}</p>}
      {todas && (
        <label className="casilla todas">
          <input type="checkbox" checked={todasOn} onChange={(e) => setTodasOn(e.target.checked)} />
          <span>{todas.etiqueta}</span>
        </label>
      )}
      {opciones.length > UMBRAL_FILTRO && (
        <input
          className="buscador-campo"
          type="search"
          value={filtro}
          placeholder={t('edit.filter')}
          aria-label={t('edit.filter')}
          onChange={(e) => setFiltro(e.target.value)}
        />
      )}
      <fieldset className="lista-casillas" disabled={todasOn}>
        <legend>{leyenda}</legend>
        {opciones.length === 0 && vacio && <p className="empty">{vacio}</p>}
        {visibles.map((o) => (
          <label className="casilla" key={o.valor} title={o.nota}>
            <input
              type="checkbox"
              checked={marcadas.has(o.valor)}
              disabled={o.fija}
              onChange={(e) => alternar(o.valor, e.target.checked)}
            />
            <span className="casilla-nombre">{o.etiqueta}</span>
            {o.nota && <span className="casilla-nota">{o.nota}</span>}
          </label>
        ))}
      </fieldset>
    </DialogoEdicion>
  )
}
