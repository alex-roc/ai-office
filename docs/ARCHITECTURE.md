# Architecture

[Español](es/ARQUITECTURA.md)

## Data sources, by reliability

| Source | What it gives | Stability |
|---|---|---|
| `~/.claude/agents/*.md`, `commands/*.md`, `skills/*/SKILL.md` | catalog and **declared graph** | documented format |
| `~/.claude/history.jsonl` | typed prompts, real slash command usage | stable in practice |
| `~/.claude/projects/**/*.jsonl` | **proven graph** | **internal, no contract** |
| `claude agents --json` | live sessions | public CLI |
| `~/.claude.json` | the CLI's own counters | internal |
| `~/.claude/settings.json` (`cleanupPeriodDays`) | how much history Claude Code keeps | stable |

**Claude Code's directory is not always `~/.claude`.** `paths()` resolves, in this order,
`CLAUDE_HOME` (ours, for testing), `CLAUDE_CONFIG_DIR` (Claude Code's official one: multiple
accounts, containers) and `~/.claude`. With either variable, `.claude.json` lives INSIDE that
directory, not in `~/`. The hook relay applies the same rule: if the daemon looks at one directory
and the relay writes to another, events never arrive and nothing tells you.

## Rules that are not negotiable

**Always write to the `realPath`.** `~/.claude/skills` is often a projection of symlinks to another
store (e.g. `~/.agents/skills`, shared with other agents). Writing through the link would replace it
with a regular file and break the projection. The scanner groups by real target and keeps every path
from which an entity is visible.

**History is optional.** All transcript parsing lives behind `transcripts.ts`, is defensive and never
fails startup. Subagents already moved from a field in the main file to files of their own between
recent versions: that fragility is the norm, not the exception.

**Subagent attribution.** Each subagent has its transcript at
`projects/<project>/<session>/subagents/agent-<id>.jsonl` and a sibling `agent-<id>.meta.json` with
`{agentType, description, toolUseId, spawnDepth}`. Pairing the two gives attribution without walking
the `tool_use` → `tool_result` chain.

**Prefilter before parsing.** Only lines containing `"name":"Skill"`, `"name":"Agent"` or
`"name":"Task"` (the old name of the subagent tool: old histories are still on disk) are run through
`JSON.parse`. Over 1.2 GB and 692 files a full scan takes ~3.5 s. Each `tool_use` is counted once
even if it appears on several lines (resumed or forked sessions): it is deduplicated by its id.

**The history window is finite.** Claude Code deletes transcripts after `cleanupPeriodDays` days (30
by default). `stats.historyWindowDays` exposes it, and the census and the poster say "in the last N
days" where they used to say "never": "unused" only holds inside that window.

**Command activity.** A slash command leaves no tool trace when the user types it: it is counted from
`history.jsonl` (with its sessions and projects). And in recent versions the model also invokes them
through the `Skill` tool, with the command name in `tool_input.skill`: if that name is not a skill
but is a command, the invocation belongs to the command. Both origins are summed in
`activityByTarget`, which returns the same shape (`EntityActivity`) for skills, agents and commands.
Sessions and projects are SETS: three agents using a skill in the same session count as one session,
not three.

## Model

```
Catalog { agents, skills, commands, mcpServers, projects }
Edge { from, to, kind, layer: declared|preloaded|proven, evidence[], uses?, sessions?, projects? }
Grade = unused | tried | practicing | certified      (saturating, expires after 90 days)
```

**Active ratio.** `active / live`, where live skills are the ones the model can choose. A retired
skill (`disable-model-invocation: true`) leaves the denominator —and the cost figures— because its
description is no longer loaded in every session: retiring what you don't use DOES raise the ratio,
which is what the README promises. It is computed in `providers/claude-code/stats.ts` and shared by
the snapshot and the census, so they cannot disagree. `stats.skillsRetired` says how many there are.

**Archived agents.** `agent.archive` moves the `.md` to `agents/.archive/`; `scanAgents` lists them
with `archived: true` (and an id of their own, `…/user/.archive/<name>`, so they don't collide with an
active agent of the same name) and the `agent.unarchive` mutation restores them. Agents archived by
earlier versions in `agents/.archivo/` are still read and listed the same way; new ones always go to
`.archive/`. They travel in `catalog.agents` so the UI can offer "restore", but they do not count in
the stats, nor enter the declared graph, nor the room assignment.

**What could not be read.** A broken symlink or an unreadable `.md` does not take down the scan: it
accumulates in `snapshot.scanErrors` (`path: reason`) and the UI can show it.

`packages/core` imports nothing from `packages/providers`: the domain does not know what a hook or a
`.md` is. That separation is what will allow adding other providers without a refactor.

## Interface

Two views over the same snapshot, switchable without losing the selection:

- **The Office** (`apps/web/src/sala/`): **imperative** PixiJS 8, no `@pixi/react`. 2:1 isometric
  projection and pixel art. `Sala.tsx` is a dumb wrapper: it mounts the scene, hands it the snapshot
  and receives the selection; everything that happens at 60 fps lives in `escena.ts` and never
  touches React. The layout (`layout.ts`) is pure and reasons in TILE coordinates, not screen ones:
  given a snapshot it returns which cell each thing goes in, and only `iso.ts` knows how to translate
  that to pixels.

  **The split into rooms is not decided in the UI.** `agruparEnSalas`
  (`packages/core/src/graph/salas.ts`) computes it over the DECLARED graph, and it travels in the
  snapshot. It lives in `core` and not here for two reasons: it is derived data, not geometry, and
  that way it is tested in Node without spinning up a canvas. `layout.ts` only decides where each
  room lands on the floor.

  The art is split in two by a clear rule:

  - **Generated** (`atlas.ts` + `public/sprites/`): people and furniture, twenty PNGs cut from two
    sheets made with `codex-image-gen`. They are organic volumes that do not depend on data.
  - **Procedural** (`texturas.ts` on top of `lienzo.ts`): floor, walls, shelves, skill spines and
    command cards. Everything that has to TILE seamlessly or CHANGE with the data. A generated tile
    would not match its neighbour, and a skill's spine changes height and color with its grade and
    its owner.

  `lienzo.ts` is a raw RGBA buffer, with no canvas in between: every pixel is decided by hand, so
  edges are exact and a Node test can assert on them without WebGL.

  The camera scales by **integers** upward (no 1.37: it would interpolate the pixel) plus a single
  zoom-out step to 0.5, because with corridors the floor plan doesn't fit even when maximized.
  Crossing 1x switches the filtering of every texture from `nearest` to `linear`: magnifying with
  `linear` blurs, but shrinking with `nearest` drops every other pixel and leaves the image
  chewed up. The **minimap** uses the same projection, scaled down, not a top-down view, which is
  why the "what you are looking at" frame is a true rectangle and not a distorted rhombus.
- **The Blueprint** (`apps/web/src/Plano.tsx`): SVG with d3-force. The layout is computed **once** and
  frozen (see the gotcha in `CLAUDE.md`); pan and zoom are the only interactive parts.

The side panel (`Ficha.tsx`) is shared by both and always cites the file each piece of data comes
from.

**Network in a single module.** Every call to the daemon goes through `api.ts` (`apiGet`, `apiPost`,
`abrirSocketVivo`); `flows.ts`, `mutations.ts` and `live.ts` touch neither `fetch` nor `WebSocket`.
That is where a static demo mode plugs in (`import.meta.env.VITE_DEMO`). Errors are translated in
`errores.ts` from the daemon's stable `code` to the active language.

**Live state outside React.** `live.ts` is a store with selector subscription: an event does not
re-render `App`, only the connection indicator; the Office receives the flashes through `onEvento`.

**Both views live mounted at once.** `App` toggles their visibility; both expose the same interface
(`ControlVista`: fit, zoom, centerOn) used by the shortcuts and the search box. The camera only
re-fits when the set of entities changes (`claveDeConjunto`), not on every snapshot.

**Flow phases** (`fases.ts`, pure and tested): an "at the same time" group is a run of steps with the
same phase number; every operation (move, join, split) works by blocks and renumbers to 1..n.

**Internationalization.** English is the default and Spanish is selectable, on every surface: the
web UI (EN/ES switch in the header, or `?lang=es` in the URL), the CLI (`--lang es` or
`AI_OFFICE_LANG=es`) and the plugin (`language` option, which reaches the CLI as
`CLAUDE_PLUGIN_OPTION_LANGUAGE`). Each surface has its own message catalog (`apps/web/src/i18n/en.ts` and `es.ts`;
`packages/cli/src/i18n.ts`) and the English one is the source of truth: a test checks that the Spanish one has exactly the same keys. The Office's Pixi
texts are not React, so the scene regenerates them when the language changes (see
[GOTCHAS](GOTCHAS.md)).

**Daemon errors carry a stable `code`.** The message is for humans and may be reworded or translated;
the `code` is the contract. The UI maps each `code` to its catalog entry and falls back to the
daemon's message when it doesn't know it.

## How rooms are grouped

Grouping by topic ("legal", "data") would be a hand-written word list, and an invented topic cannot
cite its source — which is the rule that holds the product up. Instead a room comes from two facts
already written in the user's files: **which skills each agent cites** in the body of its prompt and
**which commands summon it** (slash commands are hand-made casts, that is, the org chart the user
already drew without realizing).

Both features are discounted by IDF before comparing, and that discount is not a statistical
ornament: without it nothing works. In a real installation half the staff cites the same four context
skills and one review command summons eight agents, so unweighted similarity puts nine agents in a
single giant room and the floor plan ceases to exist. What identifies someone is what they share with
FEW, not what they share with everyone.

The clustering is agglomerative with average linkage, with a threshold calibrated on a real
installation of 19 agents. Each room is named after its most characteristic feature —a skill or a
command that exist— and keeps the reason, which is what the door plaque shows when you point at it.

Two places in the lobby collect what belongs to no room, and they are kept apart on purpose because
they mean opposite things: the **shared archive** (skills that half the floor cites) and the
**storeroom** (skills nobody cites). Merging them would erase the distinction that gives everything
else meaning.

## Flow compiler

`compile.ts` translates between a flow (`{name, description, steps[]}`) and a Markdown slash command.
The generated file must be indistinguishable from one written by hand: no custom format is invented.
The Markdown is written in the chosen language (English by default; the structural headings and
markers change with `--lang`/`language`), and `importFlow` recognizes both, so a command compiled in
one language is read back after switching to the other. `importFlow` recovers the steps of existing
commands —including hand-written ones— by looking for known agent names; on a real installation it
recovers steps from 21 of 27 commands, which are exactly the ones that name agents.

## The daemon

**Auth guard.** It decides on the NORMALIZED path (percent-decoding, double too, `//`, `..`,
uppercase) and on the path the router resolved, and what is public is an exact whitelist
(`/api/health`, `/api/live` and the static files). Everything else under `/api` requires the token
and, if it is not GET, the `X-AI-Office` header. See the gotcha in `docs/GOTCHAS.md`.

**Startup.** The token is only written to disk once the server is listening: a second start with the
port taken does not invalidate the first one's. If the port is held by another ai-office, it says so
(probe to `/api/health`), before touching the ingest socket or the spool.

**Snapshot in two caches.** History (transcripts, `history.jsonl`, settings: seconds) and the catalog
(milliseconds) have different lifecycles. A mutation rescans only the catalog and reuses the history;
`/api/refresh` recomputes both. A build that started before a mutation ends up with a pre-change
catalog, so it is returned but NOT cached (`generation` counter). The pending promise is cleared in
`finally`: if it failed and stayed stored, every later request would receive the same error forever.

**Spool.** The relay writes `YYYY-MM-DD.ndjson`; the daemon renames it to `.draining` BEFORE reading
it (read-then-delete lost the lines appended in between). `fs.watch` is unreliable on macOS (it drops
what happens right after creation), so the directory is also checked every second. The relay does not
let the spool grow past 5 MB: it drops what is new and notes it once (`.lleno`).

**Presence.** Finished sessions are forgotten after 10 minutes; before, the map only grew. A WebSocket
that doesn't send its first frame (the token one) within 5 s is closed.

## Distribution

Requires Node ≥ 22.18. `.claude-plugin/plugin.json` declares the plugin; `hooks/hooks.json` its
hooks, all with `"async": true` so they never enter a session's critical path; `bin/ai-office` goes
on the Bash tool's PATH. `claude plugin validate .` must pass before publishing.

`bin/ai-office` checks that the plugin has its dependencies (it is cloned without `node_modules`)
and, if they are missing, prints the exact command (`pnpm install --prod` in the plugin directory)
instead of an `ERR_MODULE_NOT_FOUND`. The `userConfig` options reach us through Claude Code's
convention, `CLAUDE_PLUGIN_OPTION_<KEY>`: `port` and `language` are read by the CLI
(`packages/cli/src/env.ts`) and `telemetry` by the relay. Outside the plugin, `AI_OFFICE_PORT`,
`AI_OFFICE_LANG` and `AI_OFFICE_TELEMETRY=0` apply.

**Hooks via settings.json.** `hooks install` copies the relay to `~/.claude/ai-office/bin/` and
registers that path: the package's own path may live in the `npx` cache, which gets purged, and
Claude Code silently ignores a hook whose file does not exist. It creates `settings.json` if missing,
writes to the real target if it is a symlink (preserving permissions) and its event list must match
`hooks/hooks.json` (a test checks it). If the plugin and the settings.json hooks are both active,
every event arrives twice: `doctor` warns about it.

**Relay privacy.** `tool_input` of `Write`, `Edit`, `MultiEdit`, `NotebookEdit` and `Bash` is user
content (file text, commands with tokens). The relay neither forwards it nor stores it in the spool,
which stays on disk for days: from those tools only the file name and the byte count come out; their
output doesn't either. With `telemetry` off it writes nothing.

## Writing

Every mutation goes through a common engine (`mutations.ts`) in two steps: `plan*` is pure and returns
the diff without touching anything, `apply*` checks the etag, saves a backup, writes atomically to
the `realPath` and records the operation in `~/.claude/ai-office/logs/audit.ndjson`.

Creating a new file (a command compiled from the flow canvas) goes through `applyCreateFile`, outside
the engine: the engine has to read the previous state to compare etags, and here there is no previous
state to preserve. It shares root validation, atomic write and auditing, so that creating is not a
hole through which something gets written without leaving a trace.

## Testing without touching the real configuration

`paths()` honors the `CLAUDE_HOME` variable, so the daemon can be started against a copy:

```bash
CLAUDE_HOME=/tmp/my-copy node packages/cli/src/index.ts start
```

It also honors `CLAUDE_CONFIG_DIR`, Claude Code's official variable (with `CLAUDE_HOME` taking
precedence when both are set). This is how real writes are tested —creating a command, coloring an
agent, retiring a skill— with no risk to the user's installation.

## The demo installation

`packages/cli/src/demo/` defines a fictional office (catalog in `catalog.ts`, activity in
`synth.ts`) and writes it in the exact shape of `~/.claude`: agents, skills, commands,
`settings.json`, `history.jsonl` and transcripts with subagents. Activity is synthesized RELATIVE to
today's date with a fixed-seed PRNG: grades expire after 90 days, so a demo with frozen dates would
fade out on its own.

It has three uses, all on the same code as a real installation:

- **`ai-office demo`** writes the office to a temporary directory, points `CLAUDE_HOME` there and
  starts the daemon on port 7379. Everything can be edited: writes go to the copy.
- **The static demo** on the project page. `scripts/demo-snapshot.ts` builds the snapshot with the
  daemon's `buildSnapshot` and the UI is compiled with `VITE_DEMO=1`. In that mode
  `apps/web/src/demo.ts` replaces the three network points of `api.ts`: the snapshot comes from the
  JSON, the flow canvas uses the real compiler in the browser, writes are rejected with a message
  explaining why, and the WebSocket is a script that replays the PROVEN graph.
- **The screenshots** in the README and on the page.

## The project page

`site/` is HTML, CSS and JS with no build, bilingual (English is in the HTML; Spanish in `i18n.js`,
which captures the English from the DOM itself to avoid duplicating it). `scripts/build-site.sh`
assembles it into `_site/` with the UI sprites and the static demo in `_site/demo/`, and the
`pages.yml` workflow publishes it on every push to `main` and once a week (so the demo doesn't go
stale).
