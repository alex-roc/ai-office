# Claude Code configuration: what ai-office relies on

A reference of the documented facts about where Claude Code keeps agents, skills, commands,
plugins and MCP servers, and how scopes and precedence work. Every fact links to the official
docs (checked 2026-10-26). Anything **undocumented** is marked as such: ai-office must treat it
defensively and never depend on it to start.

## Settings files and precedence

Highest first: **managed** > `--settings` flag > **local** `.claude/settings.local.json` >
**project** `.claude/settings.json` > **user** `~/.claude/settings.json` (moved by
`CLAUDE_CONFIG_DIR`). Lists are merged, not replaced. `~/.claude.json` is not a settings file: it
is state that Claude Code writes itself (and rewrites often, so writes must check the etag).
Managed files: `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS),
`/etc/claude-code/managed-settings.json` (Linux/WSL), `C:\Program Files\ClaudeCode\` (Windows).
— https://code.claude.com/docs/en/settings.md · https://code.claude.com/docs/en/managed-settings.md

## Plugins

- Data root `~/.claude/plugins` (`CLAUDE_CODE_PLUGIN_CACHE_DIR`): `cache/<marketplace>/<plugin>/<version>/`,
  `installed_plugins.json` (records `scope`, `installPath`, `version`; full schema **undocumented**),
  `known_marketplaces.json`. — https://code.claude.com/docs/en/plugins/loading.md
- Enabled state: `enabledPlugins: { "name@marketplace": true|false }` in any settings file;
  merged key by key, highest source wins (managed `true` forces, `false` blocks).
  — https://code.claude.com/docs/en/settings-reference.md · https://code.claude.com/docs/en/plugins/loading.md
- CLI: `claude plugin enable|disable <plugin> [--scope user|project|local]`.
  — https://code.claude.com/docs/en/plugins/cli-reference.md
- Layout inside a plugin root: `skills/<name>/SKILL.md`, `commands/*.md`, `agents/*.md`,
  `hooks/hooks.json`, `.mcp.json`, optional `.claude-plugin/plugin.json`.
  — https://code.claude.com/docs/en/plugins/manifest-reference.md
- Names: skills and commands `/<plugin>:<name>`, agents `<plugin>:<name>` (nested folders add
  segments: `my-plugin:review:security`). Plugin files are copies that updates overwrite: treat
  them as read-only. — https://code.claude.com/docs/en/skills.md · https://code.claude.com/docs/en/sub-agents.md

## MCP servers

| Scope | Where |
|---|---|
| local (default of `claude mcp add`) | `~/.claude.json` → `projects["<project path>"].mcpServers` |
| project | `<repo>/.mcp.json` → `mcpServers` |
| user | `~/.claude.json` → `mcpServers` (top level) |
| plugin | plugin `.mcp.json` or `mcpServers` in `plugin.json` |
| managed | `managed-mcp.json` in the managed directory; `managedMcpServers` setting |

Precedence: local > project > user > plugin > claude.ai connectors (managed above all).
Disabling without deleting: per project in `~/.claude.json`, `disabledMcpServers` (and
`enabledMcpServers` for built-ins that start off) — documented only on the MCP page. For
`.mcp.json` servers, `enabledMcpjsonServers` / `disabledMcpjsonServers` / `enableAllProjectMcpServers`
in any settings file (disabled wins). Tool names in transcripts: `mcp__<server>__<tool>`, and
`mcp__plugin_<plugin>_<server>__<tool>` for plugin servers (non `[A-Za-z0-9_-]` become `_`).
— https://code.claude.com/docs/en/mcp.md · https://code.claude.com/docs/en/settings-reference.md

Never show `env` or `headers` values of a server: they usually hold secrets.

## Project scope and shadowing

- **Skills**: enterprise > personal (`~/.claude/skills`) > project (`.claude/skills`). Plugin
  skills don't compete (namespaced). Nested `<subdir>/.claude/skills` load as `/<subdir>:<name>`.
  — https://code.claude.com/docs/en/skills.md
- **Agents**: managed > `--agents` > project `.claude/agents` > user `~/.claude/agents` > plugin.
  Nearest folder to the working directory wins among nested ones.
  — https://code.claude.com/docs/en/sub-agents.md
- **Commands**: same mechanism as skills; no specific precedence table (**undocumented**).
- The project is found by walking up from the working directory (to the git root for skills).
  The key used for `projects` in `~/.claude.json` is the project path (exact rule **undocumented**).
  — https://code.claude.com/docs/en/memory.md · https://code.claude.com/docs/en/settings.md

## Observed or assumed, NOT documented

Each of these is implemented defensively and none is needed to start. If Claude Code changes one,
the only effect is that the corresponding view or mutation is wrong, never a crash.

- **`installed_plugins.json` v2** (observed on a real installation, 2026-10): `{ "version": 2,
  "plugins": { "<name>@<marketplace>": [ { "scope", "installPath", "version", "installedAt",
  "lastUpdated", "gitCommitSha" } ] } }`; v1 has the same entries at the top level. A plugin
  installed with `scope: "project"|"local"` for another project (`projectPath`) is not part of the
  current scope. `installPath` is trusted as is; if missing it is derived from the cache layout.
- **Custom component paths** a `plugin.json` can declare (`commands`, `agents`, `skills`) are not
  followed: only the default folders are read. `mcpServers` in `plugin.json` (object, path or list)
  and the root `.mcp.json` (with or without the `mcpServers` wrapper) are both read.
- **Command precedence** user vs project is assumed to match skills (user wins).
- **`~/.claude.json` project key**: tried as the project path, then its `realpath`, then any key
  whose `realpath` matches. When disabling a server in a project that has no entry, one is created
  with only `disabledMcpServers`.
- **How a plugin server is named in `disabledMcpServers`**: assumed `plugin:<plugin>:<server>` (as
  `/mcp` shows it). Its tool name in transcripts is documented (`mcp__plugin_<plugin>_<server>__<tool>`).
- **Rewriting `~/.claude.json`**: Claude Code owns it and rewrites it often, so ai-office only edits
  it when the file is byte-identical to `JSON.stringify(JSON.parse(text), null, 2)` (plus an optional
  trailing newline, preserved). Anything else is refused with `unexpected-format`; the etag is
  mandatory.
- **Settings written by ai-office**: `enabledPlugins` gets an explicit `false` (not a deleted key) so
  it overrides a lower scope; an emptied `disabledMcpjsonServers` is removed so enabling a server
  leaves the file as it was before disabling it.
- **Managed MCP**: `managed-mcp.json` (`mcpServers`) in the managed directory is read; the
  `managedMcpServers` setting is not. `CLAUDE_MANAGED_DIR` (ours) moves that directory for tests, and
  with `CLAUDE_HOME` set the real machine's managed directory is never read.
