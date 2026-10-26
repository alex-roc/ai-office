/**
 * Arquetipos: qué tipo de trabajo hace un agente, inferido de su `description`.
 *
 * No hay campo "arquetipo" en el frontmatter — se adivina por palabras clave, igual que un
 * visitante de la oficina adivinaría el oficio de alguien por lo que tiene sobre la mesa. Es
 * heurística y puede fallar; por eso siempre cae en `generico` en vez de reventar.
 */

export type Archetype =
  | 'jurista'
  | 'contable'
  | 'investigador'
  | 'auditor'
  | 'docente'
  | 'ingeniero'
  | 'estratega'
  | 'redactor'
  | 'analista'
  | 'gestor'
  | 'generico'

/** Qué accesorio se dibuja sobre la mesa para cada arquetipo. Es la única fuente de verdad
 * de ese mapeo: sprites.ts la consulta, no la duplica. */
export const ACCESSORY_OF: Record<Archetype, string> = {
  jurista: 'carpeta',
  contable: 'calculadora',
  investigador: 'libro',
  auditor: 'portapapeles',
  docente: 'puntero',
  ingeniero: 'llave',
  estratega: 'mapa',
  redactor: 'pluma',
  analista: 'grafico',
  gestor: 'maletin',
  generico: 'ninguno',
}

/**
 * Reglas en orden: la primera que coincide gana. El orden importa porque en descripciones
 * reales (no de laboratorio) las palabras clave de un oficio aparecen como de paso en la de
 * otro — "revisión" (auditor) es substring de "revisiones de literatura" (investigador), y
 * "curso" (docente) aparece en "descripciones de cursos" dentro de la ficha de un redactor. Se
 * ordena lo más específico primero para que esos préstamos de vocabulario no se lo coman:
 * `investigador` antes que `auditor`, `ingeniero` y `redactor` antes que `docente`/`estratega`.
 */
const RULES: Array<{ archetype: Archetype; terms: string[] }> = [
  { archetype: 'jurista', terms: ['legal', 'ley', 'contrato', 'normativa', 'derecho'] },
  { archetype: 'contable', terms: ['impuesto', 'tributari', 'contab', 'factur', 'finanz'] },
  {
    archetype: 'investigador',
    terms: ['investigac', 'académic', 'paper', 'literatura', 'research'],
  },
  { archetype: 'auditor', terms: ['auditor', 'revisión', 'control', 'compliance'] },
  { archetype: 'ingeniero', terms: ['código', 'implementa', 'deploy', 'build', 'refactor'] },
  { archetype: 'redactor', terms: ['redacta', 'contenido', 'copy', 'artículo', 'newsletter'] },
  { archetype: 'docente', terms: ['curso', 'enseñ', 'sílabo', 'formación', 'teaching'] },
  { archetype: 'estratega', terms: ['estrategia', 'política', 'campaña', 'posicionamiento'] },
  { archetype: 'analista', terms: ['datos', 'censo', 'encuesta', 'estadístic', 'análisis'] },
  { archetype: 'gestor', terms: ['gestión', 'propuesta', 'consultoría', 'cliente', 'presupuesto'] },
]

/** Normaliza para comparar sin acentos ni mayúsculas: así el término de la regla ("política")
 * y el texto de entrada ("Política" o "politica", según cómo se haya escrito) coinciden igual. */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

// Las propias reglas se normalizan una sola vez al cargar el módulo, no en cada llamada.
const NORMALIZED_RULES = RULES.map((r) => ({
  archetype: r.archetype,
  terms: r.terms.map(normalize),
}))

/**
 * Infiere el arquetipo de un agente. `name` se pasa por si el día de mañana hace falta
 * desambiguar por el id (p.ej. un sufijo de país o de equipo), aunque hoy solo se usa `description`.
 */
export const archetypeOf = (description: string, _name: string): Archetype => {
  const text = normalize(description)
  for (const rule of NORMALIZED_RULES) {
    if (rule.terms.some((term) => text.includes(term))) return rule.archetype
  }
  return 'generico'
}
