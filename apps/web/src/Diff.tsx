import { Dialogo } from './Dialogo.tsx'
import type { MutationPlan } from './mutations.ts'
import { conCodigo } from './Rico.tsx'
import { shortPath } from './texto.ts'

/** Muestra el diff antes de escribir. Es la única puerta por la que pasa toda escritura. */
export const DiffDialog = ({
  plan,
  title,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  plan: MutationPlan
  title: string
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) => {
  // El diff es texto plano y sus líneas pueden repetirse: el número de línea es su identidad.
  const lineas = plan.diff.split('\n').map((texto, n) => ({ n, texto }))
  return (
    <Dialogo titulo={title} onCerrar={onCancel} inicial="[data-cancelar]">
      <code className="ruta">{shortPath(plan.path)}</code>
      {plan.warnings.map((w) => (
        <p className="aviso" key={w} role="status">
          {w}
        </p>
      ))}
      <pre className="diff">
        {lineas.map((l) => (
          <span
            key={l.n}
            className={l.texto.startsWith('+') ? 'mas' : l.texto.startsWith('-') ? 'menos' : ''}
          >
            {l.texto}
            {'\n'}
          </span>
        ))}
      </pre>
      {error && (
        <p className="aviso error" role="alert">
          {conCodigo(error)}
        </p>
      )}
      {!plan.changed && (
        <p className="aviso" role="status">
          Este cambio no modifica el archivo: el contenido que se escribiría es idéntico al que ya
          hay, así que no hay nada que guardar.
        </p>
      )}
      <div className="acciones">
        <button type="button" data-cancelar onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="primario"
          data-confirmar
          disabled={busy || !plan.changed}
          onClick={onConfirm}
        >
          {busy ? 'Guardando…' : 'Guardar en el archivo'}
        </button>
      </div>
    </Dialogo>
  )
}
