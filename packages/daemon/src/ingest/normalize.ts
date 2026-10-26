import type { EventActor, OfficeEvent, OfficeEventType } from '@ai-office/core'
import { OFFICE_EVENT_VERSION } from '@ai-office/core'

/**
 * Convierte el payload crudo que manda `ai-office-hook.mjs` (ya recortado por el relay) en un
 * `OfficeEvent` del contrato. El `seq` lo asigna el bus al publicar, no aquí: normalizar es una
 * operación sin estado.
 *
 * Nunca lanza. Un payload de un hook de una versión de Claude Code que aún no conocemos, o con un
 * campo del tipo equivocado, es la norma y no la excepción: se descarta con `null`, no se rompe el
 * arranque del daemon.
 */
export type NormalizedEvent = Omit<OfficeEvent, 'seq'>

const HOOK_TO_TYPE: Record<string, OfficeEventType> = {
  SessionStart: 'session.start',
  SessionEnd: 'session.end',
  UserPromptSubmit: 'turn.start',
  Stop: 'turn.end',
  StopFailure: 'turn.end',
  // PreToolUse se resuelve aparte: puede ser tool.start o skill.invoked.
  PostToolUse: 'tool.end',
  PostToolUseFailure: 'tool.failed',
  SubagentStart: 'agent.start',
  SubagentStop: 'agent.stop',
  PermissionRequest: 'permission.requested',
  PermissionDenied: 'permission.denied',
  TaskCreated: 'task.created',
  TaskCompleted: 'task.completed',
  PreCompact: 'compact.start',
  PostCompact: 'compact.end',
  Notification: 'notify',
  ConfigChange: 'config.changed',
  FileChanged: 'config.changed',
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

/**
 * El relay ya recortó `tool_input`/`tool_output` a `{preview, bytes, ...excepciones}`, pero
 * normalizar debe funcionar igual si alguien lo llama con el objeto sin recortar (así lo hacen los
 * tests, y así podría hacerlo el spool si alguna vez guarda el payload crudo): solo se leen los
 * campos que hacen falta, nunca se asume la forma completa.
 */
const detailFrom = (toolInput: Record<string, unknown> | null): string | undefined => {
  if (!toolInput) return undefined
  const command = str(toolInput.command)
  if (command) return command
  const filePath = str(toolInput.file_path)
  if (filePath) return filePath
  const description = str(toolInput.description)
  if (description) return description
  const preview = str(toolInput.preview)
  if (preview) return preview.slice(0, 160)
  return undefined
}

const actorFrom = (raw: Record<string, unknown>): EventActor => {
  const agentId = str(raw.agent_id)
  const agentType = str(raw.agent_type)
  if (agentId || agentType) return { kind: 'agent', agentId, agentType }
  return { kind: 'main' }
}

export const normalizeHookEvent = (raw: unknown): NormalizedEvent | null => {
  const rec = asRecord(raw)
  if (!rec) return null

  const sessionId = str(rec.session_id)
  if (!sessionId) return null // sin sesión no hay a quién atribuirle el evento

  const hookName = str(rec.hook_event_name)
  if (!hookName) return null

  const toolName = str(rec.tool_name)
  const toolInput = asRecord(rec.tool_input)

  let type: OfficeEventType | undefined
  let skill: string | undefined

  if (hookName === 'PreToolUse') {
    if (toolName === 'Skill') {
      type = 'skill.invoked'
      skill = str(toolInput?.skill)
    } else {
      type = 'tool.start'
    }
  } else {
    type = HOOK_TO_TYPE[hookName]
  }
  if (!type) return null

  const base: NormalizedEvent = {
    v: OFFICE_EVENT_VERSION,
    type,
    ts: num(rec.ts) ?? Date.now(),
    sessionId,
    cwd: str(rec.cwd) ?? null,
    actor: actorFrom(rec),
  }

  if (type === 'tool.start' || type === 'tool.end' || type === 'tool.failed') {
    if (toolName) base.tool = toolName
  }
  if (skill) base.skill = skill
  const toolUseId = str(rec.tool_use_id)
  if (toolUseId) base.toolUseId = toolUseId

  if (type === 'permission.requested' || type === 'permission.denied') {
    const mode = str(rec.permission_mode)
    if (mode) base.detail = mode
  } else {
    const detail = detailFrom(toolInput)
    if (detail) base.detail = detail
  }

  return base
}
