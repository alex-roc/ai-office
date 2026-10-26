import { useT } from './i18n/react.ts'
import { trazoSpark } from './ledger.ts'

/**
 * Los usos de las últimas semanas como una línea mínima, sin librería: un `<path>` y el punto de
 * la semana en curso. El título dice los números, para quien no ve el dibujo y para el ratón. Los
 * colores van por CSS (`.spark`), no por atributos de presentación.
 */
export const Sparkline = ({
  valores,
  ancho = 84,
  alto = 22,
}: {
  /** Más antigua primero; la última es la semana en curso. */
  valores: number[]
  ancho?: number
  alto?: number
}) => {
  const t = useT()
  const { linea, ultimo } = trazoSpark(valores, ancho, alto)
  const titulo = t('spark.title', { n: valores.length, values: valores.join(', ') })
  return (
    <svg
      className="spark"
      width={ancho}
      height={alto}
      viewBox={`0 0 ${ancho} ${alto}`}
      role="img"
      aria-label={titulo}
    >
      <title>{titulo}</title>
      <path d={linea} />
      {ultimo && <circle cx={ultimo.x} cy={ultimo.y} r={2} />}
    </svg>
  )
}
