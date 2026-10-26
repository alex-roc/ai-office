# Architecture

[Español](es/ARQUITECTURA.md)

## Data sources, by reliability

| Source | What it gives | Stability |
|---|---|---|
| `~/.claude/agents/*.md`, `commands/*.md`, `skills/*/SKILL.md` | catalog and **declared graph** | documented format |
| `<project>/.claude/agents`, `commands`, `skills` | the same, for a project scope | documented format |
| `~/.claude/history.jsonl` | typed prompts, real slash command usage | stable in practice |
| `~/.claude/projects/**/*.jsonl` | **proven graph** (skills, subagents, MCP tool calls) | **internal, no contract** |
| `claude agents --json` | live sessions | public CLI |
| `~/.claude.json` | user and per-project MCP servers, per-project disabled-server lists, known projects | internal, rewritten by Claude Code |
| `<project>/.mcp.json`, `managed-mcp.json` | project and managed MCP servers | documented format |
| `~/.claude/settings.json` (`cleanupPeriodDays`) | how much history Claude Code keeps | stable |
| `settings.json`, `.claude/settings.json`, `.claude/settings.local.json`, managed settings | `enabledPlugins`, `disabledMcpjsonServers` | documented format |
| `~/.claude/plugins/installed_plugins.json` and each plugin's folder | installed plugins and what they ship | **schema partly undocumented** |

What is documented and what is only observed is in [CLAUDE-CODE-CONFIG](CLAUDE-CODE-CONFIG.md).

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

**Prefilter before parsing.** Only lines containing `"name":"Skill"`, `"name":"Agent"`,
`"name":"Task"` (the old name of the subagent tool: old histories are still on disk) or
`"name":"mcp__` (MCP tools are called `mcp__<server>__<tool>`) are run through `JSON.parse`. Over 1.2 GB and 692 files a full scan takes ~3.5 s. Each `tool_use` is counted once
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
Catalog { agents, skills, commands, plugins, mcpServers, projects }
Edge { from, to, kind, layer: declared|preloaded|proven, evidence[], uses?, sessions?, projects? }
Grade = unused | tried | practicing | certified      (saturating, expires after 90 days)
```

**The snapshot** (`packages/daemon/src/snapshot.ts`) is what the interface draws: `catalog`, `edges`,
`activity` (by entity id, for agents, skills, commands, plugins and MCP servers), `scope` (the scope
it was built with), `measuredOver` (what that activity was measured over, see
[Measuring](#measuring)), `knownProjects`, `scanErrors`, `stats`, `vocabularyGaps`, `planta` and
`mainThreadId`.

**The catalog lists more than is counted.** It carries everything on disk so the interface can show
it: archived agents, things shadowed by another scope, plugin content and the content of disabled
plugins. Two filters (`providers/claude-code/live.ts`) decide what counts: `liveCatalog` is what
Claude Code loads (no archived, no shadowed, nothing from a disabled plugin, no MCP server that is
off; an MCP server whose state is unknown, `enabled: null`, counts as loaded) and feeds the
declared graph;
`ownCatalog` is the live part that belongs to the user or the project (no plugins) and feeds
`stats.agents`, `skills` and `commands`, the active ratio and the poster. Plugins and MCP servers
have their own figures (`stats.plugins`…, see [METRICS](METRICS.md)).

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

## What you can see, edit and measure

This table is the contract: it says what exists and what does not. If something is not here, it is
not done. It is what the daemon exposes (the snapshot, `/api/mutations`, `/api/entities`) and what
the interface offers: the Office, the Blueprint, the Ledger and the side panel. Everything in the "edit" column goes through the same diff,
etag, backup and audit engine (see [Editing](#editing)). The CLI only reads (`census`, `doctor`):
edits happen through the daemon.

| | See | Edit | Measure |
|---|---|---|---|
| **Agents** | File with real line numbers, model, tools, color, preloaded skills, the skills its prompt cites; declared, preloaded and proven graph; archived agents | Description, prompt, model, tools, color, preloaded skills, skills the prompt cites, archive and restore. Create (user or project) | Delegations, sessions, projects, grade, 12-week trend, uses by project; how many never ran |
| **Skills** | File with real line numbers, description, allowed tools, who cites and who uses it; retired state | Description, body, retire and un-retire. Create (user or project) | Invocations, sessions, projects, grade, trend, uses by project; **description cost in tokens**; terms of the description you never typed; active ratio |
| **Commands** | File, argument hint, which agents it summons (graph); flow steps recovered from the text | Description, argument hint, body. Create (user or project). Compose or rewrite as a flow on the canvas | Typed by you (`history.jsonl`) plus invoked by the model through `Skill`; sessions, projects, trend, uses by project |
| **Plugins** | What is installed (version, marketplace), whether it is enabled and which settings file decides it, what it ships. Its agents, skills and commands show up in the catalog | **Enable and disable only** (`enabledPlugins` in user, project or local settings). Plugin files are read-only: they are copies that an update overwrites. No install, update or uninstall | Uses (sum of everything it ships), enabled plugins with no use, description cost of its enabled skills |
| **MCP servers** | Definition without secrets: scope, transport, executable or host, the **names** of env vars and headers, whether it is off or shadowed | **Enable and disable only, and only with a project scope** (Claude Code keeps that state per project). Servers are never created, edited or deleted; managed ones are read-only | Calls by tool, sessions, projects, trend, uses by project; servers with no use. **No token cost** |

Things the table does not say with a tick, on purpose:

- **MCP has no token cost** because the size of a server's tool definitions is only known by
  connecting to it, and ai-office never connects to, starts or probes a server. A number would be an
  invention, so none is shown.
- **The cost figures are estimates** (~4 characters per token) and cover skill descriptions only,
  which Claude Code loads in every session. Agent prompts and command bodies are not part of it.
- **Nothing is deleted.** Retiring a skill sets a frontmatter flag; archiving an agent moves the file.
- **Plugin and managed content is never written to.** The daemon rejects it with `read-only`.

## Scope

Two scopes, and the choice decides what the catalog contains:

- **User** (`{ kind: 'user' }`): `~/.claude` (agents, skills, commands), the plugins installed for the
  user, the MCP servers of `~/.claude.json` (user level), managed ones, and the user and managed
  settings. It does not look inside any project.
- **Project** (`{ kind: 'project', path }`): everything a Claude Code session started in that
  directory would load. That is the project's `.claude/{agents,skills,commands}`, **plus** all of the
  user scope, **plus** the plugins that apply there (user installs and the ones installed for that
  project), **plus** its MCP servers (`<project>/.mcp.json` and the entry of that project in
  `~/.claude.json`) and the project and local settings (`.claude/settings.json`,
  `.claude/settings.local.json`). If the project is `~` itself, its `.claude/` is the user's and is
  not read twice.

**How it is resolved** (`providers/claude-code/scope.ts`), first that applies wins:

1. **Flag**: `--project <path>` (implies project scope) or `--scope user|project`. `--scope user`
   with `--project` is a contradiction (`conflicting-scope`). `--scope project` without a path uses
   the one in `config.json` or, failing that, the project detected from the current directory;
   without either it fails with `needs-project`.
2. **`config.json`**: `scope: "user"` pins the user scope; otherwise a `project` that still exists
   wins. A project that was deleted is not an error: resolution falls through to the next step.
3. **Auto-detection**, only in the CLI (`ai-office`, `census` and `doctor` ask for it; the daemon
   never looks at where it was launched from): the current directory, or the git root above it, if it
   has `.claude/` with `agents`, `skills` or `commands`, or a `.mcp.json`. `~` and Claude Code's own
   directory never count as a project.
4. **User**.

The CLI resolves once at startup and hands the result to the daemon, which keeps it as the active
scope. Both the start banner and `doctor` say which scope was chosen and why (flag, config, auto,
default).

**`config.json` and `/api/config`.** `~/.claude/ai-office/config.json` is ai-office's own
configuration and never mixes with Claude Code's. Keys: `scope`, `project` (absolute path),
`show` (`agents`, `skills`, `commands`, `plugins`, `mcp`: which families the interface shows, with
its own defaults) and `lang`. `GET /api/config` returns `{ config, configError?, path, scope,
scopeSource, changed }`; `POST /api/config` takes a **patch**: a present key replaces, `null` removes,
and `show` merges key by key. Validation is strict (an unknown key or a value of another type is
`invalid-config`, not ignored) because a strange value here would decide which directory is scanned
and where writes are allowed; a project must exist (`project-not-found`) and `scope: "project"`
needs one (`needs-project`). Changing `scope` or `project` switches the scope **without restarting
and without changing the URL or the token**: only the catalog is rescanned, the history is reused.
A broken file on disk is "no configuration", never a startup failure, and the error travels in
`configError`. It is the only file ai-office writes outside the mutation engine (it is not Claude
Code's, so there is no etag to protect), but the write is atomic and leaves an audit line
(`config.set`).

**Known projects.** `snapshot.knownProjects` comes from the keys of `projects` in `~/.claude.json`
and the `cwd` of the transcripts, deduplicated by real path; existing ones first, then by number of
sessions. The active project is always in the list. It is computed with the history, so it is
refreshed with `/api/refresh`.

**Where writes may land.** `~/.claude` and `~/.agents` always. A project scope adds
`<project>/.claude` and nothing else: no mutation writes `<project>/.mcp.json` (servers are never
created or edited; their on/off state goes to settings), so it is not authorized (least privilege).
`~/.claude.json` is authorized only for the one write that needs it (disabling an MCP server).

**Precedence and shadowing.** When user and project define the same name, Claude Code loads only
one. ai-office keeps the loser in the catalog with `status: "shadowed"` and `shadowedBy`, so you can
see it, and leaves it out of the graphs, the figures and the attribution of usage. A shadowed thing is
not what Claude Code runs. The rules, with the official source of each, are in
[CLAUDE-CODE-CONFIG](CLAUDE-CODE-CONFIG.md); what the code applies (`applyPrecedence` in `catalog.ts`,
`markShadowed` in `mcp.ts`):

| | Rule | Documented? |
|---|---|---|
| Agents | project > user | yes |
| Skills | user > project | yes |
| Commands | assumed to be the same as skills (user > project) | **no**: if Claude Code resolves it differently this is the only thing that changes |
| MCP servers | managed > local > project > user | yes |
| Plugin content | does not compete: its names carry the plugin prefix (`<plugin>:<name>`) | yes |

An archived entity, or one that does not load (broken link, invalid YAML), neither shadows nor is
shadowed.

## Plugins and MCP servers

### Plugins

**Where they are read from.** `installed_plugins.json` in the plugins directory (`~/.claude/plugins`;
`CLAUDE_CODE_PLUGIN_CACHE_DIR` moves it, except under `CLAUDE_HOME`), in its v1 and v2 forms. For
each install: its `installPath` (derived from the cache layout `cache/<marketplace>/<plugin>/<version>`
if missing), the optional `.claude-plugin/plugin.json` (description, and version as a fallback) and
the default folders `agents/`, `skills/<name>/SKILL.md`, `commands/` and the `.mcp.json`. Custom
component paths a manifest may declare are not followed. An install for another project
(`scope: project|local` with a different `projectPath`) does not belong to the current scope.

**What a plugin is in the model.** A `Plugin` (key `<name>@<marketplace>`, version, `enabled`,
`enabledSource`, the ids of what it ships, `descriptionTokens`) plus its content in
`catalog.agents|skills|commands|mcpServers` with `scope: "plugin"`, `plugin: <key>`, a name prefixed
with the plugin and `source.readOnly: true`. `enabled` comes from `enabledPlugins` merged key by key
over user < project < local < managed (the highest file that names the key wins; a managed `true`
forces, a managed `false` blocks); a plugin no file names is not enabled. The content of a disabled
plugin stays in the catalog, because the history of when it was enabled still has to resolve, but
`liveCatalog` leaves it out of graphs and figures.

**How they are measured.** There is no "plugin tool" in the transcripts: a skill of a plugin is
named `plugin:skill`, its agents `plugin:agent`, its commands `/plugin:command` and its MCP servers
`mcp__plugin_<plugin>_<server>__<tool>`. Each of those resolves to its entity, and a plugin's activity
is accumulated **separately** with the use of all of them: summing the entities would count a session
once per skill, and sessions and projects are sets.

**What is written.** `plugin.enable` / `plugin.disable` set `enabledPlugins["<name>@<marketplace>"]`
to `true` or `false` in one settings file, chosen with `value: { scope: "user" | "project" | "local" }`
(user by default; the other two need a project scope, `needs-project`). It writes an explicit `false`
instead of deleting the key: a deleted key would let a lower layer's `true` win again, an explicit
`false` overrides it. The rest of the file is untouched and keeps its indentation. A project settings
file that does not exist yet is created (its etag is `absent`, and creation fails if someone else
created it in between). The plan carries two warnings when they apply: `reload-needed` (Claude Code
re-reads plugins on reload: `/reload-plugins` in open sessions) and `overridden` (a higher-precedence
file, e.g. managed, sets the opposite value: the change is written but has no effect).

### MCP servers

**Where they are read from** (scope in brackets):

| Scope | Source | Needs a project scope |
|---|---|---|
| `user` | `~/.claude.json` → `mcpServers` | no |
| `local` | `~/.claude.json` → `projects["<path>"].mcpServers` | yes |
| `project` | `<project>/.mcp.json` | yes |
| `plugin` | the plugin's `.mcp.json` or `mcpServers` in its `plugin.json` | no |
| `managed` | `managed-mcp.json` in the managed directory | no |

The `managedMcpServers` setting is not read. The key of `projects` is looked up as the project path,
then its real path, then any key whose real path matches. Plugin servers are named
`<plugin>:<server>`. Under `CLAUDE_HOME` the real machine's managed directory is never read.

**Secrets are redacted by the type, not by the interface.** A server in the model has no field in which
a secret could travel: only the **executable** (first word of `command`, without directories or
arguments, which often carry `--token xxx`), the **host** (`URL.host`, which drops credentials, path
and query; a template such as `${MCP_URL}/mcp` that is not a URL yields nothing), the **names** of
`env` and `headers`, and the transport. Values, arguments and full URLs are never read into the
snapshot, so no view can leak them by mistake.

**On or off.** Claude Code keeps that state per project, so it is only known with a project scope;
in a user scope `enabled` is `null` ("unknown") and counts as loaded. In a project scope:

- a `.mcp.json` server is off if its name is in `disabledMcpjsonServers` of a settings file
  (`disabledIn` says which ones);
- any other server is off if its name is in `projects[<path>].disabledMcpServers` of `~/.claude.json`;
- a plugin server is off if its plugin is disabled, or if `plugin:<plugin>:<server>` is in that list
  (**assumed**, as `/mcp` shows it; Claude Code does not document it);
- a managed server is always on and read-only.

**How they are measured.** Tool calls appear in the transcripts as `mcp__<server>__<tool>`: the
prefilter admits them and `parseMcpToolName` splits at the first `__` after the prefix, so a tool name
may itself contain `__`. Claude Code replaces whatever is not `[A-Za-z0-9_-]` with `_` when building
that name, and `mcpTranscriptKey` applies the same rule to the catalog name to match them. A server
name the catalog does not know (claude.ai connectors, deleted servers) still gets its activity under
an id of the form `mcp:claude-code/unknown/<key>`; it just has no card. The proven edge
`agent-uses-mcp` (agent → server) has the three most called tools as evidence; the declared one comes
from the `tools:` frontmatter, one per server, and is marked `dangling` if the server is not in the
catalog (a disabled server still counts as a valid target).

**What is written.** `mcp.disable` / `mcp.enable` always need a project scope (`needs-project`):
without a project there is no list to write in. Which file depends on where the server is declared:

- **`.mcp.json` server** → `disabledMcpjsonServers` in a settings file. Disabling writes to
  `settings.local.json`, the one that is not shared (`value: { scope }` picks another). Enabling
  removes the name from **every** settings file (user, project, local) where it is disabled: leaving
  it in one would keep the server off with nothing to say why. `value: { scope }` limits it to that
  one file. An emptied list is removed, so enabling leaves the files as they were before disabling.
  When enabling touches more than one file the plan and the apply have a different shape, see
  [Editing](#editing).
- **Any other server** (user, local, plugin) → `projects[<project>].disabledMcpServers` in
  `~/.claude.json`. The project entry is created if it does not exist.
- **Managed server** → rejected as `read-only`.

**`~/.claude.json` is edited with extra suspicion** (see [GOTCHAS](GOTCHAS.md)): Claude Code owns
that file and rewrites it often, so ai-office only touches it if its text is exactly
`JSON.stringify(parsed, null, 2)` (with or without the trailing newline, which is preserved). Any other
format is refused with `unexpected-format` rather than reformatted, and so is a file whose
`projects`, entry or list is not the type expected. The etag is mandatory, as in every write. If
`~/.claude.json` does not exist the write is refused with `not-found` / `claude-json-missing`
("Claude Code has not created it: open a session first"): the file is Claude Code's state, and
inventing it with a single list inside would be writing its state from scratch.

## Measuring

`activityByTarget` (`providers/claude-code/proven.ts`) returns, for each entity id, the same shape
(`EntityActivity`): `uses`, `sessions` and `projects` (sets), `lastUsedAt`, `grade`, `active` and the
three series below. The origin of the count depends on the kind:

| Entity | What counts as a use |
|---|---|
| Agent | a delegation: `Agent` (or the old `Task`) tool call naming it in `subagent_type` |
| Skill | a `Skill` tool call naming it |
| Command | typed by the user (`history.jsonl`), plus the model invoking it through `Skill` |
| MCP server | a call to any of its tools (`mcp__<server>__<tool>`) |
| Plugin | the sum of the above for everything it ships |

- **`weekly`**: 12 positions, oldest first; the last one is the current week. They are **rolling
  7-day windows** ending when the snapshot is built, not calendar weeks, so the series does not
  change shape depending on the day you look at it. A future timestamp (clock skew) counts in the
  last window; a use older than 12 weeks is in the total but not in the series; a use with no
  timestamp is in the total only. The series can never reach further back than its source does:
  Claude Code deletes transcripts after `cleanupPeriodDays`, so skills, agents and MCP servers cover
  that window, while typed commands come from `history.jsonl`.
- **`byProject`**: uses by project, keyed by the working directory abbreviated (`~/dev/x`) or, when
  the source carries no `cwd`, by the folder slug. Absent when there is no data.
- **`byTool`**: only MCP servers: calls by tool name (`(unknown)` if the call names none).

**How scope affects the count.** `scanTranscripts()` reads every project's transcripts once, and the
scope then decides **what is counted** (`scopeHistory`, `providers/claude-code/measure.ts`):

- **User scope**: every invocation and every typed command (`measuredOver: { kind: 'all' }`).
- **Project scope**: only the invocations whose `cwd` is inside the project path, and the commands
  typed (`history.jsonl`) with a `project` inside it (`measuredOver: { kind: 'project', path,
  sessions }`). "Inside" compares real paths (the project and every `cwd` go through `realpath`; for
  a directory that no longer exists, its nearest existing ancestor does) and by path prefix **with a
  separator**: `/p/app-old` is not inside `/p/app`; subdirectories and worktrees under the project
  (`.claude/worktrees/…`) are. A worktree outside the project path is another path and does not count.
  An invocation with no `cwd` cannot be placed and is left out.
  Everything derived is measured over that subset: uses, sessions, projects, `weekly`, `byProject`,
  `byTool`, grades, the proven edges, the active ratio and the "unused" figures. In a project scope
  "unused" therefore means *not used in this project*.
- Switching scope filters what was already scanned: no transcript is read again.
- `measuredOver.sessions` is the number of sessions of the project: those that started inside it
  (first `cwd` of their transcript) plus those with a counted invocation. The interface uses it to
  say what the figures are measured over.
- Not filtered by scope: `stats.historyPrompts`, `transcriptFiles`/`transcriptBytes` (what was read)
  and `vocabularyGaps` (the vocabulary of everything you ever typed).
- The grade adapts to the scope: across all projects, *certified* needs ≥ 2 projects; when measuring a
  single project (where the only distinct "projects" would be its worktrees) it needs use in ≥ 2
  distinct weeks instead — repetition over time, not across places (`gradeOf(…, { singleProject })`).

Shadowed and archived entities receive no use: they are not what Claude Code runs. Those of a
disabled plugin do, because what happened while it was enabled is still history.

**The Ledger** (`apps/web/src/Ledger.tsx`, logic in `ledger.ts`, pure and tested) is the third view:
a table with one row per agent (not archived), skill and command in the catalog. Columns: name,
kind, grade, uses, sessions, projects, last used, trend (the 12 weeks as a sparkline), description
cost (skills), skills cited / proven (agents) and agents it calls (commands). Sortable by any
column, filterable by kind and by "only unused", searchable by name; clicking a row selects the
entity and opens its panel as in the other views. Every header cites in its `title` the file and
field its figure comes from. Plugins and MCP servers have no rows in it: their figures are in the
snapshot (`activity`, `stats`) and in the census.

## Interface

Three views over the same snapshot, switchable without losing the selection (the Office and the
Blueprint draw it; the Ledger tabulates it, see [Measuring](#measuring)):

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
- **The Ledger** (`apps/web/src/Ledger.tsx`): a sortable table. It has no camera, so it does not
  implement `ControlVista`; it only receives the selection and reports it.

The side panel (`Ficha.tsx`) is shared by all of them and always cites the file each piece of data
comes from. The edit dialogs opened from it (`FichaEdicion.tsx`, `Edicion.tsx`, `Crear.tsx`) go through
the same two-step flow as every other write, and the file viewer (`VisorArchivo.tsx`) shows the
entity's file with its REAL line numbers, so an evidence `file:line` lands where it says.

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
`/api/refresh` recomputes both. A scope change (`POST /api/config`) invalidates the catalog and keeps
the history. A build that started before a mutation ends up with a pre-change
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

## Editing

Every mutation goes through a common engine (`mutations.ts`) in two steps: `plan*` is pure and returns
the diff without touching anything, `apply*` checks the etag, saves a backup, writes atomically to
the `realPath` and records the operation in `~/.claude/ai-office/logs/audit.ndjson`. Over HTTP those are
`POST /api/mutations/plan` (returns the diff, the warnings and the etag) and `POST /api/mutations/apply`
(takes that etag; if the file changed in between it answers `conflict` and writes nothing).

**All the kinds** (`MutationKind`, `daemon/src/mutations/router.ts`):

| Over | Kinds | What it writes |
|---|---|---|
| Agent | `agent.description`, `agent.body`, `agent.model`, `agent.tools`, `agent.color` | the frontmatter field, or the body, of its `.md`, nothing else |
| Agent | `agent.preloadedSkills` | `skills:` of the frontmatter; the plan warns `preload-cost` and `broken-citation` |
| Agent | `agent.skillMentions` | a managed section of the body between `<!-- ai-office:skills:inicio -->` and `…:fin` markers; prose written by hand outside it is never touched |
| Agent | `agent.archive`, `agent.unarchive` | moves the file to `agents/.archive/` and back; never overwrites |
| Skill | `skill.description`, `skill.body` | the frontmatter field or the body of its `SKILL.md` |
| Skill | `skill.retire`, `skill.unretire` | `disable-model-invocation: true` in `SKILL.md`; the folder and the symlinks are not moved |
| Command | `command.description`, `command.argumentHint`, `command.body` | the frontmatter field or the body; a command with no frontmatter gets one |
| Plugin | `plugin.enable`, `plugin.disable` | `enabledPlugins` of a settings file (see [Plugins](#plugins)) |
| MCP server | `mcp.enable`, `mcp.disable` | a disabled-servers list (see [MCP servers](#mcp-servers)) |

Before touching anything the router checks that the kind matches the entity (`skill.body` on an agent
id would write to a file other than the one on screen: `wrong-entity-kind`), that it is not read-only
(`read-only`: everything from a plugin or managed) and that the archive state makes sense
(`already-archived`, `not-archived`). Writing to a project's files is allowed only in that project's
scope (see [Scope](#scope)).

**Creating.** `POST /api/entities/plan` and `/api/entities/create` take
`{ kind: "agent" | "skill" | "command", name, description, body?, scope?, lang? }`. The file is born
in `~/.claude` (`scope: "user"`, the default) or in `<project>/.claude` (`scope: "project"`, which
needs an open project: `needs-project`). The name is `[a-z0-9-]`, 1 to 64 characters; without `body`
a short starter is written in `lang`. The frontmatter is emitted with the `yaml` library, never from a
template (see [GOTCHAS](GOTCHAS.md)). A taken name fails with `file-exists` **before** writing, and
for agents an archived one with that name counts as taken, because restoring it later would collide.
Creation goes through `applyCreateFile`, outside the engine: the engine has to read the previous
state to compare etags, and here there is none to preserve. It shares root validation, atomic write
(`wx`, so it never overwrites) and auditing, so that creating is not a hole through which something
is written without leaving a trace. Plugins and MCP servers cannot be created.

**Flows.** A command composed on the canvas is the whole file: a new one is created in
`~/.claude/commands`; an existing one (user or project) is rewritten **in place**, at its real path
and with the real name (`commands/ns/x.md` is `ns:x`, and a symlinked command must not be replaced
by a loose file).

**Batches.** Assigning a skill to several agents is **one mutation per agent** (`agent.skillMentions`
with the complete list of each), not a special operation. The interface plans them all before
showing anything and shows a single dialog with the combined diff and one "save". Saving applies them
**in order, one by one**, each with its own etag, because they are different files: there is no
transaction. If one fails, what was already written stays written, is removed from the dialog, and
what is pending stays there with the error in view.

**Read-only entities.** Anything with `source.readOnly` (plugin content, managed servers) can be
seen, viewed and measured but not edited: the daemon answers `read-only`. They are copies that an
update overwrites, or someone else's policy.

**Plans that write more than one file.** Only `mcp.enable` on a `.mcp.json` server that is disabled in
several settings files (and without `value.scope`). The response of `POST /api/mutations/plan` is the
usual one plus `files`: one `{ scope, path, diff, changed }` per file, ordered user, project, local.
In that case `path` is the first file's, `diff` is the concatenation of every file's diff, `changed`
is whether any changes, and **`etag` is composite** (`multi:<hash>` of every path and etag): the
client hands it back as is in `POST /api/mutations/apply`, the daemon recomputes it and, if any file
changed, answers `conflict` and writes nothing. Then it applies them **in order, one by one, each
with its own etag**: there is no transaction, so if one fails the ones before it stay written. The
apply response is the usual `{ path, etag, backup }` of the first file plus `files: [{ path, etag,
backup }]` in applied order; its `etag` is the composite of the new ones. With a single file (every
other mutation, or `value.scope` given) nothing changes: no `files`, the file's own etag.

**Citing skills.** `agent.skillMentions` writes each skill as it is invoked and where it lives: a user
skill as `~/.claude/skills/<n>/SKILL.md`, a project skill as `.claude/skills/<n>/SKILL.md`, a plugin
skill by its invocable name `` `<plugin>:<n>` `` with no path (a plugin's files change folder with
every version). The daemon decides from the catalog (`value` is still the list of names); a name the
catalog does not know is cited as a user skill. The declared graph recognizes the three forms, and
`plugin:n` does not count as a citation of a user skill `n`.

**JSON files are written differently from Markdown.** `plugin.*` and `mcp.*` use the same engine
(`json-mutations.ts`) with two differences: the file may not exist yet (a project settings file),
and what is written is JSON, so only the requested key is touched. Settings files keep their
indentation. `~/.claude.json` is the exception, and the strictest: see
[MCP servers](#mcp-servers).

Backups go to `~/.claude/ai-office/backups/<kind>/<name>/` and the audit line records the hashes
before and after and the byte delta.

## Testing without touching the real configuration

`paths()` honors the `CLAUDE_HOME` variable, so the daemon can be started against a copy:

```bash
CLAUDE_HOME=/tmp/my-copy node packages/cli/src/index.ts start
```

It also honors `CLAUDE_CONFIG_DIR`, Claude Code's official variable (with `CLAUDE_HOME` taking
precedence when both are set). This is how real writes are tested —creating a command, coloring an
agent, retiring a skill, disabling a plugin— with no risk to the user's installation. Under either
variable `.claude.json` lives inside that directory. Under `CLAUDE_HOME` only, the plugins directory
and the managed directory (`<dir>/managed`) also move inside it, so a test copy never reads the real
machine's plugins or managed settings; `CLAUDE_MANAGED_DIR` moves the managed one explicitly.

## The demo installation

`packages/cli/src/demo/` defines a fictional office (catalog in `catalog.ts`, activity in
`synth.ts`) and writes it in the exact shape of `~/.claude`: agents, skills, commands,
`settings.json`, `history.jsonl` and transcripts with subagents. It also writes what the project
scope and the plugins need: two fictional plugins in Claude Code's cache layout with an
`installed_plugins.json` v2 (one enabled, one not), user MCP servers in `.claude.json`, and a project
(`acme-web`) with its own `.claude/agents` (one agent shadows a user one) and a `.mcp.json`. The
secrets in those MCP definitions are invented on purpose: a test checks that they never reach the
snapshot. The demo opens in the `acme-web` scope through its `config.json`. Activity is
synthesized RELATIVE to today's date with a fixed-seed PRNG: grades expire after 90 days, so a demo
with frozen dates would fade out on its own.

It has three uses, all on the same code as a real installation:

- **`ai-office demo`** writes the office to a temporary directory, points `CLAUDE_HOME` there and
  starts the daemon on port 7379. Everything can be edited: writes go to the copy.
- **The static demo** on the project page. `scripts/demo-snapshot.ts` builds two snapshots with the
  daemon's `buildSnapshot` — `snapshot.json` (user scope) and `snapshot-project.json` (the acme-web
  project scope) — and the UI is compiled with `VITE_DEMO=1`; the scope selector switches between
  them in memory. In that mode
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
