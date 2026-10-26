/**
 * Paleta de la Sala: 28 tonos, la misma que se le pidió al generador de sprites.
 *
 * Que el arte procedural (suelo, paredes, lomos) y el arte generado (personas, muebles) salgan
 * de la MISMA lista es lo único que impide que la sala parezca un collage. Si un color no está
 * aquí, no se dibuja.
 *
 * Nada de negro puro ni blanco puro: en pixel art ambos rompen la unidad de la escena. El más
 * oscuro es un marrón tinta y el más claro un crema de papel.
 */

export const P = {
  // Maderas
  robleClaro: 0xd6a870,
  roble: 0xb98a5e,
  robleMedio: 0x9a6f47,
  nogal: 0x7a5334,
  nogalOscuro: 0x5b3d26,

  // Papel y yeso
  papel: 0xf3ead9,
  papelSombra: 0xded0b8,
  yeso: 0xe8dcc6,
  yesoSombra: 0xcfbfa4,
  yesoOscuro: 0xb3a189,

  // Acentos
  terracota: 0xc0563a,
  terracotaOscura: 0x8f3c27,
  salvia: 0x7c9a6b,
  salviaOscura: 0x55704a,
  pizarra: 0x5f7184,
  pizarraOscura: 0x42505e,
  mostaza: 0xc9a04a,
  mostazaOscura: 0x96742f,
  ciruela: 0x7b5ea7,
  cian: 0x3f8c96,
  rosa: 0xba6087,

  // Tinta y grises
  tinta: 0x2f2823,
  tintaSuave: 0x4a4038,
  grisPiedra: 0x8a8377,
  grisClaro: 0xa9a094,
  grisApagado: 0x9a9287,

  // Luz
  luz: 0xfff4dc,
  sombra: 0x3a3128,
} as const

/**
 * Los ocho valores válidos de `color:` en el frontmatter de un agente, traducidos a la paleta.
 * El orden es el de Claude Code (red, blue, green, yellow, purple, orange, pink, cyan): el
 * índice que guarda el layout indexa aquí directamente.
 */
export const COLOR_AGENTE = [
  P.terracota,
  P.pizarra,
  P.salvia,
  P.mostaza,
  P.ciruela,
  0xc77a35,
  P.rosa,
  P.cian,
] as const

/** Versión oscura de cada color de agente, para la cara en sombra de los volúmenes. */
export const COLOR_AGENTE_OSCURO = [
  P.terracotaOscura,
  P.pizarraOscura,
  P.salviaOscura,
  P.mostazaOscura,
  0x5a4380,
  0x94561f,
  0x8a4363,
  0x2c6870,
] as const

/** Un agente sin `color:` no está "triste": está literalmente sin colorear. */
export const SIN_COLOR = P.grisApagado
export const SIN_COLOR_OSCURO = 0x6f6961

/**
 * Los colores de la INTERFAZ (`styles.css`) que la escena necesita también, porque Pixi no lee
 * variables CSS. Son los mismos valores que `--noche`, `--madera-alta`, `--linea` y `--ambar`: si
 * se cambian allí, hay que cambiarlos aquí. `resalte` y `destello` son de la propia escena:
 * el aro de lo seleccionado y el tinte de "esto acaba de usarse".
 */
export const UI = {
  noche: 0x16120f,
  maderaAlta: 0x2f2620,
  linea: 0x42352b,
  ambar: 0xd9a05b,
  resalte: 0xffd9a0,
  destello: 0xfff0d0,
} as const
