import { lstat } from 'node:fs/promises'
import { type Catalog, type Lang, makeId, type ScopeSelection } from '@ai-office/core'
import {
  applyCreateEntity,
  assertEntityName,
  type MutationPlan,
  type NewEntityKind,
  newEntityPath,
  OfficeError,
  planCreateEntity,
  scopeRoots,
} from '@ai-office/providers'

/**
 * Crear un agente, una skill o un comando desde cero. Es la otra mitad de editar: el plan enseña
 * el diff (de vacío a contenido) y la creación reutiliza `applyCreateFile`, así que conserva
 * `wx`, raíces permitidas y auditoría.
 */

export interface CreateEntityRequest {
  kind: NewEntityKind
  name: string
  description: string
  body?: string
  lang?: Lang
  /** Dónde nace: `user` (por defecto) o `project` (el del ámbito activo; sin él, `needs-project`). */
  scope?: 'user' | 'project'
}

export type CreatePlanResponse = Omit<MutationPlan, 'before' | 'after'>

const KINDS: readonly string[] = ['agent', 'skill', 'command']

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
}

const normalize = (req: CreateEntityRequest): CreateEntityRequest => {
  if (req?.scope !== undefined && req.scope !== 'user' && req.scope !== 'project') {
    throw new OfficeError('invalid-scope', 'scope must be "user" or "project"', {
      params: { scope: String(req.scope) },
    })
  }
  if (!req || !KINDS.includes(req.kind)) {
    throw new OfficeError('unknown-operation', `unknown entity kind: ${String(req?.kind)}`, {
      params: { kind: String(req?.kind) },
    })
  }
  if (req.body !== undefined && typeof req.body !== 'string') {
    throw new OfficeError('invalid-body', 'the body must be text')
  }
  return {
    ...req,
    name: assertEntityName(req.name),
    lang: req.lang === 'es' ? 'es' : 'en',
    scope: req.scope === 'project' ? 'project' : 'user',
  }
}

/** El ámbito concreto de la creación: `project` solo existe si el daemon tiene un proyecto abierto. */
const selectionFor = (req: CreateEntityRequest, active: ScopeSelection): ScopeSelection => {
  if (req.scope !== 'project') return { kind: 'user' }
  if (active.kind !== 'project') {
    throw new OfficeError(
      'needs-project',
      'there is no project open: pick one to create things in it',
    )
  }
  return active
}

/**
 * Un nombre tomado es un error ANTES de escribir: ni el archivo en su sitio, ni un agente
 * archivado con ese nombre (restaurarlo después chocaría con el nuevo).
 */
const assertFreeName = async (
  catalog: Catalog,
  req: CreateEntityRequest,
  selection: ScopeSelection,
): Promise<void> => {
  const path = newEntityPath(req.kind, req.name, selection)
  const taken =
    (await exists(path)) ||
    (req.kind === 'agent' &&
      catalog.agents.some((a) => a.name === req.name && a.scope === selection.kind))
  if (taken) {
    throw new OfficeError(
      'file-exists',
      `a ${req.kind} named "${req.name}" already exists (${path}): edit it instead of creating it`,
      { params: { path, name: req.name } },
    )
  }
}

export const planCreate = async (
  catalog: Catalog,
  raw: CreateEntityRequest,
  active: ScopeSelection = { kind: 'user' },
): Promise<CreatePlanResponse> => {
  const req = normalize(raw)
  const selection = selectionFor(req, active)
  await assertFreeName(catalog, req, selection)
  const { before: _b, after: _a, ...rest } = planCreateEntity({ ...req, scope: selection })
  return rest
}

export const applyCreate = async (
  catalog: Catalog,
  raw: CreateEntityRequest,
  active: ScopeSelection = { kind: 'user' },
): Promise<{ path: string; etag: string; id: string }> => {
  const req = normalize(raw)
  const selection = selectionFor(req, active)
  await assertFreeName(catalog, req, selection)
  const { path, etag } = await applyCreateEntity(
    { ...req, scope: selection },
    { extraAllowedRoots: scopeRoots(selection) },
  )
  return { path, etag, id: makeId(req.kind, 'claude-code', selection.kind, req.name) }
}
