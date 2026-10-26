/**
 * Catálogo en inglés: la FUENTE DE VERDAD. `es.ts` se tipa contra las claves de este archivo, así
 * que una clave que falte allí no compila.
 *
 * Plurales: una clave con `{n}` puede tener variantes `_one` / `_other` (`Intl.PluralRules`).
 * Marcado mínimo: `**negrita**` y `código` entre acentos graves (ver `Rico.tsx`).
 */
export const en = {
  // --- Vistas, cabecera ---------------------------------------------------------------------
  'view.office': 'Office',
  'view.blueprint': 'Blueprint',
  'header.view.title': '{view} (key {key})',
  'header.edit.on': 'editing',
  'header.edit.off': 'edit graph',
  'header.edit.title.blueprint':
    'Drag from an agent to a skill to write the relationship into its prompt',
  'header.edit.title.office': 'Only available in the Blueprint: switch view to edit the graph',
  'header.newFlow': 'new flow',
  'header.newFlow.title': 'Compose a slash command',
  'header.search': 'search',
  'header.search.title': 'Search (key /)',
  'header.fit': 'fit',
  'header.fit.title': 'Fit everything (key 0)',
  'header.help.title': 'Help and shortcuts (key ?)',
  'header.lang': 'Language',
  'header.lang.title': 'Switch the interface language',

  'live.disconnected': 'disconnected',
  'live.disconnected.title.stuck':
    'The live-events WebSocket will not connect. If you just restarted the daemon, paste the new link (with its #t=…) into this tab.',
  'live.disconnected.title':
    'No connection to the daemon: live events are not arriving. It retries on its own, more slowly each time.',
  'live.connected': 'live',
  'live.connected.title':
    'Live events from the Claude Code hooks, over WebSocket from the local daemon.',
  'live.sessions_one': '{n} session running',
  'live.sessions_other': '{n} sessions running',

  // Lecturas: cada una cita de qué archivo sale.
  'read.agents': 'agents',
  'read.agents.src': 'Files *.md in {path}',
  'read.agents.unused': 'unused',
  'read.agents.unused.src': 'Agents with not a single delegation in the {transcripts}',
  'read.skills': 'skills',
  'read.skills.src': 'Folders */SKILL.md in {path}',
  'read.skills.unused': 'unused',
  'read.skills.unused.src': 'Skills that show no invocation in the {transcripts}',
  'read.retired': 'retired',
  'read.retired.src': 'Skills with disable-model-invocation: true in their SKILL.md',
  'read.commands': 'commands',
  'read.commands.src': 'Files *.md in {path}',
  'read.commands.unused': 'never run',
  'read.commands.unused.src': 'Commands not typed anywhere in {root}/history.jsonl',
  'read.ratio': 'active ratio',
  'read.ratio.src':
    'Skills with recent use (practicing or certified; the grade expires after 90 days) over the total. Source: {transcripts}',
  'read.declared': 'declared',
  'read.declared.src':
    'Agent→skill pairs that an agent prompt tells it to read (declared layer, agents/*.md)',
  'read.proven': 'proven',
  'read.proven.src': 'Agent→skill pairs with real invocations in the {transcripts}',
  'src.transcripts': 'transcripts in {root}/projects{window}',
  'src.window.all': ', whole history',
  'src.window.days_one': ', last day',
  'src.window.days_other': ', last {n} days',

  // --- Aplicación ---------------------------------------------------------------------------
  'app.loading': 'reading ~/.claude…',
  'app.loading.demo': 'opening the demo office…',
  'app.error.title': "Couldn't read your configuration",
  'app.error.step1': 'Start the daemon: `ai-office`, or `pnpm dev` inside the repo.',
  'app.error.step2':
    'Open the link it prints, which ends in `#t=…`: it carries the token. You can also paste it into this tab; it will reload on its own.',
  'app.error.step3':
    'The token changes every time the daemon starts, so an old link stops working.',
  'app.retry': 'Retry',
  'app.retrying': 'Retrying…',
  'band.retry': 'retry',
  'band.retrying': 'retrying…',
  'band.scan_one': '{n} file could not be read and is missing from what you see',
  'band.scan_other': '{n} files could not be read and are missing from what you see',
  'demo.band':
    'Read-only demo with a fictional install. The flashes replay what is recorded in its transcripts.',
  'demo.install': 'Install it on yours',
  'demo.error':
    'This is a read-only demo with a fictional install. Install ai-office to edit your own configuration: every change shows the diff before writing.',
  'toast.agentOnly': 'Only an agent has a prompt to write the relationship in. Drag from an agent.',
  'toast.alreadyMentions': '{agent} already mentions {skill} in its prompt.',
  'toast.flowSaved': 'Saved the command /{name}.',
  'toast.archived': 'Agent archived. You can restore it from the empty details panel.',
  'toast.unarchived': 'Agent restored.',
  'toast.saved': 'Saved: {title}.',
  'toast.notDrawn.office':
    "The Office doesn't draw this (archived agents, for example). See its details on the right.",
  'toast.notDrawn.current':
    "The current view doesn't draw this (archived agents, for example). See its details on the right.",
  'diff.title.flow': '/{name} · {steps}',
  'diff.title.consult': '{agent} will consult {skill}',
  'diff.title.color': 'color of {name}',
  'diff.title.model': 'model of {name}',
  'diff.title.archive': 'archive {name}',
  'diff.title.restore': 'restore {name}',
  'diff.title.retire': 'retire {name}',
  'diff.title.unretire': 'reactivate {name}',

  // --- Contadores y tiempo ------------------------------------------------------------------
  'count.steps_one': '{n} step',
  'count.steps_other': '{n} steps',
  'count.uses_one': '{n} use',
  'count.uses_other': '{n} uses',
  'count.delegations_one': '{n} delegation',
  'count.delegations_other': '{n} delegations',
  'count.skillsUsed_one': '{n} skill used',
  'count.skillsUsed_other': '{n} skills used',
  'count.skills_one': '{n} skill',
  'count.skills_other': '{n} skills',
  'time.never': 'never',

  'grade.unused': 'unused',
  'grade.tried': 'tried',
  'grade.practicing': 'practicing',
  'grade.certified': 'certified',

  'kind.agent': 'agent',
  'kind.skill': 'skill',
  'kind.command': 'command',
  'kind.mcp': 'MCP server',
  'kind.main': 'main thread',
  'kind.live': 'live',
  'main.thread': 'main thread (you)',

  // --- Salas (despachos) --------------------------------------------------------------------
  'room.hub': 'lobby',
  'room.hub.reason': 'The main thread, the archive of what half the floor uses and the depot.',
  'room.unlinked': 'unlinked',
  'room.reason.skill.one': 'Cites `{name}` in its prompt, and shares it with no one.',
  'room.reason.skill.all': 'All {total} cite `{name}` in their prompt.',
  'room.reason.skill.some': '{cuantos} of the {total} cite `{name}` in their prompt.',
  'room.reason.command.one': 'Called by /{name}, and by no other command.',
  'room.reason.command.all': 'All {total} are called by /{name}.',
  'room.reason.command.some': '{cuantos} of the {total} are called by /{name}.',
  'room.reason.loose.one': 'Its prompt cites no skill and no command calls it.',
  'room.reason.loose.many': 'They share no skill and no command.',

  // --- Sala (Pixi) --------------------------------------------------------------------------
  'tip.agent.never': '{name} · never delegated to',
  'tip.agent': '{name} · {delegations} · {grade}',
  'tip.skill.never': '{name} · never used',
  'tip.skill': '{name} · {uses} · {grade}',
  'tip.skill.owner': ' · mostly {owner}',
  'tip.command.run': '/{name} · run',
  'tip.command.never': '/{name} · never run',
  'tip.main': '{name} · {skills}',

  'office.loading': 'Opening the office…',
  'office.legend.summary': 'how to read the office',
  'office.legend.grey':
    '**Grey person**: an agent you have never delegated to. In color: it has worked.',
  'office.legend.spine':
    "**Spine height**: the skill's grade (unused, tried, practicing, certified). Its color is the agent that uses it most.",
  'office.legend.nolabel': '**Spine with no gold label**: a skill that has never been used.',
  'office.legend.shelves':
    '**Shared archive** (high shelf in the lobby): skills cited by half the floor. **Depot** (low shelf): skills no agent cites.',
  'office.legend.card': '**Card with a red pin**: a command that has been run; grey, never.',
  'office.legend.plate': '**Door plate**: hover to see why those agents share a room.',

  // --- Ayuda y bienvenida -------------------------------------------------------------------
  'help.title': 'Help',
  'help.keys.title': 'Keyboard shortcuts',
  'help.key.office': 'show the Office',
  'help.key.blueprint': 'show the Blueprint',
  'help.key.search': 'search for an agent, skill or command and take the view to it',
  'help.key.zoom': 'zoom in or out',
  'help.key.fit': 'fit everything',
  'help.key.esc': 'close the open dialog or clear the selection',
  'help.key.help': 'open this help',
  'help.keys.note': 'Shortcuts do nothing while you type in a text field or with a dialog open.',
  'help.office.title': 'How to read the Office',
  'help.office.room':
    'Each **room** groups agents that cite the same skills or are called by the same commands; the plate on the door says why.',
  'help.office.grey':
    '**Grey person**: an agent you have never delegated to. In color: it has worked.',
  'help.office.spine':
    '**Spine** of a skill: its height is the grade (unused, tried, practicing, certified) and its color, the agent that uses it most. No gold label: never used.',
  'help.office.shelves':
    '**Shared archive**: skills cited by half the floor. **Depot**: skills no agent cites.',
  'help.office.card':
    '**Card** pinned to the partition: a command. Red pin, it has been run; grey, never.',
  'help.blueprint.title': 'How to read the Blueprint',
  'help.blueprint.lines':
    '**Dotted** line: what your prompts say should happen. **Solid green** line: what the transcripts prove happened. The distance between the two is the work left to do.',
  'help.blueprint.shapes':
    'Circle: agent. Square: skill. Rectangle: command. Empty fill: never used.',
  'help.blueprint.edit':
    '**edit graph** (Blueprint only): drag from an agent to a skill to write that relationship into its prompt. The diff is always shown before touching the file.',
  'help.ok': 'Got it',
  'welcome.aria': 'Welcome',
  'welcome.title':
    'This is your Claude Code configuration, cross-checked against what actually happened',
  'welcome.office':
    '**Office**: an office where each agent is a person, each skill a spine on a shelf and each command a card. Grey is what you have never used.',
  'welcome.blueprint':
    '**Blueprint**: the same catalog as a graph. Dotted = what your prompts say; solid = what the transcripts prove.',
  'welcome.details':
    '**Details** (on the right): click anything to see what it says about itself, what it has done and which file each fact comes from. From there you can edit it, always with a diff.',
  'welcome.shortcuts': 'See shortcuts',

  // --- Panel de detalle ---------------------------------------------------------------------
  'detail.aria': 'Details',
  'detail.aria.of': 'Details of {name}',
  'detail.explain.office':
    "Every figure, spine and card in the Office comes from one of your files. A grey person is an agent you have never delegated to; the height of a spine is the skill's grade, and a spine with no gold label is a skill that has never been used. Click anything to see its details.",
  'detail.explain.blueprint':
    'Every line in the blueprint comes from one of your files. Dotted ones are what your prompts say should happen; solid ones, what the transcripts prove happened.',
  'detail.reads': 'what is read',
  'detail.archivedList': 'archived ({n})',
  'detail.restore': 'restore',
  'detail.archivedNote':
    'They live in the archive folder inside `agents/` and are not drawn in the Office or the Blueprint.',
  'detail.missing': 'This entity shows up in the history but no longer exists on disk.',
  'detail.archivedTag': ' · archived',
  'detail.service': 'track record',
  'detail.mainSkills': 'skills it has used',
  'detail.uses': 'recorded uses',
  'detail.sessionsProjects': 'sessions · projects',
  'detail.lastUsed': 'last used',
  'detail.grade': 'grade',
  'detail.edit': 'edit',
  'detail.color': 'color',
  'detail.color.none': 'unset',
  'detail.model': 'model',
  'detail.model.inherit': 'inherited',
  'detail.archive.button': 'archive this agent',
  'detail.archive.note':
    'Archiving moves it to the archive folder. Nothing is deleted and you can undo it.',
  'detail.archived': 'archived',
  'detail.unarchive.button': 'restore this agent',
  'detail.unarchive.note':
    'Moves it back to `agents/`. While archived it does not show up in the Office.',
  'detail.retire.button': 'retire this skill',
  'detail.unretire.button': 'reactivate this skill',
  'detail.retire.note':
    "Retiring writes `disable-model-invocation`: it stops competing for the model's attention, you can still invoke it by hand, and your active ratio goes up.",
  'detail.definition': 'definition',
  'detail.def.tools': 'tools',
  'detail.def.tools.all': 'all',
  'detail.def.preloaded': 'preloaded skills',
  'detail.def.promptSize': 'prompt size',
  'detail.def.tokens': '~{n} tokens',
  'detail.def.description': 'description',
  'detail.def.descriptionTokens': '~{n} tokens per session',
  'detail.def.body': 'body',
  'detail.def.bodyTokens': '~{n} tokens when invoked',
  'detail.def.eligible': 'picked by the model',
  'detail.yes': 'yes',
  'detail.no': 'no',
  'detail.vocab': 'words you have never typed',
  'detail.openFlow': 'open in the flow editor',
  'detail.ev.proven': 'what it has done',
  'detail.ev.preloaded': 'preloaded in `skills:`',
  'detail.ev.declared': 'skills its prompt tells it to read',
  'detail.ev.commands': 'commands that call it',
  'detail.ev.skills': 'skills that name it',
  'detail.ev.field': ' · field {field}',
  'detail.file': 'file',
  'detail.visibleAs': 'visible as {path}',

  // --- Buscador -----------------------------------------------------------------------------
  'search.title': 'Search agent, skill or command',
  'search.label': 'Name of what you are looking for',
  'search.placeholder': 'type a name…',
  'search.results': 'Results',
  'search.none': 'Nothing matches what you typed.',
  'search.count_one': '{n} result · ↑↓ to move, Enter to choose, Esc to close',
  'search.count_other': '{n} results · ↑↓ to move, Enter to choose, Esc to close',
  'search.main.detail': 'your session, no subagent',

  // --- Diálogos -----------------------------------------------------------------------------
  'dialog.keepEditing': 'Keep editing',
  'diff.cancel': 'Cancel',
  'diff.saving': 'Saving…',
  'diff.save': 'Save to file',
  'diff.noChange':
    'This change does not modify the file: the content that would be written is identical to what is already there, so there is nothing to save.',
  'toast.close': 'Close the notice',

  // --- Editor de flujos ---------------------------------------------------------------------
  'flow.title': 'Flow /{name}',
  'flow.untitled': 'unnamed',
  'flow.name': 'name',
  'flow.name.placeholder': 'weekly-review',
  'flow.description': 'description',
  'flow.description.placeholder': 'What this command does, for the / menu',
  'flow.noAgents':
    'There is no agent in your catalog, and a flow is a sequence of delegations to agents. Create one in `~/.claude/agents/` and reopen the editor.',
  'flow.noSteps': 'No steps yet. A flow is a sequence of delegations: add the first one.',
  'flow.parallel': '↳ in parallel',
  'flow.phase': 'phase {n}',
  'flow.join': 'join',
  'flow.join.title': 'Run in parallel with the previous step',
  'flow.split': 'split',
  'flow.split.title':
    'Take this step out of the group: it starts a new phase, after the previous step',
  'flow.up': 'Move up',
  'flow.up.aria': 'Move step {n} up',
  'flow.down': 'Move down',
  'flow.down.aria': 'Move step {n} down',
  'flow.remove': 'Remove',
  'flow.remove.aria': 'Remove step {n}',
  'flow.agent.aria': 'Agent of step {n}',
  'flow.agent.unknown': '(unknown: {agent})',
  'flow.agent.none': 'no agent',
  'flow.agent.unknownNote':
    'This step names an agent that is not in your catalog (did you delete or archive it?). Pick another or it will be written as is.',
  'flow.task.placeholder': 'what you ask of it',
  'flow.task.aria': 'Task of step {n}',
  'flow.skill.add': '+ skill it should consult',
  'flow.skill.add.aria': 'Add a skill to step {n}',
  'flow.skill.remove': 'remove',
  'flow.skill.remove.aria': 'Remove the skill {name}',
  'flow.add': '+ add step',
  'flow.preview': 'what will be written',
  'flow.preview.failed': '(could not generate the preview)',
  'flow.missing.name': 'give the command a name',
  'flow.missing.steps': 'add at least one step',
  'flow.missing.agent': 'pick the agent of each step',
  'flow.missing.task': 'write what you ask of each agent',
  'flow.missing': 'To save: {list}.',
  'flow.cancel': 'Cancel',
  'flow.save': 'Review diff and save',
  'flow.discard.title': 'Discard the changes?',
  'flow.discard.text':
    'You have edited this flow and nothing has been saved to disk yet. If you leave now, what you have is lost.',
  'flow.discard.confirm': 'Discard and leave',

  // --- Blueprint ----------------------------------------------------------------------------
  'plano.aria': 'Blueprint graph of agents, skills and commands',
  'plano.layer.declared': 'declared in prose',
  'plano.layer.preloaded': 'preloaded in `skills:`',
  'plano.layer.proven': 'proven in the history',
  'plano.node.aria': '{kind} {name}',
  'plano.main':
    'The main thread is you, not a file: there is no prompt to write the relationship in. Drag from an agent.',
  'plano.drop': 'Drop onto a skill to create the relationship.',
  'plano.editHint':
    'Edit mode: drag from an agent to a skill to write the relationship into its prompt.',

  // --- Errores ------------------------------------------------------------------------------
  'err.red':
    "Can't reach the ai-office daemon. Is it running? Run `ai-office` (or `pnpm dev` in the repo) in a terminal and open the link it prints.",
  'err.auth':
    'The daemon rejected the token. It changes on every start: copy the new link that `ai-office` prints (it ends in #t=…) and paste it into this tab.',
  'err.conflict':
    'The file changed on disk while you were editing it. Review the change and save again, so nothing another tool wrote gets overwritten.',
  'err.json':
    "The server answered with something that isn't JSON. This is usually the dev server with no daemon behind it: start `pnpm dev` and reload.",
  'err.http': 'The server responded {status}',
  'err.code.forbidden-host':
    'The daemon refused this request: the host is not allowed. Open the app from the link `ai-office` prints.',
  'err.code.forbidden-origin':
    'The daemon refused this request: it comes from an origin that is not allowed. Open the app from the link `ai-office` prints.',
  'err.code.missing-header':
    'The request is missing the `x-ai-office` header. Reload the page; if it persists, the interface and the daemon are out of sync.',
  'err.code.not-found':
    'The daemon could not find what was asked for. It may have been moved or deleted: reload.',
  'err.code.invalid-request': 'The daemon rejected the request as invalid.',
  'err.code.internal': 'The daemon failed internally. Check its terminal for details.',

  'err.reason.entity-not-found':
    'That entity does not exist ({id}). Reload to see the current catalog.',
  'err.reason.command-not-found': 'The command {id} does not exist.',
  'err.reason.invalid-color': 'Invalid color: "{color}".',
  'err.reason.unknown-operation':
    'Unknown operation: {kind}. The interface and the daemon may be out of sync.',
  'err.reason.already-archived': '{name} is already archived.',
  'err.reason.not-archived': '{name} is not archived.',
  'err.reason.path-outside-roots': 'That path is outside the folders ai-office may edit: {path}',
  'err.reason.target-exists':
    'A file already exists at {path}: rename or move it first, so it is not overwritten.',
  'err.reason.symlink-archive':
    '{path} is a symbolic link: archive the agent at its source, not at the projection.',
  'err.reason.file-exists':
    'A file already exists at {path}: use the edit operation, not the create one.',
  'err.reason.invalid-name':
    'The name "{name}" is not valid for a command: use at least one letter or number.',
  'err.reason.section-unclosed': 'Section "{section}": start marker found but no end marker.',
  'err.reason.no-frontmatter': 'Cannot edit: the file has no frontmatter.',

  // --- Avisos de un plan y problemas de una entidad (los trae el daemon con `code`) ----------
  'warn.unknown-model':
    '"{model}" is not one of the known aliases ({known}); it is saved anyway as a literal model id.',
  'warn.broken-citation': 'Broken citation: "{skill}" does not exist in the skills catalog.',
  'warn.preload-cost':
    'Preloading adds no capability: the subagent could invoke these skills on demand anyway if it needed them. It only brings the cost forward: ~{tokens} estimated tokens at every start.',
  'warn.handwritten-command':
    'You wrote this command by hand. Saving from the canvas replaces it with the compiled version: review the diff, because whatever the canvas could not import is lost.',
  'problem.no-frontmatter': 'No frontmatter.',
  'problem.unclosed-frontmatter': 'Unclosed frontmatter.',
  'problem.yaml-error': 'YAML: {detail}',
  'problem.yaml-unreadable': 'Unreadable YAML: {detail}',
  'problem.frontmatter-not-object': 'The frontmatter is not an object.',
  'problem.agent-no-description': 'No description: the model will not know when to delegate to it.',
  'problem.skill-no-description': 'No description: the model will never pick it on its own.',
  'problem.name-mismatch': 'The name "{name}" does not match the file name.',
  'problem.no-skill-md': 'No readable SKILL.md.',
  'detail.problems': 'problems',
} satisfies Record<string, string>
