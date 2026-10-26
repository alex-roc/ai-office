<div align="center">

# ai-office

**See, edit and measure your Claude Code setup.**

Agents · skills · slash commands · plugins · MCP servers

[![npm](https://img.shields.io/npm/v/ai-office.svg?color=d9a05b)](https://www.npmjs.com/package/ai-office)
[![CI](https://github.com/alex-roc/ai-office/actions/workflows/ci.yml/badge.svg)](https://github.com/alex-roc/ai-office/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-d9a05b.svg)](LICENSE)
[![Node ≥ 22.18](https://img.shields.io/badge/node-%E2%89%A5%2022.18-7fb08a.svg)](https://nodejs.org)

[**Live demo**](https://alex-roc.github.io/ai-office/demo/) · [Website](https://alex-roc.github.io/ai-office/) · [Leer en español](README.es.md)

<img src="site/img/sala-hero.png" alt="The Office view: an isometric pixel-art floor plan with rooms of agents, a plugin's room and a server room for MCP servers" width="900">

</div>

`ai-office` turns everything your Claude Code runs on — **agents, skills, slash commands,
plugins and MCP servers** — into a pixel-art office, a live graph and a ledger. See how it fits
together, change it without fear, and find out what actually does the work. It reads the files
already in `~/.claude` (and your project's `.claude/`), on your machine.

```bash
npx ai-office          # open the office in your browser (inside a project: that project's scope)
npx ai-office census   # the numbers, in your terminal
npx ai-office demo     # a fictional office, safe to edit
```

English by default; Spanish with the EN/ES button or `--lang es`.

## See

<table>
<tr>
<td width="50%"><img src="site/img/sala.png" alt="The Office with an agent's details open"></td>
<td width="50%"><img src="site/img/plano.png" alt="The Blueprint graph with MCP servers"></td>
</tr>
<tr>
<td><b>The Office</b> — an isometric pixel-art floor plan. Rooms come from which skills each agent
cites and which commands call it, so every door carries the name of a real skill or command.
Plugins get their own room; MCP servers a rack each in the server room. Position is data: a grey
figure has never been delegated, a spine's height is how established a skill is, a dark rack is a
server nobody calls.</td>
<td><b>The Blueprint</b> — the graph of who uses what: agents, skills, commands, plugin pieces
(ringed) and MCP servers (hexagons). Dotted is what your prompts declare; solid is what your
transcripts prove. Select anything and the side panel quotes the file and line behind each
claim, and opens the file right there.</td>
</tr>
</table>

The key finding behind it: **the graph is already written, in prose.** Agents cite skills in the
body of their prompt (*"before working, read the style-guide skill"*), commands name the agents
they call. None of that is a structured field, so no other tool sees it. `ai-office` extracts it,
with the file and line that justify each link.

## Edit

<img src="site/img/diff.png" alt="The diff shown before saving: two skills added to an agent's prompt" width="640">

Everything you change goes through the same door: **the diff is shown before the disk is
touched**, a backup is kept, and a line lands in an audit log. Nothing is ever deleted.

| | What you can change |
|---|---|
| **Agents** | description, prompt, model, colour, tools, preloaded skills, the skills it cites; archive and restore; create |
| **Skills** | description (next to the words of it you never type), the SKILL.md itself, which agents it is assigned to; retire; create |
| **Slash commands** | description, argument hint, body — or compose it on a flow canvas (who takes part, in what order, steps in parallel); create |
| **Plugins** | enable or disable, in the settings file you choose. Plugin files are read-only: updates overwrite them |
| **MCP servers** | enable or disable per project (Claude Code keeps that state per project). Never created, edited or deleted |

## Measure

<img src="site/img/ledger.png" alt="The Ledger: a sortable table of everything with uses, grade and a 12-week trend, and an MCP server's details">

Your prompts say who *should* do what; your transcripts say who *did*. The **Ledger** puts
everything in one sortable table: uses, sessions, projects, last use, grade
(*unused → tried → practicing → certified*), a 12-week trend, usage by project, calls per MCP
tool, and what each skill's description costs in context. Filter to "only unused" and you have
your clean-up list.

```
$ npx ai-office census

  agents              14   6 have not worked in the last 90 days
  skills              28   14 unused in the last 90 days
  custom commands      8   4 run at least once

  plugins       1 enabled of 2 installed · ~65 tokens of skill descriptions
  MCP servers   2 loaded · 1 unused · never called: postgres

  active ratio  █████████░░░░░░░░░░░░░░░  36%

  agent→skill cited in their prompt  40  declared
  agent→skill proven                 14  in the history
```

| Layer | Where it comes from | What it claims |
|---|---|---|
| **Available** | installed skills | anyone can invoke it, if the model decides to |
| **Assigned** | prose in the agent's prompt | its prompt says so; nobody guarantees it |
| **Preloaded** | `skills:` in the frontmatter | always loaded, whatever it costs |
| **Proven** | your transcripts | it did it, N times, the last one on a given day |

With the hooks installed, the office comes alive while you work: agents materialise when
delegated and a skill's spine lights up when invoked. `npx ai-office census --poster office.svg`
gives you a shareable poster.

## Scope and what to show

- **User or project.** User scope is `~/.claude`. A project scope is what a session there really
  loads — the project's `.claude/`, your user setup and enabled plugins, with project pieces that
  shadow user ones marked as such — and usage is measured over that project's sessions only.
  Pick it in the header, with `--project <path>`, or just run `ai-office` inside the project.
- **Show.** Toggle agents, skills, commands, plugins and MCP servers in the Office and the
  Blueprint so they never get crowded. The Ledger always lists everything.
- Settings live in `~/.claude/ai-office/config.json`.

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

Other commands: `ai-office doctor` (scope, plugin, hooks, daemon and pending events) and
`ai-office --version`. `CLAUDE_CONFIG_DIR` is honoured if you use several Claude Code accounts.

## Principles

- **Nothing leaves your machine.** No server, no telemetry, no account, no network. The local
  daemon listens on `127.0.0.1` only, behind a token that changes on every start
  ([threat model](SECURITY.md)). MCP secrets are never shown — only the names of their variables
  and headers — and the hook relay never stores what you write.
- **Every number cites its source.** If a figure cannot say which file and field it comes from,
  it is not shown. That's why there is no token cost for MCP servers: it can't be known without
  connecting to them. [docs/METRICS.md](docs/METRICS.md) even documents a metric we tried and threw
  away because the data did not back it.
- **No number improves by spending more.** A grade saturates and expires after 90 days.
- **Claude Code's internal formats are fragile and treated as such.** History is enrichment,
  never a startup dependency. What ai-office relies on is written down in
  [docs/CLAUDE-CODE-CONFIG.md](docs/CLAUDE-CODE-CONFIG.md), with links to the official docs.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Architecture, including the exact table of what can be
seen, edited and measured: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The gotchas that already
cost a debugging session each: [docs/GOTCHAS.md](docs/GOTCHAS.md).

## License

[MIT](LICENSE) © Alex Ojeda Copa. The pixel-art sprites were generated with AI and hand-processed
(see [assets/README.md](assets/README.md)). Not affiliated with Anthropic.
