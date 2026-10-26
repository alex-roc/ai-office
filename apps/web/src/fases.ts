/**
 * Fases de un flujo, como lógica pura.
 *
 * Los pasos con el mismo número de `phase` se lanzan a la vez ("en paralelo"); `compileFlow`
 * agrupa por ese número y ordena por él. Así que lo que el usuario ve como "bloque de pasos a la
 * vez" es siempre una RACHA contigua de pasos con la misma fase, y toda operación aquí trabaja
 * con bloques y renumera al final: nunca se queda un hueco (1, 3, 4) ni dos bloques distintos
 * compartiendo número por accidente (que el compilador fundiría en uno solo).
 */

export interface ConFase {
  phase?: number
}

/**
 * Reparte los pasos en bloques, en el orden en que el compilador los emitiría: por número de
 * fase y, dentro de una fase, por orden de aparición. Sin `phase`, el paso cuenta como `i + 1`,
 * igual que en `compileFlow`.
 */
export const bloques = <T extends ConFase>(steps: readonly T[]): T[][] => {
  const porFase = new Map<number, T[]>()
  steps.forEach((s, i) => {
    const fase = s.phase ?? i + 1
    const lista = porFase.get(fase) ?? []
    lista.push(s)
    porFase.set(fase, lista)
  })
  return [...porFase.entries()].sort((a, b) => a[0] - b[0]).map(([, lista]) => lista)
}

/** Aplana los bloques numerándolos 1..n. */
const aplanar = <T extends ConFase>(bs: T[][]): T[] =>
  bs.flatMap((b, k) => b.map((s) => ({ ...s, phase: k + 1 })))

/** Renumera las fases a 1..n conservando los grupos "a la vez". */
export const normalizarFases = <T extends ConFase>(steps: readonly T[]): T[] =>
  aplanar(bloques(steps))

/** Posición (bloque y lugar dentro de él) de un paso, contando en el orden de `bloques`. */
const localizar = <T extends ConFase>(bs: T[][], indice: number): { b: number; k: number } => {
  let resto = indice
  for (let b = 0; b < bs.length; b++) {
    const n = bs[b]?.length ?? 0
    if (resto < n) return { b, k: resto }
    resto -= n
  }
  return { b: -1, k: -1 }
}

/**
 * Mueve un paso una posición hacia arriba (`-1`) o abajo (`+1`) SIN deshacer los "a la vez".
 *
 * - Dentro de un grupo, intercambia con su vecino: el grupo sigue siendo el mismo.
 * - En el borde de un grupo, hacia fuera, primero lo SACA del grupo sin cambiar el orden. Saltar
 *   a otra fase de golpe fundiría o partiría grupos sin que se note.
 * - Un paso que ya va solo salta el bloque entero vecino.
 *
 * `indice` es la posición en la lista tal como la ve el usuario (ya normalizada).
 */
export const moverPaso = <T extends ConFase>(
  steps: readonly T[],
  indice: number,
  delta: -1 | 1,
): T[] => {
  const bs = bloques(steps)
  const { b, k } = localizar(bs, indice)
  const bloque = bs[b]
  if (!bloque) return aplanar(bs)
  const paso = bloque[k]
  if (!paso) return aplanar(bs)

  if (bloque.length > 1) {
    const vecino = k + delta
    if (vecino >= 0 && vecino < bloque.length) {
      const copia = [...bloque]
      ;[copia[k], copia[vecino]] = [copia[vecino] as T, copia[k] as T]
      bs[b] = copia
      return aplanar(bs)
    }
    // Borde del grupo, hacia fuera: queda solo, pegado al grupo y en su misma posición.
    const resto = bloque.filter((_, j) => j !== k)
    bs.splice(b, 1, ...(delta > 0 ? [resto, [paso]] : [[paso], resto]))
    return aplanar(bs)
  }

  const destino = b + delta
  if (destino < 0 || destino >= bs.length) return aplanar(bs)
  const otro = bs[destino] as T[]
  bs[destino] = bloque
  bs[b] = otro
  return aplanar(bs)
}

/** ¿El paso `i` va a la vez que el anterior? */
export const vaConAnterior = (steps: readonly ConFase[], i: number): boolean =>
  i > 0 && steps[i]?.phase !== undefined && steps[i]?.phase === steps[i - 1]?.phase

/**
 * Une el paso `i` con el anterior: pasan a ejecutarse a la vez. Solo se mueve ese paso; si
 * encabezaba un grupo, los demás se quedan como estaban, ahora en su propia fase.
 */
export const unirConAnterior = <T extends ConFase>(steps: readonly T[], i: number): T[] => {
  const previo = steps[i - 1]
  if (i <= 0 || !previo) return normalizarFases(steps)
  const fase = previo.phase ?? i
  // Los que seguían en el grupo del paso tomaban su número; se les da uno intermedio para que
  // no se fundan con el bloque al que acaba de unirse el paso.
  const mia = steps[i]?.phase
  const copia = steps.map((s, j) => {
    if (j === i) return { ...s, phase: fase }
    if (j > i && s.phase === mia) return { ...s, phase: fase + 0.5 }
    return s
  })
  return normalizarFases(copia)
}

/**
 * Separa el paso `i` de los anteriores de su grupo: empieza una fase nueva en él. Los que le
 * seguían en el grupo siguen yendo a la vez que él.
 */
export const separarDelGrupo = <T extends ConFase>(steps: readonly T[], i: number): T[] => {
  const base = normalizarFases(steps)
  if (!vaConAnterior(base, i)) return base
  const fase = base[i]?.phase ?? i
  // Medio punto por debajo: la fase de `i` y la de sus seguidores pasa a ser distinta de la de
  // los anteriores, y la renumeración la deja como un número entero.
  return normalizarFases(
    base.map((s, j) => (j >= i && s.phase === fase ? { ...s, phase: fase + 0.5 } : s)),
  )
}

/** Cuántos pasos hay por fase, para etiquetar "fase 2 · 3 a la vez". */
export const tamanoDeGrupo = (steps: readonly ConFase[], i: number): number => {
  const fase = steps[i]?.phase
  return fase === undefined ? 1 : steps.filter((s) => s.phase === fase).length
}
