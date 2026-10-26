/**
 * Números tal y como los escribe quien usa la herramienta: es-ES con separador de miles también
 * en las cifras de cuatro dígitos (`toLocaleString('es')` deja `1234` sin punto, y entonces
 * `1234` y `12.345` conviven en la misma pantalla).
 */
const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always' })

export const formatNumber = (n: number): string => nf.format(n)
