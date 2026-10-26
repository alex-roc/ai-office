# Contributing

[Español](#español)

Thanks for wanting to help. Issues and pull requests are welcome in **English or Spanish**.

Language conventions: the code and its comments are in Spanish, and identifiers are in English. The
interface, the CLI and the documentation are in English, with Spanish as the second language.

## Setup

```bash
git clone https://github.com/alex-roc/ai-office && cd ai-office
pnpm install          # pnpm only (packageManager is pinned); Node ≥ 22.18
pnpm demo             # daemon + UI against a fictional ~/.claude, safe to edit
pnpm dev:web          # Vite dev server on :7378 (proxies /api to the daemon on :7377)
```

Node runs the TypeScript sources directly: there is no build step in development.

**Never test writes against your real `~/.claude`.** Use `pnpm demo`, or point the daemon at a copy:

```bash
CLAUDE_CONFIG_DIR=/tmp/copy-of-claude node packages/cli/src/index.ts start
```

## Before opening a PR

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- Read [`docs/GOTCHAS.md`](docs/GOTCHAS.md) before touching the Office (Pixi), the Blueprint (SVG),
  the daemon or the hooks. Almost every gotcha there fails **silently**.
- Architecture and the rules that are not negotiable: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Every number cites its source.** A new indicator must be able to say which file and field it
  comes from. Metrics we tried and dropped, and why: [`docs/METRICS.md`](docs/METRICS.md).
- **Use Claude Code's real vocabulary** in the UI: agent, skill, command, MCP, subagent, session.
- **Any new visible text goes into both catalogs**, with English as the source: the web one
  (`apps/web/src/i18n/en.ts` and `es.ts`) and the CLI one (`packages/cli/src/i18n.ts`). A test checks that Spanish has
  exactly the same keys as English, so a missing translation fails CI.
- Documentation is English first, with a Spanish counterpart under `docs/es/`; keep both in sync and
  keep the link between each pair.
- `packages/core` never imports from `packages/providers`.
- Writes go through the mutation engine (`plan*` pure → `apply*` with etag, backup, atomic write
  to the `realPath`, audit log). Nothing is ever deleted.

## Layout

```
packages/core        pure domain: model, graph, grades, office layout (no I/O)
packages/providers   reads ~/.claude: catalog, declared graph, transcripts, history, mutations
packages/daemon      local HTTP + WebSocket server (127.0.0.1, per-start token)
packages/hook-relay  the tiny script Claude Code runs on each hook event
packages/cli         the `ai-office` command (census, doctor, hooks, demo, start)
apps/web             React + PixiJS (Office) + d3-force (Blueprint)
site/                the GitHub Pages landing (plain HTML/CSS/JS)
```

## Español

[English](#contributing)

Gracias por querer ayudar. Se aceptan issues y pull requests en **inglés o español**.

Convenciones de idioma: el código y sus comentarios están en español, y los identificadores en
inglés. La interfaz, el CLI y la documentación están en inglés, con el español como segundo idioma.

### Puesta en marcha

```bash
git clone https://github.com/alex-roc/ai-office && cd ai-office
pnpm install          # solo pnpm (packageManager está fijado); Node ≥ 22.18
pnpm demo             # daemon + interfaz sobre un ~/.claude ficticio, se puede editar sin riesgo
pnpm dev:web          # servidor de Vite en :7378 (hace proxy de /api al daemon en :7377)
```

Node ejecuta el TypeScript directamente: en desarrollo no hay paso de build.

**Nunca pruebes escrituras contra tu `~/.claude` real.** Usa `pnpm demo`, o apunta el daemon a una
copia:

```bash
CLAUDE_CONFIG_DIR=/tmp/copia-de-claude node packages/cli/src/index.ts start
```

### Antes de abrir un PR

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- Lee [`docs/es/GOTCHAS.md`](docs/es/GOTCHAS.md) antes de tocar la Sala (Pixi), el Plano (SVG), el
  daemon o los hooks. Casi todos los gotchas de ahí fallan **en silencio**.
- Arquitectura y reglas que no se negocian: [`docs/es/ARQUITECTURA.md`](docs/es/ARQUITECTURA.md).
- **Todo número cita su fuente.** Un indicador nuevo debe poder decir de qué archivo y campo sale.
  Métricas que probamos y descartamos, y por qué: [`docs/es/METRICAS.md`](docs/es/METRICAS.md).
- **Usa el vocabulario real de Claude Code** en la interfaz: agente, skill, comando, MCP, subagente,
  sesión.
- **Todo texto visible nuevo va en los dos catálogos**, con el inglés como fuente: el de la web
  (`apps/web/src/i18n/en.ts` y `es.ts`) y el del CLI (`packages/cli/src/i18n.ts`). Un test comprueba que el español tiene
  exactamente las mismas claves que el inglés, así que una traducción que falta rompe la CI.
- La documentación es primero en inglés, con su par en español bajo `docs/es/`; mantén las dos en
  sincronía y conserva el enlace entre cada par.
- `packages/core` nunca importa de `packages/providers`.
- Las escrituras pasan por el motor de mutaciones (`plan*` puro → `apply*` con etag, backup,
  escritura atómica en el `realPath`, registro de auditoría). Nunca se borra nada.

### Estructura

```
packages/core        dominio puro: modelo, grafo, grados, reparto de la oficina (sin E/S)
packages/providers   lee ~/.claude: catálogo, grafo declarado, transcripts, historial, mutaciones
packages/daemon      servidor local HTTP + WebSocket (127.0.0.1, token por arranque)
packages/hook-relay  el script mínimo que Claude Code ejecuta en cada evento de hook
packages/cli         el comando `ai-office` (census, doctor, hooks, demo, start)
apps/web             React + PixiJS (la Sala) + d3-force (el Plano)
site/                la página de GitHub Pages (HTML/CSS/JS sin build)
```
