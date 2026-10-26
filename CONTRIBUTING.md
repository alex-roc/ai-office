# Contributing · Contribuir

Thanks for wanting to help. Issues and pull requests are welcome in **English or Spanish**.
The code, comments and interface are in Spanish; identifiers are in English.

Gracias por querer ayudar. Se aceptan issues y pull requests en **inglés o español**. El código,
los comentarios y la interfaz están en español; los identificadores, en inglés.

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
- Architecture and the rules that are not negotiable: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).
- **Every number cites its source.** A new indicator must be able to say which file and field it
  comes from. Metrics we tried and dropped, and why: [`docs/METRICAS.md`](docs/METRICAS.md).
- **Use Claude Code's real vocabulary** in the UI: agent, skill, command, MCP, subagent, session.
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
