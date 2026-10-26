import type { Ref } from 'react'

/**
 * Lo que `App` puede pedirle a la vista activa (Sala o Plano): los atajos de teclado y el
 * buscador no conocen su cámara, solo esta interfaz.
 */
export interface ControlVista {
  /** Encaja todo el contenido en el lienzo. */
  encuadrar: () => void
  /** Acerca (`1`) o aleja (`-1`) un paso. */
  zoom: (direccion: 1 | -1) => void
  /** Centra la vista en una entidad. Devuelve `false` si esa vista no la representa. */
  centrarEn: (id: string) => boolean
}

export type RefVista = Ref<ControlVista>
