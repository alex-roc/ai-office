import { readFile, stat } from 'node:fs/promises'
import type { Agent, Catalog, Skill } from '@ai-office/core'
import {
  AGENT_COLORS,
  type AgentColor,
  applyArchiveAgent,
  applyRetireSkill,
  applySetAgentColor,
  applySetAgentModel,
  applySetAgentPreloadedSkills,
  applySetAgentSkillMentions,
  applySetAgentTools,
  applySetSkillDescription,
  applyUnretireSkill,
  etagOf,
  type MutationPlan,
  planArchiveAgent,
  planRetireSkill,
  planSetAgentColor,
  planSetAgentModel,
  planSetAgentPreloadedSkills,
  planSetAgentSkillMentions,
  planSetAgentTools,
  planSetSkillDescription,
  planUnretireSkill,
} from '@ai-office/providers'

/**
 * Traduce las peticiones de la interfaz a operaciones de escritura concretas.
 *
 * Todo pasa por aquí en dos tiempos —planear y aplicar— y el `etag` viaja entre ambos: si el
 * archivo cambió en disco mientras el usuario miraba el diff, la escritura se rechaza en vez de
 * pisar el cambio.
 */

export type MutationKind =
  | 'agent.color'
  | 'agent.model'
  | 'agent.tools'
  | 'agent.preloadedSkills'
  | 'agent.skillMentions'
  | 'skill.description'
  | 'skill.retire'
  | 'skill.unretire'
  | 'agent.archive'

export interface MutationRequest {
  kind: MutationKind
  entityId: string
  value?: unknown
}

export interface PlanResponse extends Omit<MutationPlan, 'before' | 'after'> {
  etag: string
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []

const findEntity = (
  catalog: Catalog,
  id: string,
): { entity: Agent | Skill; kind: 'agent' | 'skill' } => {
  const agent = catalog.agents.find((a) => a.id === id)
  if (agent) return { entity: agent, kind: 'agent' }
  const skill = catalog.skills.find((s) => s.id === id)
  if (skill) return { entity: skill, kind: 'skill' }
  throw new Error(`no existe la entidad ${id}`)
}

/**
 * Una skill puede ser un symlink a un repositorio de proyecto. La escritura va al destino real,
 * así que hay que autorizar explícitamente esa raíz: el daemon la conoce, la capa de mutaciones no.
 */
const extraRootsFor = (entity: Agent | Skill): string[] =>
  entity.source.symlink ? [entity.source.realPath] : []

const readCurrent = async (path: string): Promise<{ text: string; etag: string }> => {
  const [text, st] = await Promise.all([readFile(path, 'utf8'), stat(path)])
  return { text, etag: etagOf(text, st.mtimeMs, st.size) }
}

export const planMutation = async (
  catalog: Catalog,
  req: MutationRequest,
): Promise<PlanResponse> => {
  const { entity } = findEntity(catalog, req.entityId)
  const path = entity.source.realPath
  const { text, etag } = await readCurrent(path)

  const plan = ((): MutationPlan => {
    switch (req.kind) {
      case 'agent.color': {
        const color = req.value === null ? null : String(req.value)
        if (color !== null && !AGENT_COLORS.includes(color as AgentColor)) {
          throw new Error(`color no válido: ${color}`)
        }
        return planSetAgentColor(path, text, color as AgentColor | null)
      }
      case 'agent.model':
        return planSetAgentModel(path, text, req.value === null ? null : String(req.value))
      case 'agent.tools':
        return planSetAgentTools(path, text, req.value === null ? null : asStringArray(req.value))
      case 'agent.preloadedSkills':
        return planSetAgentPreloadedSkills(
          path,
          text,
          asStringArray(req.value),
          catalog.skills.map((s) => ({ name: s.name, body: s.body })),
        )
      case 'agent.skillMentions':
        return planSetAgentSkillMentions(path, text, asStringArray(req.value))
      case 'skill.description':
        return planSetSkillDescription(path, text, String(req.value ?? ''))
      case 'skill.retire':
        return planRetireSkill(path, text)
      case 'skill.unretire':
        return planUnretireSkill(path, text)
      case 'agent.archive':
        return planArchiveAgent(path, text)
      default:
        throw new Error(`operación desconocida: ${String(req.kind)}`)
    }
  })()

  const { before: _before, after: _after, ...rest } = plan
  return { ...rest, etag }
}

export const applyMutation = async (
  catalog: Catalog,
  req: MutationRequest & { etag: string },
): Promise<{ path: string; etag: string; backup: string }> => {
  const { entity } = findEntity(catalog, req.entityId)
  const visiblePath = entity.source.path
  const opts = { extraAllowedRoots: extraRootsFor(entity) }
  const name = entity.name

  switch (req.kind) {
    case 'agent.color':
      return applySetAgentColor(
        name,
        visiblePath,
        req.value === null ? null : (String(req.value) as AgentColor),
        req.etag,
        opts,
      )
    case 'agent.model':
      return applySetAgentModel(
        name,
        visiblePath,
        req.value === null ? null : String(req.value),
        req.etag,
        opts,
      )
    case 'agent.tools':
      return applySetAgentTools(
        name,
        visiblePath,
        req.value === null ? null : asStringArray(req.value),
        req.etag,
        opts,
      )
    case 'agent.preloadedSkills':
      return applySetAgentPreloadedSkills(
        name,
        visiblePath,
        asStringArray(req.value),
        catalog.skills.map((s) => ({ name: s.name, body: s.body })),
        req.etag,
        opts,
      )
    case 'agent.skillMentions':
      return applySetAgentSkillMentions(name, visiblePath, asStringArray(req.value), req.etag, opts)
    case 'skill.description':
      return applySetSkillDescription(name, visiblePath, String(req.value ?? ''), req.etag, opts)
    case 'skill.retire':
      return applyRetireSkill(name, visiblePath, req.etag, opts)
    case 'skill.unretire':
      return applyUnretireSkill(name, visiblePath, req.etag, opts)
    case 'agent.archive':
      return applyArchiveAgent(name, visiblePath, req.etag, opts)
    default:
      throw new Error(`operación desconocida: ${String(req.kind)}`)
  }
}
