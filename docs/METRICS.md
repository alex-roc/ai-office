# Metrics: what was measured and what was dropped

[Español](es/METRICAS.md)

Project rule: **every indicator shown cites its source and means something**. A metric that sounds
good but doesn't hold up against the data doesn't ship, however flashy it is.

## Dropped: vocabulary coverage as a predictor of usage

**Hypothesis.** A skill only fires if its `description` is written with the words the user actually
uses. So the fraction of the description's terms that appear in their prompt history should predict
how much that skill gets used.

**Test.** 40 real skills against 7,007 prompts from `~/.claude/history.jsonl`, Spearman correlation
against the real number of invocations extracted from the transcripts.

| Variant | Spearman |
|---|---|
| A — plain term presence | 0.21 |
| B — distinctive terms only (df ≤ 3) | 0.18 |
| C — weighted by rarity (IDF) and frequency in prompts | 0.29 |
| D — very rare terms only (df ≤ 2) | 0.25 |
| **Dumb baseline: description length** | **0.47** |

**Conclusion.** The hypothesis is false. No variant reaches the most naive baseline possible, so the
metric carries no information: showing it as a thermometer would be selling a precision that doesn't
exist. Nor can the baseline be built upon — that longer descriptions get used more is, almost
certainly, a proxy for the effort invested in that skill, not a lever.

**What is kept.** The verifiable fact: *"you have never typed these terms from your description"*. It
helps with rewriting and does not pretend to forecast anything. It lives in `vocabularyGap()`.

## Not shown: the token cost of an MCP server

**Why it would matter.** The tool definitions of a connected MCP server take context in every
session, the way skill descriptions do.

**Why it is not shown.** The size of those definitions is only known by connecting to the server and
asking it for its tools. ai-office reads configuration files and transcripts; it never starts or
probes a server (starting one runs whatever command its definition holds). Estimating it from the
tool names that appear in the history would measure the tools you called, not the ones that are
loaded. A figure that cannot cite a file and a field does not ship, so MCP servers have usage figures
(calls, tools, sessions, projects, trend) and no cost figure.

## In use

| Metric | Definition | Source |
|---|---|---|
| **Active ratio** | skills practicing or certified / live skills (those the model can choose: the retired ones, `disable-model-invocation: true`, leave the denominator) | catalog + transcripts |
| **Grade** (unused / tried / practicing / certified) | saturating. *tried*: any use; *practicing*: ≥ 3 distinct sessions; *certified*: ≥ 3 sessions, ≥ 2 projects (≥ 2 distinct weeks when measuring a single project) and last use within 90 days. Practicing and certified count as active | transcripts |
| **Description cost** | estimated tokens (~4 characters each) of the descriptions of your own live skills (user and project), which Claude Code loads in every session | `description` in `SKILL.md` |
| **Declared↔proven gap** | `declared` edges with no equivalent `proven` edge | graph |
| **Uses, sessions, projects, last used** | per entity: uses are counted once per `tool_use` (deduplicated by id); sessions and projects are **sets**, so three agents using a skill in one session are one session | transcripts, and `history.jsonl` for typed commands |
| **Trend** (`weekly`) | uses in each of the last 12 **rolling 7-day windows** ending when the snapshot is built, oldest first. A use with no timestamp is counted in the total, not in the series | transcripts / `history.jsonl` |
| **Uses by project** (`byProject`) | uses per working directory (`~/dev/x`), or per transcript-folder slug when the source carries no `cwd` | `cwd` of the transcript lines / `project` of `history.jsonl` |
| **Calls by tool** (`byTool`) | MCP servers only: calls per tool (`create_issue` → 12) | `mcp__<server>__<tool>` in the transcripts |
| **Plugins** (`plugins`) | plugins installed, enabled or not | `installed_plugins.json` |
| **Plugins enabled** (`pluginsEnabled`) | those with `true` in the merged `enabledPlugins` (user < project < local < managed) | `settings.json` files |
| **Plugins unused** (`pluginsUnused`) | enabled plugins with no use in the history (a plugin's uses are the sum of its skills, agents, commands and MCP servers) | settings + transcripts |
| **Plugin description cost** (`pluginDescriptionTokens`) | description tokens of the skills of the **enabled** plugins that are not retired. It is kept apart from the description cost of your own skills | `description` in the plugins' `SKILL.md` |
| **MCP servers** (`mcpServers`) | **project scope: loaded** servers (not shadowed, not off, not from a disabled plugin). **User scope: configured** servers: Claude Code keeps the on/off state per project, so with no project it is unknown (`enabled: null`) and the server counts as loaded. Same sentence, different figure: compare it only within one scope | `~/.claude.json`, `.mcp.json`, plugins, managed |
| **MCP servers unused** (`mcpUnused`) | of those, the ones with no call in the history | transcripts |

**What "unused" means.** "No use in the history window" (`stats.historyWindowDays`, the
`cleanupPeriodDays` of Claude Code; 30 by default), **measured over what the scope says**
(`snapshot.measuredOver`). In a user scope it is counted over all projects; in a project scope only
over the invocations whose working directory is inside that project (and its subdirectories and
worktrees), so "unused" means *not used in this project*. Every figure that depends on the history
follows the same rule: uses, sessions, projects, trend, uses by project, calls by tool, grades,
proven edges, active ratio and the unused counts. The census says "in this project" when it applies.
Not filtered: the number of typed prompts and the vocabulary that feeds the description contrast. When
measuring a single project, *certified* needs use in ≥ 2 distinct weeks instead of ≥ 2 projects (inside
one project the only distinct "projects" would be its worktrees).

The grade is deliberately saturating: use #4 is worth no more than use #50. That way no figure in the
product improves by spending more on Claude.
