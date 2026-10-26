import type { Lang } from '@ai-office/core'
import { formatNumber } from '@ai-office/providers'

/**
 * Mensajes de la terminal en los dos idiomas. El inglés es el predeterminado; el español es la
 * fuente de verdad en cuanto a cobertura: `es` se declara con el tipo de `en`, así que una clave
 * que falte en cualquiera de los dos no compila (y `i18n.test.ts` lo comprueba también en
 * ejecución). Cada mensaje es una cadena o una función pura de sus datos: el formato ANSI lo pone
 * quien llama, no el catálogo.
 */

export const LANGS: readonly Lang[] = ['en', 'es']

/** Cuántos de algo, con su plural: `plural(3, 'skill')` → `3 skills`. */
const count = (lang: Lang, k: number, one: string, many: string): string =>
  `${formatNumber(k, lang)} ${k === 1 ? one : many}`

const makeEn = () => {
  const n = (x: number) => formatNumber(x, 'en')
  return {
    // --- ayuda y errores generales ---
    help: {
      tagline: 'see, edit and measure your Claude Code agents',
      start: 'open the interface in the browser (also `ai-office start`)',
      noOpen: 'print the link only, do not open the browser',
      port: 'interface port (in the plugin, the "Port" option)',
      census: 'diagnosis of what you have and what you use',
      poster: 'save the census as a shareable image',
      doctor: 'check the install: hooks, plugin, daemon and pending activity',
      hooks: 'install the activity hooks in settings.json (diff shown first) or remove them',
      yes: 'apply the change without asking again',
      dryRun: 'only show the diff',
      demo: 'the interface on a fictional install: edit anything without risk',
      demoPort: 'port (default 7379, so it can run next to the real one)',
      lang: 'interface language (en or es; in the plugin, the "Language" option)',
      version: 'show the version',
      footer:
        'Everything is read from ~/.claude (or CLAUDE_CONFIG_DIR). Nothing leaves this machine.',
    },
    unknownVersion: 'unknown',
    invalidPort: (raw: string) =>
      `the port "${raw}" is not valid: use a number between 1 and 65535`,
    invalidLang: (raw: string) => `the language "${raw}" is not supported: use en or es`,
    missingLangValue: 'the --lang flag needs a value: en or es',
    // --- start y demo ---
    start: {
      listening: (url: string) => `listening at ${url}`,
      note: 'Only 127.0.0.1. The token changes on every start. Ctrl-C to stop.',
    },
    demoHome: (home: string) => `demo installation at ${home} (deleted on exit)`,
    // --- censo ---
    census: {
      title: 'ai-office · census',
      reading: 'reading session history...',
      agents: 'agents',
      skills: 'skills',
      commands: 'custom commands',
      sinceWindow: (days: number) => `in the last ${n(days)} days`,
      sinceAll: 'in the available history',
      agentsIdle: (k: number, since: string) => `${n(k)} have not worked ${since}`,
      allActive: 'all active',
      skillsIdle: (k: number, since: string) => `${n(k)} unused ${since}`,
      allUsed: 'all used',
      retired: (k: number) => `(${n(k)} retired)`,
      commandsNone: 'none has been run',
      commandsRun: (k: number) => `${n(k)} run at least once`,
      activeRatio: 'active ratio',
      ratioLine: (active: number, live: number, retired: number) =>
        `${n(active)} of ${n(live)} skills practicing or certified${
          retired ? ` (not counting ${n(retired)} retired)` : ''
        }.`,
      ratioHint:
        "Goes up when you use what you have or retire what you won't. Never by spending more.",
      costTitle: 'cost of having everything installed',
      costDescriptions: 'descriptions in every session',
      costDead: 'from skills nobody has used',
      tokens: (k: number) => `~${n(k)} tokens`,
      graphTitle: 'the graph you wrote, and the one that exists',
      declared: 'agent→skill cited in their prompt',
      declaredTag: 'declared',
      preloaded: 'agent→skill in `skills:`',
      preloadedTag: 'preloaded',
      proven: 'agent→skill proven',
      provenTag: 'in the history',
      mainThread: '…from the main thread (you, live)',
      idleAgentsTitle: (since: string) => `agents never delegated to ${since}`,
      inheritedModel: 'inherited model',
      cites: (k: number) => `cites ${count('en', k, 'skill', 'skills')}`,
      topTitle: 'skills you do use',
      uses: (k: number) => `${n(k)} ${k === 1 ? 'use' : 'uses'}`,
      vocabTitle: 'words in your unused skills that you have never typed',
      vocabNote: (k: number) => `(against ${n(k)} of your prompts; a fact, not a forecast)`,
      posterSaved: (path: string) => `poster saved to ${path}`,
      unreadable: (k: number) => `${count('en', k, 'file', 'files')} could not be read:`,
      more: (k: number) => `… and ${n(k)} more`,
      footer: (files: number, mb: number, secs: string) =>
        `${n(files)} session files · ${n(mb)} MB · ${secs} s`,
      rel: {
        never: 'never',
        today: 'today',
        yesterday: 'yesterday',
        days: (k: number) => `${k} days ago`,
        months: (k: number) => `${k} ${k === 1 ? 'month' : 'months'} ago`,
        years: (k: number) => `${k} ${k === 1 ? 'year' : 'years'} ago`,
      },
    },
    // --- hooks y doctor ---
    hooks: {
      alreadyInstalled: 'ai-office hooks are already installed.',
      relayUpdated: (path: string) => `Relay updated at ${path}`,
      changesIn: (path: string) => `Changes to ${path}:`,
      yoursUntouched: [
        'Your existing hooks are not touched: ours are added at the end of each group',
        'and all of them are async, so they cannot block or alter a decision.',
      ],
      relayCopied: (path: string) => `The relay is copied to ${path}.`,
      dryRunDone: '(--dry-run: nothing was written)',
      toApply: (cmd: string) => `To apply it: ${cmd}`,
      backupNote: [
        'A backup is saved in ~/.claude/ai-office/backups/ and it is reversible',
        'with `ai-office hooks uninstall`.',
      ],
      installed: 'Hooks installed.',
      installedNext: 'Open a new Claude Code session to see them.',
      noneToRemove: 'There are no ai-office hooks in your settings.json.',
      removed: 'Hooks removed.',
      usage: 'usage: ai-office hooks install|uninstall [--yes] [--dry-run]',
    },
    doctor: {
      title: 'ai-office · doctor',
      claudeAt: (home: string) => `Claude Code at ${home}`,
      pluginOk: 'ai-office plugin installed',
      hooksOk: 'ai-office hooks installed in settings.json',
      neither:
        'neither the plugin nor the settings.json hooks are installed: the room will not receive live activity. Install the plugin, or use `ai-office hooks install`.',
      both: 'the plugin AND the settings.json hooks are active: every event arrives twice. Remove one (`ai-office hooks uninstall` removes the settings.json ones).',
      settingsUnreadable: 'could not read settings.json',
      coexists: (k: number, list: string) =>
        `coexists with ${count('en', k, 'hook', 'hooks')} of yours: ${list}`,
      staleHook: (path: string) =>
        `a settings.json hook points to ${path}, which no longer exists. Run \`ai-office hooks install --yes\` to register the stable copy.`,
      invalidJson: 'settings.json is not valid JSON',
      hooksDisabled: 'disableAllHooks is on: no hook will run',
      relayAt: (path: string) => `relay at ${path}`,
      relayMissing: (path: string) => `cannot find the relay at ${path}`,
      daemonUp: (port: number) => `daemon alive on port ${port}`,
      daemonDown: (port: number) =>
        `the daemon does not respond on port ${port} (start it with \`ai-office\`)`,
      spoolPending: (k: number) =>
        `${count('en', k, 'event', 'events')} pending in the spool: the daemon was off and will pick them up on start`,
      spoolEmpty: 'no events pending in the spool',
    },
  }
}

export type Messages = ReturnType<typeof makeEn>

const makeEs = (): Messages => {
  const n = (x: number) => formatNumber(x, 'es')
  return {
    help: {
      tagline: 've, edita y mide tus agentes de Claude Code',
      start: 'abre la interfaz en el navegador (también `ai-office start`)',
      noOpen: 'solo imprime el enlace, sin abrir el navegador',
      port: 'puerto de la interfaz (en el plugin, la opción «Puerto»)',
      census: 'diagnóstico de lo que tienes y de lo que usas',
      poster: 'guarda el censo como imagen compartible',
      doctor: 'comprueba la instalación: hooks, plugin, daemon y actividad pendiente',
      hooks: 'instala los hooks de actividad en settings.json (muestra el diff antes) o los retira',
      yes: 'aplica el cambio sin volver a preguntar',
      dryRun: 'solo muestra el diff',
      demo: 'la interfaz sobre una instalación ficticia: se puede editar todo sin riesgo',
      demoPort: 'puerto (por defecto 7379, para convivir con el real)',
      lang: 'idioma de la interfaz (en o es; en el plugin, la opción «Idioma»)',
      version: 'muestra la versión',
      footer: 'Todo se lee de ~/.claude (o de CLAUDE_CONFIG_DIR). Nada sale de esta máquina.',
    },
    unknownVersion: 'desconocida',
    invalidPort: (raw) => `el puerto "${raw}" no es válido: usa un número entre 1 y 65535`,
    invalidLang: (raw) => `el idioma "${raw}" no está soportado: usa en o es`,
    missingLangValue: 'la opción --lang necesita un valor: en o es',
    start: {
      listening: (url) => `escuchando en ${url}`,
      note: 'Solo 127.0.0.1. El token cambia en cada arranque. Ctrl-C para parar.',
    },
    demoHome: (home) => `instalación de demostración en ${home} (se borra al salir)`,
    census: {
      title: 'ai-office · censo',
      reading: 'leyendo el historial de sesiones...',
      agents: 'agentes',
      skills: 'skills',
      commands: 'comandos propios',
      sinceWindow: (days) => `en los últimos ${n(days)} días`,
      sinceAll: 'en el historial disponible',
      agentsIdle: (k, since) => `${n(k)} no han trabajado ${since}`,
      allActive: 'todos activos',
      skillsIdle: (k, since) => `${n(k)} sin usar ${since}`,
      allUsed: 'todas usadas',
      retired: (k) => `(${n(k)} jubiladas)`,
      commandsNone: 'ninguno se ha ejecutado',
      commandsRun: (k) => `${n(k)} ejecutados alguna vez`,
      activeRatio: 'ratio activo',
      ratioLine: (active, live, retired) =>
        `${n(active)} de ${n(live)} skills en práctica o acreditadas${
          retired ? ` (sin contar ${n(retired)} jubiladas)` : ''
        }.`,
      ratioHint:
        'Sube al usar lo que tienes o al jubilar lo que no usarás. No sube por gastar más.',
      costTitle: 'coste de tenerlo todo instalado',
      costDescriptions: 'descriptions en cada sesión',
      costDead: 'de skills que nadie ha usado',
      tokens: (k) => `~${n(k)} tokens`,
      graphTitle: 'el grafo que ya escribiste, y el que existe',
      declared: 'agente→skill citadas en su prompt',
      declaredTag: 'declaradas',
      preloaded: 'agente→skill en `skills:`',
      preloadedTag: 'precargadas',
      proven: 'agente→skill demostradas',
      provenTag: 'en el historial',
      mainThread: '…del hilo principal (tú, en directo)',
      idleAgentsTitle: (since) => `agentes que no han sido delegados ${since}`,
      inheritedModel: 'modelo heredado',
      cites: (k) => `cita ${count('es', k, 'skill', 'skills')}`,
      topTitle: 'skills que sí usas',
      uses: (k) => `${n(k)} usos`,
      vocabTitle: 'palabras de tus skills sin usar que nunca has escrito',
      vocabNote: (k) => `(contra ${n(k)} prompts tuyos; un hecho, no un pronóstico)`,
      posterSaved: (path) => `cartel guardado en ${path}`,
      unreadable: (k) => `${n(k)} archivos no se pudieron leer:`,
      more: (k) => `… y ${n(k)} más`,
      footer: (files, mb, secs) => `${n(files)} archivos de sesión · ${n(mb)} MB · ${secs} s`,
      rel: {
        never: 'nunca',
        today: 'hoy',
        yesterday: 'ayer',
        days: (k) => `hace ${k} días`,
        months: (k) => `hace ${k} meses`,
        years: (k) => `hace ${k} años`,
      },
    },
    hooks: {
      alreadyInstalled: 'Los hooks de ai-office ya están instalados.',
      relayUpdated: (path) => `Relay actualizado en ${path}`,
      changesIn: (path) => `Cambios en ${path}:`,
      yoursUntouched: [
        'Tus hooks actuales no se tocan: los nuestros se añaden al final de cada grupo',
        'y todos son async, así que no pueden bloquear ni alterar una decisión.',
      ],
      relayCopied: (path) => `El relay se copia a ${path}.`,
      dryRunDone: '(--dry-run: no se ha escrito nada)',
      toApply: (cmd) => `Para aplicarlo: ${cmd}`,
      backupNote: [
        'Se guarda una copia previa en ~/.claude/ai-office/backups/ y es reversible',
        'con `ai-office hooks uninstall`.',
      ],
      installed: 'Hooks instalados.',
      installedNext: 'Abre una sesión nueva de Claude Code para verlos.',
      noneToRemove: 'No hay hooks de ai-office en tu settings.json.',
      removed: 'Hooks retirados.',
      usage: 'uso: ai-office hooks install|uninstall [--yes] [--dry-run]',
    },
    doctor: {
      title: 'ai-office · doctor',
      claudeAt: (home) => `Claude Code en ${home}`,
      pluginOk: 'plugin de ai-office instalado',
      hooksOk: 'hooks de ai-office instalados en settings.json',
      neither:
        'ni el plugin ni los hooks de settings.json están instalados: la sala no recibirá actividad en vivo. Instala el plugin, o usa `ai-office hooks install`.',
      both: 'el plugin Y los hooks de settings.json están activos: cada evento llega dos veces. Quita uno (`ai-office hooks uninstall` retira los de settings.json).',
      settingsUnreadable: 'no se pudo leer settings.json',
      coexists: (k, list) => `convive con ${n(k)} hooks tuyos: ${list}`,
      staleHook: (path) =>
        `un hook de settings.json apunta a ${path}, que ya no existe. Corre \`ai-office hooks install --yes\` para registrar la copia estable.`,
      invalidJson: 'settings.json no es JSON válido',
      hooksDisabled: 'disableAllHooks está activo: ningún hook se ejecutará',
      relayAt: (path) => `relay en ${path}`,
      relayMissing: (path) => `no encuentro el relay en ${path}`,
      daemonUp: (port) => `daemon vivo en el puerto ${port}`,
      daemonDown: (port) =>
        `el daemon no responde en el puerto ${port} (arráncalo con \`ai-office\`)`,
      spoolPending: (k) =>
        `${n(k)} eventos pendientes en el spool: el daemon estaba apagado y los recogerá al arrancar`,
      spoolEmpty: 'sin eventos pendientes en el spool',
    },
  }
}

const catalogs: Record<Lang, Messages> = { en: makeEn(), es: makeEs() }

export const messagesFor = (lang: Lang): Messages => catalogs[lang]

/** Las claves de un catálogo, aplanadas (`census.rel.days`): para comprobar que `es` y `en` coinciden. */
export const flatKeys = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatKeys(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )

/** Idioma pedido por el usuario como texto: `en`/`es`, sin distinguir mayúsculas ni espacios. */
const parseLang = (raw: string): Lang => {
  const v = raw.trim().toLowerCase()
  if (v === 'en' || v === 'es') return v
  throw new Error(catalogs.en.invalidLang(raw))
}

/**
 * Idioma de la terminal. Por orden: `--lang en|es` (o `--lang=es`), `AI_OFFICE_LANG` y, dentro
 * del plugin, la opción `CLAUDE_PLUGIN_OPTION_LANGUAGE`. Por defecto inglés: NO se deduce de
 * `LANG`, el producto es inglés primero. Devuelve también los argumentos sin la opción, para que
 * los subcomandos no tengan que saber que existe.
 */
export const resolveLang = (
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): { lang: Lang; args: string[] } => {
  const args: string[] = []
  let flag: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (a === '--lang') {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(catalogs.en.missingLangValue)
      flag = next
      i++
    } else if (a.startsWith('--lang=')) {
      flag = a.slice('--lang='.length)
    } else {
      args.push(a)
    }
  }
  const raw = flag ?? (env.AI_OFFICE_LANG || env.CLAUDE_PLUGIN_OPTION_LANGUAGE || 'en')
  return { lang: parseLang(raw), args }
}
