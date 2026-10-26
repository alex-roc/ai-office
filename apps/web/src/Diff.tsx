import { Dialogo } from './Dialogo.tsx'
import { useT } from './i18n/react.ts'
import type { MutationPlan } from './mutations.ts'
import { conCodigo } from './Rico.tsx'
import { detalleTexto, shortPath } from './texto.ts'

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
  const t = useT()
  // El diff es texto plano y sus líneas pueden repetirse: el número de línea es su identidad.
  const lineas = plan.diff.split('\n').map((texto, n) => ({ n, texto }))
  return (
    <Dialogo titulo={title} onCerrar={onCancel} inicial="[data-cancelar]">
      <code className="ruta">{shortPath(plan.path)}</code>
      {plan.warnings.map((w, i) => (
        <p className="aviso" key={w} role="status">
          {detalleTexto('warn', plan.warningDetails?.[i], w)}
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
          {t('diff.noChange')}
        </p>
      )}
      <div className="acciones">
        <button type="button" data-cancelar onClick={onCancel}>
          {t('diff.cancel')}
        </button>
        <button
          type="button"
          className="primario"
          data-confirmar
          disabled={busy || !plan.changed}
          onClick={onConfirm}
        >
          {busy ? t('diff.saving') : t('diff.save')}
        </button>
      </div>
    </Dialogo>
  )
}
