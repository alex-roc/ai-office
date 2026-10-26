import { type ReactNode, useEffect, useId, useRef } from 'react'

/**
 * Diálogo modal accesible: `role="dialog"`, foco inicial dentro, trampa de foco, Esc para
 * cerrar y devolución del foco a quien lo abrió. Todos los diálogos de la aplicación (diff, editor
 * de flujos, confirmaciones, buscador, ayuda) pasan por aquí para no reimplementar nada de esto.
 *
 * Los diálogos se apilan (el diff se abre ENCIMA del editor de flujos). Una pila a nivel de
 * módulo decide cuál recibe Esc y Tab: solo el de arriba.
 */

const FOCABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const pila: symbol[] = []

/** ¿Hay algún diálogo abierto? Los atajos de teclado globales se apagan mientras tanto. */
export const hayDialogoAbierto = (): boolean => pila.length > 0

export const Dialogo = ({
  titulo,
  onCerrar,
  ancho = false,
  claseModal = '',
  inicial,
  children,
}: {
  titulo: ReactNode
  onCerrar: () => void
  ancho?: boolean
  claseModal?: string
  /** Selector del elemento que recibe el foco al abrir; por defecto, el primer control. */
  inicial?: string
  children: ReactNode
}) => {
  const fondoRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const idTitulo = useId()
  // El cierre se lee desde un ref: el padre suele pasar una función nueva en cada render y no
  // debe reiniciar el efecto (que robaría el foco otra vez).
  const cerrarRef = useRef(onCerrar)
  cerrarRef.current = onCerrar

  useEffect(() => {
    const modal = modalRef.current
    const fondo = fondoRef.current
    if (!modal || !fondo) return
    const marca = Symbol('dialogo')
    pila.push(marca)
    const previo = document.activeElement as HTMLElement | null

    const enfocar = () => {
      const quien =
        (inicial ? modal.querySelector<HTMLElement>(inicial) : null) ??
        modal.querySelector<HTMLElement>(FOCABLE) ??
        modal
      quien.focus()
    }
    enfocar()

    const alTeclear = (e: KeyboardEvent) => {
      if (pila[pila.length - 1] !== marca) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cerrarRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const focables = Array.from(modal.querySelectorAll<HTMLElement>(FOCABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      const primero = focables[0]
      const ultimo = focables[focables.length - 1]
      if (!primero || !ultimo) {
        e.preventDefault()
        modal.focus()
        return
      }
      const dentro = modal.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === primero || !dentro)) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && (document.activeElement === ultimo || !dentro)) {
        e.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', alTeclear, true)

    // Clic en el fondo = cerrar, pero solo si el gesto EMPEZÓ y terminó en el fondo: arrastrar
    // para seleccionar texto dentro del diálogo y soltar fuera no debe cerrarlo. Va con
    // listeners nativos y no con `onClick`: el fondo no es un control, es un gesto de escape.
    let empezoEnFondo = false
    const alPulsar = (e: PointerEvent) => {
      empezoEnFondo = e.target === fondo
    }
    const alSoltar = (e: MouseEvent) => {
      if (empezoEnFondo && e.target === fondo && pila[pila.length - 1] === marca) {
        cerrarRef.current()
      }
      empezoEnFondo = false
    }
    fondo.addEventListener('pointerdown', alPulsar)
    fondo.addEventListener('click', alSoltar)

    return () => {
      document.removeEventListener('keydown', alTeclear, true)
      fondo.removeEventListener('pointerdown', alPulsar)
      fondo.removeEventListener('click', alSoltar)
      const i = pila.indexOf(marca)
      if (i >= 0) pila.splice(i, 1)
      // Devuelve el foco a quien abrió el diálogo, si sigue en la página.
      if (previo && document.contains(previo)) previo.focus()
    }
  }, [inicial])

  return (
    <div className="modal-fondo" ref={fondoRef}>
      <div
        className={`modal${ancho ? ' ancho' : ''}${claseModal ? ` ${claseModal}` : ''}`}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
      >
        <h3 id={idTitulo}>{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

/** Confirmación propia: nunca `window.confirm`, que bloquea el hilo y no cuadra con la interfaz. */
export const Confirmar = ({
  titulo,
  texto,
  confirmar,
  cancelar = 'Seguir editando',
  onConfirmar,
  onCancelar,
}: {
  titulo: string
  texto: string
  confirmar: string
  cancelar?: string
  onConfirmar: () => void
  onCancelar: () => void
}) => (
  <Dialogo titulo={titulo} onCerrar={onCancelar} claseModal="chico" inicial="[data-cancelar]">
    <p className="texto-dialogo">{texto}</p>
    <div className="acciones">
      <button type="button" data-cancelar onClick={onCancelar}>
        {cancelar}
      </button>
      <button type="button" className="peligro" onClick={onConfirmar}>
        {confirmar}
      </button>
    </div>
  </Dialogo>
)
