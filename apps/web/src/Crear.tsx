import { useId, useState } from 'react'
import { type ErrorNombre, validarNombre } from './campos.ts'
import { DialogoEdicion } from './Edicion.tsx'
import { useT } from './i18n/react.ts'
import type { CreateRequest } from './mutations.ts'
import type { Snapshot } from './types.ts'

/**
 * Nombres que ya existen de cada tipo. En los agentes cuentan también los archivados: restaurarlo
 * después chocaría con el nuevo (el daemon lo rechaza igual, pero aquí se ve antes de teclear más).
 */
const existentes = (s: Snapshot, kind: CreateRequest['kind']): string[] =>
  (kind === 'agent'
    ? s.catalog.agents
    : kind === 'skill'
      ? s.catalog.skills
      : s.catalog.commands
  ).map((e) => e.name)

const MENSAJE: Record<
  ErrorNombre,
  'create.name.empty' | 'create.name.format' | 'create.name.exists'
> = {
  empty: 'create.name.empty',
  format: 'create.name.format',
  exists: 'create.name.exists',
}

/**
 * Diálogo de creación: nombre + description (+ prompt o cuerpo opcional). El nombre se valida en
 * vivo, con la misma regla que el daemon. Pedir la revisión abre el diff ENCIMA: cancelarlo
 * devuelve aquí, con todo lo escrito intacto.
 */
export const Crear = ({
  kind,
  snapshot,
  onCerrar,
  onRevisar,
  onFlujo,
}: {
  kind: CreateRequest['kind']
  snapshot: Snapshot
  onCerrar: () => void
  onRevisar: (req: CreateRequest) => void
  /** Solo para comandos: el otro camino, componerlo en el lienzo de flujos. */
  onFlujo?: () => void
}) => {
  const t = useT()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [body, setBody] = useState('')
  const idNombre = useId()
  const idAyuda = useId()
  const error = validarNombre(name, existentes(snapshot, kind))
  const valido = error === null && description.trim() !== ''
  const sucio = name !== '' || description !== '' || body !== ''
  return (
    <DialogoEdicion
      titulo={t(`create.title.${kind}`)}
      sucio={sucio}
      puede={valido}
      onCerrar={onCerrar}
      onRevisar={() =>
        onRevisar({
          kind,
          name,
          description: description.trim(),
          ...(body.trim() ? { body } : {}),
        })
      }
      claseModal="edicion"
    >
      {kind === 'command' && onFlujo && (
        <p className="nota-dialogo">
          {t('create.command.flowHint')}{' '}
          <button type="button" className="enlace" onClick={onFlujo}>
            {t('create.command.flowLink')}
          </button>
        </p>
      )}
      <div className="campo-texto">
        <label htmlFor={idNombre}>{t('create.name')}</label>
        <input
          id={idNombre}
          value={name}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={name !== '' && error !== null}
          aria-describedby={idAyuda}
          placeholder={t(`create.name.placeholder.${kind}`)}
          onChange={(e) => setName(e.target.value)}
        />
        <p
          id={idAyuda}
          className={name !== '' && error ? 'nota-dialogo error-campo' : 'nota-dialogo'}
          role={name !== '' && error ? 'alert' : undefined}
        >
          {t(name !== '' && error ? MENSAJE[error] : 'create.name.rule')}
        </p>
      </div>
      <div className="campo-texto">
        <label htmlFor={`${idNombre}-d`}>{t('create.description')}</label>
        <textarea
          id={`${idNombre}-d`}
          className="texto-parrafo"
          value={description}
          placeholder={t(`create.description.placeholder.${kind}`)}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="campo-texto">
        <label htmlFor={`${idNombre}-b`}>{t(`create.body.${kind}`)}</label>
        <textarea
          id={`${idNombre}-b`}
          className="texto-mono corto"
          value={body}
          spellCheck={false}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
    </DialogoEdicion>
  )
}
