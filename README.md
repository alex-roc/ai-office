<div align="center">

# ai-office

**See, edit and measure your Claude Code agents.**

[![npm](https://img.shields.io/npm/v/ai-office.svg?color=d9a05b)](https://www.npmjs.com/package/ai-office)
[![CI](https://github.com/alex-roc/ai-office/actions/workflows/ci.yml/badge.svg)](https://github.com/alex-roc/ai-office/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-d9a05b.svg)](LICENSE)
[![Node ≥ 22.18](https://img.shields.io/badge/node-%E2%89%A5%2022.18-7fb08a.svg)](https://nodejs.org)

[**Live demo**](https://alex-roc.github.io/ai-office/demo/) · [Website](https://alex-roc.github.io/ai-office/) · [Leer en español](README.es.md)

<img src="site/img/sala-hero.png" alt="The Office view: an isometric pixel-art floor plan where each room groups the agents that share a skill or a command" width="900">

</div>

`ai-office` turns your Claude Code **agents, skills and slash commands** into a pixel-art office
and a live graph. See how your team is organised, rewire it without fear, and measure which
agents and skills actually do the work — all from the files already in `~/.claude`, on your
machine.

```bash
npx ai-office          # open the office in your browser
npx ai-office census   # the numbers, in your terminal
npx ai-office demo     # a fictional office, safe to edit
```

English by default; Spanish with the EN/ES button or `--lang es`.

## See

<table>
<tr>
<td width="50%"><img src="site/img/sala-zoom.png" alt="Close-up of the Office"></td>
<td width="50%"><img src="site/img/plano.png" alt="The Blueprint graph"></td>
</tr>
<tr>
<td><b>The Office</b> — an isometric pixel-art floor plan of your setup. Rooms are not invented
themes: they come from which skills each agent cites and which commands call it, so every door
carries the name of a real skill or command and tells you why those people share it. Position is
data: a grey figure has never been delegated, a book spine's height is how established a skill
is, a blank spine is a skill nobody has opened.</td>
<td><b>The Blueprint</b> — the graph of who uses what and who calls whom, with every layer at
once: dotted is what your prompts declare, solid is what your transcripts prove. Select anything
and the side panel quotes the file and line behind each claim.</td>
</tr>
</table>

The key finding behind it: **the graph is already written, in prose.** Agents cite skills in the
body of their prompt (*"before working, read the style-guide skill"*), commands name the agents
they call, and some skills declare who they are for. None of that is a structured field, so no
other tool sees it. `ai-office` extracts it, with the file and line that justify each link.

Keyboard: <kbd>1</kbd>/<kbd>2</kbd> switch views, <kbd>/</kbd> finds any agent, skill or command,
<kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd> zoom and frame, <kbd>?</kbd> shows the legend and shortcuts.

## Edit

<img src="site/img/flujo.png" alt="The flow canvas composing a slash command" width="720">

Everything you edit goes through the same door: **the diff is shown before the disk is touched**,
a backup is kept, and a line lands in an audit log. Nothing is ever deleted.

- **Wire an agent to a skill** by dragging in the Blueprint: the citation is written into its prompt.
- **Change an agent's model or colour** from its side panel.
- **Retire a skill** (`disable-model-invocation`): reversible, and its description stops costing
  context in every session.
- **Archive an agent**: it moves aside to `agents/.archive/` and comes back with one click.
- **Compose a slash command** on the flow canvas: who takes part, in what order, consulting what.
  Steps in the same phase run in parallel, and the preview is the exact Markdown that will be
  written. Your existing commands can be imported into the canvas.

## Measure

```
$ npx ai-office census

  agents              14   6 not delegated in the last 90 days
  skills              28   14 unused in the last 90 days
  your commands        8   4 run at least once

  active ratio  ████████░░░░░░░░░░░░░░░░  32%

  agent→skill cited in prompts      41  declared
  agent→skill proven                13  in your history
```

Your prompts say who *should* do what; your transcripts say who *did*. `ai-office` crosses both,
in a few seconds even over gigabytes of sessions:

| Layer | Where it comes from | What it claims |
|---|---|---|
| **Available** | installed skills | anyone can invoke it, if the model decides to |
| **Assigned** | prose in the agent's prompt | its prompt says so; nobody guarantees it |
| **Preloaded** | `skills:` in the frontmatter | always loaded, whatever it costs |
| **Proven** | your transcripts | it did it, N times, the last one on a given day |

- **Usage per agent, skill and command**, graded *unused → tried → practicing → certified*. The
  grade saturates and expires after 90 days, so no number improves by spending more.
- **The cost of idle skills**: how many tokens of descriptions load into every session for skills
  nobody uses.
- **The declared↔proven gap**: on a real installation, 66 agent→skill links written in prompts,
  0 in the `skills:` field, and 13 proven in the history.
- **Live**: with the hooks installed, the office comes alive while you work in another window —
  agents materialise when delegated, a skill's spine lights up when invoked — and every event
  leaves a permanent mark on the records.
- **A shareable poster**: `npx ai-office census --poster office.svg`.

## Install

Requires **Node ≥ 22.18**.

```bash
npx ai-office                      # or: npm i -g ai-office
```

**As a Claude Code plugin** (for live activity: the hooks are declared by the plugin, so your
`settings.json` is never touched; adds the `/census` command):

```bash
claude plugin marketplace add alex-roc/ai-office
claude plugin install ai-office@ai-office
```

The first time, run `pnpm install --prod` inside the plugin directory; `ai-office` prints the exact
command if the dependencies are missing. Without the plugin, `ai-office hooks install` adds the
hooks to `settings.json` (it shows the diff first and writes nothing without `--yes`).

Other commands: `ai-office doctor` (plugin, hooks, daemon and pending events) and
`ai-office --version`. `CLAUDE_CONFIG_DIR` is honoured if you use several Claude Code accounts.

**From source:** `git clone https://github.com/alex-roc/ai-office && cd ai-office && pnpm install && pnpm dev`.

## Principles

- **Nothing leaves your machine.** No server, no telemetry, no account, no network. The local
  daemon listens on `127.0.0.1` only, behind a token that changes on every start
  ([threat model](SECURITY.md)). The hook relay never stores what you write: for `Write`, `Edit`
  and `Bash` only the file name and size leave the hook.
- **Every number cites its source.** If a figure cannot say which file and field it comes from,
  it is not shown. [docs/METRICS.md](docs/METRICS.md) even documents the metric we tried and
  threw away because the data did not back it.
- **Claude Code's internal formats are fragile and treated as such.** History is enrichment,
  never a startup dependency: if a format changes you lose the history, not the product.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
The gotchas that already cost a debugging session each: [docs/GOTCHAS.md](docs/GOTCHAS.md).

## License

[MIT](LICENSE) © Alex Ojeda Copa. The pixel-art sprites were generated with AI and hand-processed
(see [assets/README.md](assets/README.md)). Not affiliated with Anthropic.
