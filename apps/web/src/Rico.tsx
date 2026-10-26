import type { ReactNode } from 'react'

/**
 * Los textos traducidos llevan un marcado mínimo: `código` entre acentos graves y **negrita** entre
 * dobles asteriscos. Mostrarlos tal cual dejaría los símbolos a la vista; aquí se convierten en
 * <code> y <b>.
 */
const MARCAS = /(\*\*[^*]+\*\*|`[^`]+`)/

export const conCodigo = (texto: string): ReactNode[] =>
  texto
    .split(MARCAS)
    // El número de trozo es la identidad de un fragmento de texto fijo: nunca se reordena.
    .map((trozo, n) => ({ n, trozo }))
    .map(({ n, trozo }) => {
      if (trozo.length > 1 && trozo.startsWith('`') && trozo.endsWith('`')) {
        return <code key={n}>{trozo.slice(1, -1)}</code>
      }
      if (trozo.length > 4 && trozo.startsWith('**') && trozo.endsWith('**')) {
        return <b key={n}>{trozo.slice(2, -2)}</b>
      }
      return trozo
    })
