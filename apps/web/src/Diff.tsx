import type { MutationPlan } from './mutations.ts'

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
}) => (
  <div className="modal-fondo" onClick={onCancel} role="presentation">
    <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <h3>{title}</h3>
      <code className="ruta">{plan.path.replace(/^\/Users\/[^/]+/, '~')}</code>
      {plan.warnings.map((w) => (
        <p className="aviso" key={w}>
          {w}
        </p>
      ))}
      <pre className="diff">
        {plan.diff.split('\n').map((line, i) => (
          <span
            // El diff es texto plano y sus líneas pueden repetirse: el índice es la única clave estable.
            key={`${i}-${line}`}
            className={line.startsWith('+') ? 'mas' : line.startsWith('-') ? 'menos' : ''}
          >
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
      {error && <p className="aviso error">{error}</p>}
      <div className="acciones">
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="primario"
          disabled={busy || !plan.changed}
          onClick={onConfirm}
        >
          {busy ? 'Guardando…' : 'Guardar en el archivo'}
        </button>
      </div>
    </div>
  </div>
)
