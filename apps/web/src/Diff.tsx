import { Dialogo } from './Dialogo.tsx'
import { useT } from './i18n/react.ts'
import type { MutationPlan } from './mutations.ts'
import { conCodigo } from './Rico.tsx'
import { detalleTexto, shortPath } from './texto.ts'

/** Un plan con su diff: el aviso de cada uno va junto a su propio archivo. */
const BloqueDiff = ({ plan, titulo }: { plan: MutationPlan; titulo?: string }) => {
  const t = useT()
  // El diff es texto plano y sus líneas pueden repetirse: el número de línea es su identidad.
  const lineas = plan.diff.split('\n').map((texto, n) => ({ n, texto }))
  return (
    <div className="bloque-diff">
      {titulo && <h4 className="sub-ayuda">{titulo}</h4>}
      <code className="ruta">{shortPath(plan.path)}</code>
      {plan.warnings.map((w, i) => (
        <p className="aviso" key={w} role="status">
          {detalleTexto('warn', plan.warningDetails?.[i], w)}
        </p>
      ))}
      {plan.changed ? (
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
      ) : (
        <p className="aviso" role="status">
          {t('diff.noChange')}
        </p>
      )}
    </div>
  )
}

/**
 * Muestra el diff antes de escribir. Es la única puerta por la que pasa toda escritura. Con `lote`
 * enseña varios planes (archivos distintos) uno tras otro y los guarda con una sola confirmación.
 */
export const DiffDialog = ({
  plan,
  lote,
  title,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  plan: MutationPlan
  /** Varios planes a la vez (cada uno con su título); sin él, solo `plan`. */
  lote?: { plan: MutationPlan; title: string }[]
  title: string
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) => {
  const t = useT()
  const bloques = lote && lote.length > 0 ? lote : [{ plan, title: '' }]
  const hayCambios = bloques.some((b) => b.plan.changed)
  return (
    <Dialogo
      titulo={title}
      onCerrar={onCancel}
      inicial="[data-cancelar]"
      ancho={bloques.length > 1}
    >
      {bloques.length > 1 && (
        <p className="nota-dialogo">{t('diff.batch', { n: bloques.length })}</p>
      )}
      {bloques.map((b) => (
        <BloqueDiff
          key={b.plan.path}
          plan={b.plan}
          titulo={bloques.length > 1 ? b.title : undefined}
        />
      ))}
      {error && (
        <p className="aviso error" role="alert">
          {conCodigo(error)}
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
          disabled={busy || !hayCambios}
          onClick={onConfirm}
        >
          {busy ? t('diff.saving') : t('diff.save')}
        </button>
      </div>
    </Dialogo>
  )
}
