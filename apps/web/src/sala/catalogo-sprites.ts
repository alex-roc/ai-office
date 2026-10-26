import type { Archetype } from './archetypes.ts'

/**
 * Qué sprites existen y a quién le toca cada uno. Es un módulo PURO a propósito: `atlas.ts`
 * importa Pixi para cargar las texturas, y si el layout dependiera de él no se podría probar
 * nada de la geometría de la sala sin levantar un canvas. Los nombres son datos; cargarlos es
 * otra cosa.
 *
 * La procedencia de los PNG está en `assets/README.md`.
 */

export const PERSONAS = [
  'investigador',
  'analista',
  'jurista',
  'contable',
  'auditor',
  'redactor',
  'ingeniero',
  'gestor',
] as const

export const MUEBLES = [
  'escritorio',
  'silla',
  'archivador',
  'estanteria-alta',
  'estanteria-baja',
  'planta',
  'dispensador',
  'corcho',
  'lampara',
  'bandejas',
  'mesa-redonda',
  'taburete',
] as const

export type Persona = (typeof PERSONAS)[number]
export type Mueble = (typeof MUEBLES)[number]
export type NombreSprite = Persona | Mueble

/**
 * Qué figura le toca a cada arquetipo. Hay once arquetipos y ocho figuras, así que algunas se
 * repiten: es preferible que dos agentes compartan cara —el rótulo los distingue— a inventar
 * una correspondencia falsa, y desde luego a que un agente vuelva a salir como un rectángulo.
 */
export const FIGURA_DE: Record<Archetype, Persona> = {
  investigador: 'investigador',
  analista: 'analista',
  jurista: 'jurista',
  contable: 'contable',
  auditor: 'auditor',
  redactor: 'redactor',
  ingeniero: 'ingeniero',
  gestor: 'gestor',
  docente: 'investigador',
  estratega: 'gestor',
  generico: 'gestor',
}
