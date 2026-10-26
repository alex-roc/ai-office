import { createHash, randomBytes } from 'node:crypto'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { paths } from './paths.ts'

/**
 * Instala y desinstala los hooks de ai-office en `~/.claude/settings.json`.
 *
 * Es el único código de todo el proyecto capaz de romperle Claude Code al usuario, así que las
 * reglas son estrictas: el merge es siempre aditivo (nunca se toca una clave ajena, nunca se
 * reordena un array existente), y la escritura es atómica con verificación de que nadie más tocó
 * el archivo mientras preparábamos el cambio.
 *
 * JSON no tiene comentarios ni comas colgantes, así que —a diferencia del frontmatter YAML de
 * `frontmatter.ts`— reserializar con `JSON.parse` + `JSON.stringify` es seguro: no hay nada que
 * "preservar" aparte del ancho de indentación y el salto de línea final, que se detectan del
 * propio archivo. Mientras el archivo original venga de una herramienta (el propio Claude Code
 * lo escribe así), instalar y desinstalar reproduce el original byte a byte.
 */

/**
 * Cadena que marca un hook como propio: es lo único que nos permite reconocerlo para desinstalar.
 * Es el nombre del ARCHIVO del relay, no un fragmento: un hook ajeno llamado
 * `mi-ai-office-hook-log.sh` no debe tomarse por nuestro.
 */
const HOOK_MARKER = 'ai-office-hook.mjs'

/** Los hooks propios siempre van con este matcher: es el mismo patrón que usa Claude Code para
 * los eventos que no son de herramienta (SessionStart, SessionEnd, etc. ya llegan así). */
const MATCHER = '*'

/**
 * Debe coincidir con las claves de `hooks/hooks.json` (el plugin): quien instala por settings.json
 * recibe los mismos eventos que quien instala el plugin. Lo comprueba `install.test.ts`.
 */
export const EVENTS_TO_INSTALL = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'Stop',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'SubagentStart',
  'SubagentStop',
  'PermissionRequest',
  'PermissionDenied',
  'TaskCreated',
  'TaskCompleted',
  'Notification',
  'PreCompact',
  'PostCompact',
] as const

export interface InstallPlan {
  /** Texto completo del `settings.json` resultante. No se escribe solo: eso lo hace `apply*`. */
  text: string
  /** Diff línea a línea, para mostrarle al usuario qué se le va a tocar antes de tocarlo. */
  diff: string
  changed: boolean
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const isOurHook = (v: unknown): boolean =>
  isRecord(v) && typeof v.command === 'string' && v.command.includes(HOOK_MARKER)

/** Comilla simple al estilo shell, por si la ruta trae espacios o comillas propias. */
const shellQuote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`

const buildHookEntry = (relayPath: string): Record<string, unknown> => ({
  type: 'command',
  command: `node ${shellQuote(relayPath)}`,
  async: true,
  timeout: 5,
  statusMessage: 'ai-office',
})

const parseSettings = (text: string): Record<string, unknown> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`settings.json ilegible: ${(err as Error).message}`)
  }
  if (!isRecord(parsed)) throw new Error('settings.json no es un objeto JSON')
  return parsed
}

/** El primer `\n<espacios>"` del archivo dice cuántos espacios usa un nivel de indentación. */
const detectIndent = (text: string): string => text.match(/\n([ \t]+)"/)?.[1] ?? '  '

const stringifySettings = (parsed: Record<string, unknown>, text: string): string => {
  const indent = detectIndent(text)
  const out = JSON.stringify(parsed, null, indent)
  return text.endsWith('\n') ? `${out}\n` : out
}

/** Diff mínimo por LCS: de sobra para un settings.json de unos cientos de líneas. */
const diffLines = (before: string, after: string): string => {
  if (before === after) return '(sin cambios: ya estaba instalado)'
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push(`- ${a[i]}`)
      i++
    } else {
      out.push(`+ ${b[j]}`)
      j++
    }
  }
  while (i < n) {
    out.push(`- ${a[i]}`)
    i++
  }
  while (j < m) {
    out.push(`+ ${b[j]}`)
    j++
  }
  return out.join('\n')
}

/**
 * Añade el hook propio al grupo de matcher `*` de un evento, o crea el grupo si no existe.
 * Idempotente: si ya hay un hook nuestro en ese evento+matcher, no hace nada.
 * Muta `hooksSection` en el sitio: es la única forma de que el orden de las claves ya existentes
 * (`matcher` antes que `hooks`, etc.) no se altere al reserializar.
 */
const installEvent = (
  hooksSection: Record<string, unknown>,
  eventName: string,
  relayPath: string,
): boolean => {
  const existing = hooksSection[eventName]
  const groups: unknown[] = Array.isArray(existing) ? existing : []
  if (groups !== existing) hooksSection[eventName] = groups
  const existingGroup = groups.find(
    (g): g is Record<string, unknown> =>
      isRecord(g) && g.matcher === MATCHER && Array.isArray(g.hooks),
  )
  if (existingGroup) {
    const hooks = existingGroup.hooks as unknown[]
    const ours = hooks.find(isOurHook) as Record<string, unknown> | undefined
    if (ours) {
      // Ya instalado. Si apunta a otra ruta (una versión anterior lo registraba en la caché de
      // npx, que se borra) se corrige en el sitio: es un hook nuestro, no una clave ajena.
      const wanted = buildHookEntry(relayPath).command
      if (ours.command === wanted) return false
      ours.command = wanted
      return true
    }
    hooks.push(buildHookEntry(relayPath))
    return true
  }
  groups.push({ matcher: MATCHER, hooks: [buildHookEntry(relayPath)] })
  return true
}

/**
 * Calcula el `settings.json` con los hooks de ai-office añadidos, sin escribir nada a disco.
 * Merge aditivo puro: por cada evento, si ya hay un grupo con matcher `*` se le hace `push` al
 * final de su array `hooks`; si no, se añade un grupo nuevo al final. Nunca reemplaza un array,
 * nunca reordena, nunca toca una clave que no sea `hooks`.
 */
export const planInstall = (settingsText: string, relayPath: string): InstallPlan => {
  const parsed = parseSettings(settingsText)
  if (!isRecord(parsed.hooks)) parsed.hooks = {}
  const hooksSection = parsed.hooks as Record<string, unknown>

  let changed = false
  for (const eventName of EVENTS_TO_INSTALL) {
    if (installEvent(hooksSection, eventName, relayPath)) changed = true
  }

  const text = stringifySettings(parsed, settingsText)
  return { text, diff: diffLines(settingsText, text), changed }
}

/**
 * Quita exactamente los hooks marcados con `ai-office-hook`, y los grupos o eventos que queden
 * vacíos tras quitarlos. Todo lo demás —incluido cualquier grupo ajeno, aunque comparta evento—
 * se deja intacto.
 */
export const planUninstall = (settingsText: string): InstallPlan => {
  const parsed = parseSettings(settingsText)
  let changed = false
  const hooksSection = parsed.hooks
  if (isRecord(hooksSection)) {
    for (const eventName of Object.keys(hooksSection)) {
      const groups = hooksSection[eventName]
      if (!Array.isArray(groups)) continue
      // Solo se limpia lo que ESTE evento perdió: un array vacío o un grupo sin hooks que puso el
      // usuario son suyos, y borrarlos sería tocar una clave ajena.
      let removedHere = false
      for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i]
        if (!isRecord(group) || !Array.isArray(group.hooks)) continue
        const hooks = group.hooks as unknown[]
        const kept = hooks.filter((h) => !isOurHook(h))
        if (kept.length === hooks.length) continue
        removedHere = true
        changed = true
        group.hooks = kept
        if (kept.length === 0) groups.splice(i, 1)
      }
      if (removedHere && groups.length === 0) delete hooksSection[eventName]
    }
    if (changed && Object.keys(hooksSection).length === 0) delete parsed.hooks
  }

  const text = stringifySettings(parsed, settingsText)
  return { text, diff: diffLines(settingsText, text), changed }
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/**
 * Escribe `newText` en `settingsPath` de forma segura: backup del original, escritura en un
 * archivo temporal del MISMO directorio y `rename` atómico, y antes de renombrar se comprueba que
 * nadie más haya tocado el archivo desde que lo leímos (comparando su sha256). Si cambió, se
 * aborta: es preferible que el usuario reintente a pisarle un cambio que hizo mientras tanto.
 *
 * Si `settings.json` es un symlink (dotfiles gestionados con stow o similares) se escribe en su
 * destino real y conservando sus permisos: renombrar sobre el enlace lo reemplazaría por un
 * archivo suelto y rompería la proyección. `originalText === null` es "el archivo no existe": se
 * crea, y se aborta si aparece otro mientras tanto.
 */
const atomicWrite = async (
  settingsPath: string,
  originalText: string | null,
  newText: string,
): Promise<void> => {
  let target = settingsPath
  try {
    target = await realpath(settingsPath)
  } catch {
    // Un enlace roto no se puede escribir "a través": se pediría reemplazarlo, y eso no es nuestro.
    if (
      await lstat(settingsPath).then(
        (st) => st.isSymbolicLink(),
        () => false,
      )
    ) {
      throw new Error(`settings.json es un enlace roto: ${settingsPath}`)
    }
  }
  await mkdir(dirname(target), { recursive: true })

  let mode: number | null = null
  if (originalText !== null) {
    mode = (await stat(target)).mode & 0o777
    const backupDir = join(paths().ours, 'backups')
    await mkdir(backupDir, { recursive: true })
    await writeFile(join(backupDir, `settings.json.${Date.now()}`), originalText, 'utf8')
  }

  const tmpPath = join(dirname(target), `.settings.json.tmp-${randomBytes(6).toString('hex')}`)
  await writeFile(tmpPath, newText, 'utf8')
  if (mode !== null) await chmod(tmpPath, mode)

  const current = await readFile(target, 'utf8').catch(() => null)
  if (
    current === null
      ? originalText !== null
      : originalText === null || sha256(current) !== sha256(originalText)
  ) {
    await rm(tmpPath, { force: true })
    throw new Error(
      'settings.json cambió mientras preparábamos la escritura: aborto para no pisar el cambio ajeno',
    )
  }
  await rename(tmpPath, target)
}

/** `null` si el archivo no existe; cualquier otro error de lectura sí es un error. */
const readSettings = async (settingsPath: string): Promise<string | null> => {
  try {
    return await readFile(settingsPath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Un `settings.json` que aún no existe se trata como `{}`: instalar lo crea. */
const EMPTY_SETTINGS = '{}\n'

export const applyInstall = async (
  settingsPath: string,
  relayPath: string,
): Promise<InstallPlan> => {
  const original = await readSettings(settingsPath)
  const plan = planInstall(original ?? EMPTY_SETTINGS, relayPath)
  if (plan.changed) await atomicWrite(settingsPath, original, plan.text)
  return plan
}

export const applyUninstall = async (settingsPath: string): Promise<InstallPlan> => {
  const original = await readSettings(settingsPath)
  if (original === null) return planUninstall(EMPTY_SETTINGS)
  const plan = planUninstall(original)
  if (plan.changed) await atomicWrite(settingsPath, original, plan.text)
  return plan
}

/**
 * Ruta ESTABLE del relay que se registra en settings.json. La del paquete no sirve: con `npx` vive
 * en una caché que se purga, y el hook quedaría apuntando a un archivo que ya no existe (Claude
 * Code lo ignora en silencio). Una copia bajo `~/.claude/ai-office/bin/` sobrevive a todo.
 */
export const stableRelayPath = (): string => join(paths().ours, 'bin', 'ai-office-hook.mjs')

/** Copia el relay a su ruta estable. Devuelve `true` si el contenido cambió (o no existía). */
export const installRelay = async (sourcePath: string): Promise<boolean> => {
  const dest = stableRelayPath()
  const wanted = await readFile(sourcePath, 'utf8')
  if ((await readFile(dest, 'utf8').catch(() => null)) === wanted) return false
  await mkdir(dirname(dest), { recursive: true })
  const tmp = `${dest}.tmp-${randomBytes(4).toString('hex')}`
  await copyFile(sourcePath, tmp)
  await chmod(tmp, 0o755)
  await rename(tmp, dest)
  return true
}

/** Retira la copia estable del relay (al desinstalar). No falla si no está. */
export const removeRelay = async (): Promise<void> => {
  await rm(stableRelayPath(), { force: true })
}
