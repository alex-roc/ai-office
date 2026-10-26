<div align="center">

# ai-office

**Which half of your Claude Code setup do you never use?**

[![CI](https://github.com/alex-roc/ai-office/actions/workflows/ci.yml/badge.svg)](https://github.com/alex-roc/ai-office/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-d9a05b.svg)](LICENSE)
[![Node ≥ 22.18](https://img.shields.io/badge/node-%E2%89%A5%2022.18-7fb08a.svg)](https://nodejs.org)

[**Live demo**](https://alex-roc.github.io/ai-office/demo/) · [Website](https://alex-roc.github.io/ai-office/) · [Leer en español](README.es.md)

<img src="site/img/sala-hero.png" alt="The Office view: an isometric pixel-art floor plan where each room groups the agents that cite the same skill" width="900">

</div>

`ai-office` reads your Claude Code **agents, skills and slash commands**, checks them against
what actually happened in your sessions, and shows you both at once: the org chart you wrote,
and the one that exists.

```
$ ai-office censo

  agentes              14   6 no han trabajado en los últimos 90 días
  skills               28   14 sin usar en los últimos 90 días
  comandos propios      8   4 ejecutados alguna vez

  ratio activo  ████████░░░░░░░░░░░░░░░░  32%

  agente→skill citadas en su prompt   41  declaradas
  agente→skill demostradas            13  en el historial
```

> The CLI and the interface speak **Spanish** today (the numbers above come from the fictional
> demo installation). The code is documented in Spanish too; issues and PRs are welcome in
> English or Spanish.

## Why

After a while with Claude Code you pile up agents, skills and commands that seemed like a good
idea. Nothing tells you which ones survive. Skill managers show you an inventory; session viewers
show you a moment. None of them shows you **a service record**.

The finding that makes this project possible: **the graph is already written, in prose.** Agents
cite skills in the body of their prompt (*"before working, read the style-guide skill"*),
commands name the agents they call, and some skills declare who they are for. None of that is a
structured field, so no tool sees it. `ai-office` extracts it, with the file and line that justify
each link, and lays it over what your transcripts prove happened.

On a real installation: 66 agent→skill links written in prompts, 0 in the `skills:` field, and
13 proven in the history. That gap is the product.

## The four layers

| Layer | Where it comes from | What it claims |
|---|---|---|
| **Available** | installed skills | anyone can invoke it, if the model decides to |
| **Assigned** | prose in the agent's prompt | its prompt says so; nobody guarantees it |
| **Preloaded** | `skills:` in the frontmatter | always loaded, whatever it costs |
| **Proven** | your transcripts | it did it, N times, the last one on a given day |

The proven layer wins: it is the only one backed by facts.

## Two views

<table>
<tr>
<td width="50%"><img src="site/img/sala-zoom.png" alt="Close-up of the Office"></td>
<td width="50%"><img src="site/img/plano.png" alt="The Blueprint graph"></td>
</tr>
<tr>
<td><b>The Office</b> — an isometric pixel-art floor plan. Rooms are not invented themes: they
come from which skills each agent cites and which commands call it, so every door carries the
name of a real skill or command. A grey figure has never been delegated; the height of a book
spine is how established a skill is; a blank spine is a skill nobody has opened.</td>
<td><b>The Blueprint</b> — the graph with every layer at once. Dotted is what your prompts declare;
solid is what your transcripts prove. Select anything and the side panel quotes the file and line
behind each claim.</td>
</tr>
</table>

Keyboard: <kbd>1</kbd>/<kbd>2</kbd> switch views, <kbd>/</kbd> finds any agent, skill or command,
<kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd> zoom and frame, <kbd>?</kbd> shows the legend and shortcuts.

## Change it without fear

<img src="site/img/flujo.png" alt="The flow canvas composing a slash command" width="720">

Everything you edit goes through the same door: **the diff is shown before the disk is touched**,
a backup is kept, and a line lands in an audit log. Nothing is ever deleted.

- **Drag** from an agent to a skill in the Blueprint and the citation is written into its prompt.
- **Retire a skill** (`disable-model-invocation`): reversible, and the fastest way to raise your
  active ratio.
- **Archive an agent**: it moves to `agents/.archivo/` and comes back with one click.
- **Compose a slash command** on the flow canvas: who takes part, in what order, consulting what.
  Steps in the same phase run in parallel, and the preview is the exact Markdown that will be
  written. Your existing commands can be imported into the canvas.

## Live

With the hooks installed, the office comes alive while you work in another window: agents
materialise when they are delegated and a skill's spine lights up when it is invoked. Each event
leaves a permanent mark on the records.

The hook relay never stores what you write: for `Write`, `Edit` and `Bash` only the file name and
size leave the hook, never the text, the command or its output. It can be turned off entirely.

## Install

Requires **Node ≥ 22.18** (it runs TypeScript natively) and **pnpm**.

**As a Claude Code plugin** (recommended: the hooks are declared by the plugin, so your
`settings.json` is never touched; adds the `/censo` command):

```bash
claude plugin marketplace add alex-roc/ai-office
claude plugin install ai-office@ai-office
```

The first time, run `pnpm install --prod` inside the plugin directory; `ai-office` prints the exact
command if the dependencies are missing.

**From source:**

```bash
git clone https://github.com/alex-roc/ai-office && cd ai-office
pnpm install
pnpm censo                         # the numbers
pnpm dev                           # the office, in your browser
pnpm demo                          # a fictional office, safe to edit
node packages/cli/src/index.ts censo --cartel office.svg   # a shareable SVG poster
```

Other commands: `ai-office doctor` (plugin, hooks, daemon and pending events),
`ai-office hooks install|uninstall` (shows the diff first, writes nothing without `--yes`),
`ai-office --version`. `CLAUDE_CONFIG_DIR` is honoured if you use several Claude Code accounts.

## Principles

- **Nothing leaves your machine.** No server, no telemetry, no account, no network. The local
  daemon listens on `127.0.0.1` only, behind a token that changes on every start
  ([threat model](SECURITY.md)).
- **Every number cites its source.** If a figure cannot say which file and field it comes from,
  it is not shown. [docs/METRICAS.md](docs/METRICAS.md) even documents the metric we tried and
  threw away because the data did not back it.
- **No number improves by spending more.** A skill's grade saturates and expires after 90 days.
- **Claude Code's internal formats are fragile and treated as such.** History is enrichment,
  never a startup dependency: if a format changes you lose the history, not the product.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Architecture: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).
The gotchas that already cost a debugging session each: [docs/GOTCHAS.md](docs/GOTCHAS.md).

## License

[MIT](LICENSE) © Alex Ojeda Copa. The pixel-art sprites were generated with AI and hand-processed
(see [assets/README.md](assets/README.md)). Not affiliated with Anthropic.
