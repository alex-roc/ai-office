# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses [SemVer](https://semver.org/).

## [0.1.1] - 2026-10-26

### Changed
- Published as `@alex-roc/ai-office` (npm rejected the bare name as too similar to `aioffice`);
  the command is still `ai-office`.
- Releases are published from GitHub Actions with npm trusted publishing (OIDC) and provenance.

### Added since the first tag
- See, edit and measure agents, skills, slash commands, plugins and MCP servers: the Ledger
  view, editing of prompts, SKILL.md and commands, creating entities, plugin and MCP
  enable/disable, configurable scope (user or project) and Show panel, English and Spanish.

## [0.1.0] - 2026-10-26

First public release.

### Added
- `ai-office censo`: census of agents, skills and commands against real usage, with the active
  ratio, the cost of descriptions and the declared↔proven gap; `--cartel` exports a shareable SVG.
- The **Office** (isometric pixel-art floor plan, rooms derived from the declared graph) and the
  **Blueprint** (force-directed graph with the four layers), with a side panel that cites file
  and line for every claim.
- Editing with diff, backup and audit log: relations, colour, model, retiring skills, archiving
  and restoring agents, and a flow canvas that compiles slash commands.
- Live mode through Claude Code hooks (plugin or `ai-office hooks install`).
- `ai-office demo`: a fictional installation to try everything safely.
- Claude Code plugin with the `/censo` command.
