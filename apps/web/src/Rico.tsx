import type { ReactNode } from 'react'

/**
 * Los mensajes de error y de ayuda se escriben con `código` entre acentos graves. Mostrarlos tal
 * cual deja los backticks a la vista como si fueran parte del texto; aquí se convierten en <code>.
 */
export const conCodigo = (texto: string): ReactNode[] =>
  texto
    .split('`')
    // El número de trozo es la identidad de un fragmento de texto fijo: nunca se reordena.
    .map((trozo, n) => ({ n, trozo, codigo: n % 2 === 1 }))
    .map(({ n, trozo, codigo }) => (codigo ? <code key={n}>{trozo}</code> : trozo))
