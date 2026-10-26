import { useState } from 'react'
import { Dialogo } from './Dialogo.tsx'
import type { Clave } from './i18n/index.ts'
import { useT } from './i18n/react.ts'
import { conCodigo } from './Rico.tsx'

/** Panel de ayuda (`?`): atajos de teclado y cómo leer cada vista. */

const ATAJOS: { teclas: string; que: Clave }[] = [
  { teclas: '1', que: 'help.key.office' },
  { teclas: '2', que: 'help.key.blueprint' },
  { teclas: '3', que: 'help.key.ledger' },
  { teclas: '/', que: 'help.key.search' },
  { teclas: '+  −', que: 'help.key.zoom' },
  { teclas: '0', que: 'help.key.fit' },
  { teclas: 'Esc', que: 'help.key.esc' },
  { teclas: '?', que: 'help.key.help' },
]

const LEYENDA_SALA: Clave[] = [
  'help.office.room',
  'help.office.grey',
  'help.office.spine',
  'help.office.shelves',
  'help.office.card',
]

const LEYENDA_PLANO: Clave[] = [
  'help.blueprint.lines',
  'help.blueprint.shapes',
  'help.blueprint.edit',
]

const LEYENDA_REGISTRO: Clave[] = ['help.ledger.table', 'help.ledger.filters', 'help.ledger.trend']

const LEYENDA_CONFIG: Clave[] = [
  'help.config.scope',
  'help.config.show',
  'help.config.plugins',
  'help.config.mcp',
]

const LEYENDA_EDICION: Clave[] = [
  'help.edit.fields',
  'help.edit.prompt',
  'help.edit.assign',
  'help.edit.create',
  'help.edit.view',
]

export const Ayuda = ({ onCerrar }: { onCerrar: () => void }) => {
  const t = useT()
  return (
    <Dialogo titulo={t('help.title')} onCerrar={onCerrar} claseModal="ayuda">
      <h4 className="sub-ayuda">{t('help.keys.title')}</h4>
      <dl className="atajos">
        {ATAJOS.map((a) => (
          <div key={a.teclas}>
            <dt>
              <kbd>{a.teclas}</kbd>
            </dt>
            <dd>{t(a.que)}</dd>
          </div>
        ))}
      </dl>
      <p className="nota-dialogo">{t('help.keys.note')}</p>

      <h4 className="sub-ayuda">{t('help.office.title')}</h4>
      <ul className="leyenda-lista">
        {LEYENDA_SALA.map((k) => (
          <li key={k}>{conCodigo(t(k))}</li>
        ))}
      </ul>

      <h4 className="sub-ayuda">{t('help.blueprint.title')}</h4>
      <ul className="leyenda-lista">
        {LEYENDA_PLANO.map((k) => (
          <li key={k}>{conCodigo(t(k))}</li>
        ))}
      </ul>

      <h4 className="sub-ayuda">{t('help.ledger.title')}</h4>
      <ul className="leyenda-lista">
        {LEYENDA_REGISTRO.map((k) => (
          <li key={k}>{conCodigo(t(k))}</li>
        ))}
      </ul>

      <h4 className="sub-ayuda">{t('help.config.title')}</h4>
      <ul className="leyenda-lista">
        {LEYENDA_CONFIG.map((k) => (
          <li key={k}>{conCodigo(t(k))}</li>
        ))}
      </ul>

      <h4 className="sub-ayuda">{t('help.edit.title')}</h4>
      <ul className="leyenda-lista">
        {LEYENDA_EDICION.map((k) => (
          <li key={k}>{conCodigo(t(k))}</li>
        ))}
      </ul>
      <div className="acciones">
        <button type="button" className="primario" onClick={onCerrar}>
          {t('help.ok')}
        </button>
      </div>
    </Dialogo>
  )
}

const CLAVE_BIENVENIDA = 'ai-office-bienvenida'

const yaVista = (): boolean => {
  try {
    return localStorage.getItem(CLAVE_BIENVENIDA) === '1'
  } catch {
    return false
  }
}

/** Banda de bienvenida, solo la primera vez. Descartarla se recuerda en `localStorage`. */
export const Bienvenida = ({ onAyuda }: { onAyuda: () => void }) => {
  const t = useT()
  const [visible, setVisible] = useState(() => !yaVista())
  if (!visible) return null
  const descartar = () => {
    try {
      localStorage.setItem(CLAVE_BIENVENIDA, '1')
    } catch {
      /* sin almacenamiento: se mostrará otra vez la próxima, no pasa nada */
    }
    setVisible(false)
  }
  return (
    <section className="bienvenida" aria-label={t('welcome.aria')}>
      <div>
        <h2>{t('welcome.title')}</h2>
        <ul>
          <li>{conCodigo(t('welcome.office'))}</li>
          <li>{conCodigo(t('welcome.blueprint'))}</li>
          <li>{conCodigo(t('welcome.ledger'))}</li>
          <li>{conCodigo(t('welcome.config'))}</li>
          <li>{conCodigo(t('welcome.details'))}</li>
        </ul>
      </div>
      <div className="bienvenida-acciones">
        <button type="button" onClick={onAyuda}>
          {t('welcome.shortcuts')}
        </button>
        <button type="button" className="primario" onClick={descartar}>
          {t('help.ok')}
        </button>
      </div>
    </section>
  )
}
