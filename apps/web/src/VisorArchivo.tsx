import { useEffect, useRef } from 'react'
import { cuerpoDe, lineaDeInicio } from './campos.ts'
import { useT } from './i18n/react.ts'
import { shortPath } from './texto.ts'
import type { Agent, Command, Skill } from './types.ts'

/**
 * Visor de solo lectura del archivo de una entidad, con los números de línea REALES del archivo.
 * El snapshot trae el cuerpo y la línea en que empieza (`bodyStartLine`), no el frontmatter: las
 * líneas anteriores se muestran como una fila plegada que dice cuántas son, en vez de inventar un
 * texto que no se leyó. La línea pedida (una evidencia `archivo:línea`) sale resaltada y centrada.
 */
export const VisorArchivo = ({
  entidad,
  linea,
  disparo,
  onCerrar,
}: {
  entidad: Agent | Skill | Command
  /** Línea del archivo a resaltar. */
  linea?: number
  /** Cambia en cada petición: pulsar dos veces la misma cita vuelve a centrarla. */
  disparo: number
  onCerrar: () => void
}) => {
  const t = useT()
  const cuerpo = cuerpoDe(entidad)
  const inicio = lineaDeInicio(entidad) ?? 1
  const dianaRef = useRef<HTMLSpanElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `disparo` solo sirve para volver a centrar
  useEffect(() => {
    dianaRef.current?.scrollIntoView({ block: 'center' })
  }, [linea, disparo])

  const lineas = cuerpo === undefined ? [] : cuerpo.split('\n')
  return (
    <section className="visor" aria-label={t('viewer.aria', { name: entidad.name })}>
      <div className="visor-cabecera">
        <code title={entidad.source.realPath}>{shortPath(entidad.source.realPath)}</code>
        <button type="button" className="chip" onClick={onCerrar}>
          {t('viewer.close')}
        </button>
      </div>
      {cuerpo === undefined ? (
        <p className="nota">{t('viewer.unavailable')}</p>
      ) : (
        <pre className="visor-texto">
          {inicio > 1 && (
            <span className="linea plegada">
              {t('viewer.frontmatter', { from: 1, to: inicio - 1 })}
            </span>
          )}
          {lineas.map((texto, i) => {
            const n = inicio + i
            const diana = n === linea
            return (
              // El número de línea del archivo ES la identidad: las líneas no se reordenan.
              <span
                key={n}
                className={diana ? 'linea diana' : 'linea'}
                data-n={n}
                ref={diana ? dianaRef : undefined}
              >
                {texto}
                {'\n'}
              </span>
            )
          })}
        </pre>
      )}
    </section>
  )
}
