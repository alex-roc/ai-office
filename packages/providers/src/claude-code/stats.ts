import { readFile } from 'node:fs/promises'
import type { Catalog } from '@ai-office/core'
import { paths } from './paths.ts'
import type { EntityActivity } from './proven.ts'

/**
 * Cifras derivadas del catálogo y la actividad que comparten el snapshot del daemon y el censo
 * de la CLI. Viven aquí y no en cada uno para que las dos superficies no puedan discrepar.
 */

export interface SkillStats {
  /** Skills que el modelo puede elegir por su cuenta (no jubiladas). */
  skillsLive: number
  /** Jubiladas con `disable-model-invocation: true`: su description no se carga en cada sesión. */
  skillsRetired: number
  skillsActive: number
  skillsUnused: number
  /** Activas / vivas. Las jubiladas salen del denominador: jubilar lo que no usas SÍ sube el ratio. */
  activeRatio: number
  descriptionTokens: number
  deadDescriptionTokens: number
}

export const skillStats = (catalog: Catalog, activity: Map<string, EntityActivity>): SkillStats => {
  const live = catalog.skills.filter((s) => !s.disabledForModel)
  const unused = live.filter((s) => !activity.get(s.id)?.uses)
  const active = live.filter((s) => activity.get(s.id)?.active).length
  return {
    skillsLive: live.length,
    skillsRetired: catalog.skills.length - live.length,
    skillsActive: active,
    skillsUnused: unused.length,
    activeRatio: live.length ? active / live.length : 0,
    descriptionTokens: live.reduce((a, s) => a + s.descriptionTokens, 0),
    deadDescriptionTokens: unused.reduce((a, s) => a + s.descriptionTokens, 0),
  }
}

/**
 * Días que Claude Code conserva los transcripts (`cleanupPeriodDays` de settings.json; 30 por
 * defecto). Es la ventana real del historial: "nunca" solo significa "no en estos días".
 * `null` si el valor no es un número de días válido (p. ej. 0, que desactiva la persistencia).
 */
export const parseHistoryWindowDays = (settingsText: string | null): number | null => {
  const DEFAULT_DAYS = 30
  if (settingsText === null) return DEFAULT_DAYS
  try {
    const value = (JSON.parse(settingsText) as { cleanupPeriodDays?: unknown }).cleanupPeriodDays
    if (value === undefined) return DEFAULT_DAYS
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : null
  } catch {
    return DEFAULT_DAYS
  }
}

export const readHistoryWindowDays = async (): Promise<number | null> =>
  parseHistoryWindowDays(await readFile(paths().settings, 'utf8').catch(() => null))
