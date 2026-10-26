/**
 * La instalación de demostración: un estudio de software ficticio con su plantilla de agentes,
 * skills y comandos.
 *
 * Existe por tres motivos que comparten la misma fuente: `ai-office demo` (probar la interfaz sin
 * tocar la configuración propia), la demo estática de la página del proyecto y las capturas del
 * README. Todo en inglés a propósito: es lo que verá quien llegue desde fuera.
 *
 * Está escrita como lo escribiría una persona, con la misma prosa que hace interesante al
 * producto: los agentes citan skills en el cuerpo de su prompt y los comandos nombran a los
 * agentes que convocan. Ningún campo estructurado declara esas relaciones, igual que en una
 * instalación real.
 */

export interface DemoAgent {
  name: string
  description: string
  model?: string
  color?: string
  tools?: string
  /** Prosa del cuerpo. Las skills se citan aquí, no en un campo. */
  body: string
}

export interface DemoSkill {
  name: string
  description: string
  body: string
}

export interface DemoCommand {
  name: string
  description: string
  body: string
}

const read = (skill: string): string => `\`~/.claude/skills/${skill}/SKILL.md\``

export const DEMO_AGENTS: DemoAgent[] = [
  {
    name: 'code-reviewer',
    description:
      'Reviews a diff or a branch before it is merged. Use when the user says "review this", before a release, or after a large refactor.',
    model: 'sonnet',
    color: 'blue',
    tools: 'Read, Grep, Glob, Bash',
    body: `You review code the way a careful senior engineer would: correctness first, then clarity.

Before reviewing, read ${read('style-guide')} and ${read('team-context')}.
When the change touches an HTTP endpoint, check it against \`api-conventions\`.
For anything performance-sensitive, compare against the budgets in \`perf-budget\`.

Report findings ranked by severity, each with file:line and a concrete failure scenario.`,
  },
  {
    name: 'test-writer',
    description:
      'Writes and repairs automated tests. Use when coverage is missing, a test is flaky, or a bug needs a regression test.',
    model: 'sonnet',
    color: 'green',
    body: `You write tests that fail for the right reason.

Follow the patterns in ${read('test-patterns')}. Name tests after behaviour, not functions.
Test code follows \`style-guide\` like any other code.
Before writing anything, skim ${read('team-context')} to learn which suites are slow.`,
  },
  {
    name: 'release-manager',
    description:
      'Prepares and ships releases: version bump, changelog, tag, notes. Use for /ship or whenever a version goes out.',
    model: 'haiku',
    color: 'orange',
    body: `You own the release checklist.

1. Decide the version with ${read('semver')}.
2. Write the entry following \`changelog\` and the public notes following \`release-notes\`.
3. Use the branching rules in \`git-workflow\`. Never push a tag without the user's go-ahead.

Commit messages follow \`style-guide\`. Read ${read('team-context')} for who must approve.`,
  },
  {
    name: 'security-auditor',
    description:
      'Audits dependencies, secrets and attack surface. Use before a release, after adding a dependency, or when the user asks "can we be hacked?".',
    model: 'opus',
    color: 'red',
    body: `You think like an attacker and write like a lawyer.

Start from the model in ${read('threat-model')}. For third-party code, run the checks in \`dependency-audit\`.
Cite every finding with the file and line that proves it.`,
  },
  {
    name: 'docs-writer',
    description:
      'Writes and updates documentation: READMEs, guides, API references. Use when a feature ships without docs.',
    color: 'purple',
    body: `You write documentation people actually read.

Match the voice in ${read('docs-voice')} and the terminology in \`team-context\`.
For anything translated, check \`i18n-guide\`.`,
  },
  {
    name: 'researcher',
    description:
      'Researches a technical question across papers, docs and issues, and returns a cited summary. Use for "what is the state of the art" or library comparisons.',
    model: 'opus',
    color: 'cyan',
    body: `You answer with sources, never from memory.

Keep notes as described in ${read('research-notes')} and cite them with \`citation-format\`.`,
  },
  {
    name: 'data-analyst',
    description:
      'Answers questions with data: SQL against the warehouse, charts, weekly metrics. Use for numbers, dashboards and the weekly report.',
    model: 'sonnet',
    color: 'yellow',
    body: `You query, you check, then you chart.

Write queries with ${read('sql-recipes')}. Every chart uses the palette in \`chart-palette\`.
Metric names are defined in \`team-context\`.
If a query is slow, hand it to \`sql-tuner\` instead of guessing.`,
  },
  {
    name: 'sql-tuner',
    description:
      'Optimises slow SQL queries and indexes. Use when a query takes seconds or an EXPLAIN looks wrong.',
    model: 'sonnet',
    body: `You read query plans for a living.

Start from ${read('sql-recipes')} and respect the limits in \`perf-budget\`.`,
  },
  {
    name: 'frontend-designer',
    description:
      'Designs and builds UI components with the design system. Use for new screens, visual polish or a component that "looks off".',
    color: 'pink',
    body: `You care about the last pixel.

Use the tokens in ${read('design-tokens')}. Export assets as described in \`figma-export\`.
Product vocabulary lives in \`team-context\`.
Every component passes \`a11y-checklist\` before it is done.`,
  },
  {
    name: 'accessibility-checker',
    description:
      'Checks screens and components against WCAG 2.2 AA. Use before a release or when a user reports they cannot use something.',
    body: `You test with a keyboard and a screen reader, not with your eyes.

Work through ${read('a11y-checklist')} and file each issue with the component that fails.`,
  },
  {
    name: 'support-triage',
    description:
      'Triages incoming support tickets and bug reports, reproduces them and routes them. Use when the support queue grows.',
    body: `You turn angry emails into reproducible bug reports.

Use \`incident-runbook\` when something is down and ${read('team-context')} to know who owns what.`,
  },
  {
    name: 'product-strategist',
    description:
      'Thinks through product and pricing decisions and writes one-page memos. Use for "should we build X" or pricing changes.',
    model: 'opus',
    body: `You recommend, you do not execute.

Ground every memo in ${read('interview-notes')} and the numbers in \`pricing-model\`.
When you need outside evidence, keep it the way \`research-notes\` says and cite it with \`citation-format\`.`,
  },
  {
    name: 'copy-editor',
    description:
      'Edits copy for clarity and tone: landing pages, emails, release notes. Use for anything public-facing.',
    model: 'haiku',
    body: `You cut words.

Follow ${read('docs-voice')} and, for release notes, \`release-notes\`.
Translated copy follows \`i18n-guide\`.`,
  },
  {
    name: 'infra-watch',
    description:
      'Watches production health: deploys, error rates, disk and certificates. Use when something is slow or down.',
    model: 'sonnet',
    body: `You diagnose; you never restart anything without asking.

Follow ${read('incident-runbook')} and the cluster notes in \`k8s-cheatsheet\`.`,
  },
]

const skill = (name: string, description: string, body = ''): DemoSkill => ({
  name,
  description,
  body: body || `# ${name}\n\nNotes and rules for ${name.replace(/-/g, ' ')}.`,
})

export const DEMO_SKILLS: DemoSkill[] = [
  skill(
    'team-context',
    'Who owns what, which services exist, and the vocabulary the team uses. Read before any task that touches more than one service.',
  ),
  skill(
    'style-guide',
    'Code style and naming conventions for TypeScript and Go in this codebase. Use when writing or reviewing code.',
  ),
  skill(
    'api-conventions',
    'REST conventions: resource naming, pagination, error shapes and versioning. Use when designing or reviewing an endpoint.',
  ),
  skill(
    'perf-budget',
    'Performance budgets per page and per endpoint. Use when a change could make something slower.',
  ),
  skill(
    'test-patterns',
    'How we write tests: fixtures, fakes, naming, and what not to mock. Use when writing or fixing tests.',
  ),
  skill('semver', 'Rules for picking the next version number. Use when preparing a release.'),
  skill('changelog', 'Format for CHANGELOG.md entries. Use when a change ships.'),
  skill(
    'release-notes',
    'How to write public release notes users actually read. Use when announcing a version.',
  ),
  skill('git-workflow', 'Branching, commit messages, rebasing and tags. Use for anything git.'),
  skill(
    'threat-model',
    'The threat model of the product: assets, attackers and trust boundaries. Use for security reviews.',
  ),
  skill(
    'dependency-audit',
    'Checklist for vetting a new third-party dependency. Use before adding a package.',
  ),
  skill(
    'docs-voice',
    'Voice and tone for documentation and public copy. Use when writing anything a user will read.',
  ),
  skill('i18n-guide', 'How strings are translated and pluralised. Use when adding UI text.'),
  skill(
    'research-notes',
    'How to keep research notes so they can be cited later. Use when investigating a question.',
  ),
  skill('citation-format', 'Citation format for internal memos and docs.'),
  skill(
    'sql-recipes',
    'Tested SQL snippets for the warehouse: cohorts, retention, funnels. Use when writing a query.',
  ),
  skill(
    'chart-palette',
    'Colours and rules for charts in reports and dashboards. Use whenever a chart is made.',
  ),
  skill('design-tokens', 'Design tokens: colour, spacing, type scale. Use when building UI.'),
  skill('figma-export', 'How to export assets from Figma at the right sizes.'),
  skill(
    'a11y-checklist',
    'WCAG 2.2 AA checklist adapted to our components. Use before shipping UI.',
  ),
  skill(
    'incident-runbook',
    'What to do when production is down: who to call, where to look, what not to touch.',
  ),
  skill('k8s-cheatsheet', 'Commands and gotchas for the production cluster.'),
  skill(
    'interview-notes',
    'Summaries of customer interviews, tagged by theme. Use for product decisions.',
  ),
  skill('pricing-model', 'Current pricing, costs per seat and margins.'),
  skill(
    'legacy-migration',
    'Plan and notes for migrating the old billing service. Use when touching billing.',
  ),
  skill('onboarding', 'First-week guide for new teammates: accounts, repos and rituals.'),
  skill('meeting-notes', 'Template for meeting notes and decisions log. Use after a meeting.'),
  skill('okr-template', 'Template and examples for quarterly OKRs.'),
]

export const DEMO_COMMANDS: DemoCommand[] = [
  {
    name: 'ship',
    description: 'Review, test and release the current branch',
    body: `Ship the current branch.

1. Delegate to the \`code-reviewer\` agent: review the diff against main.
2. In parallel, ask \`test-writer\` to add tests for anything the review flags as untested.
3. When both are done, hand off to \`release-manager\` to cut the release with \`changelog\`.`,
  },
  {
    name: 'review',
    description: 'Full review of a pull request',
    body: `Review the pull request in $ARGUMENTS.

- \`code-reviewer\`: correctness and style.
- \`security-auditor\`: secrets, injection, new dependencies.
- \`accessibility-checker\`: only if the diff touches UI.

Merge the three reports into one, ranked by severity.`,
  },
  {
    name: 'weekly-report',
    description: 'Build the weekly metrics report',
    body: `Ask \`data-analyst\` for the weekly numbers using \`sql-recipes\` and \`chart-palette\`.
Then have \`copy-editor\` tighten the summary.`,
  },
  {
    name: 'research',
    description: 'Research a question and write it up',
    body: `Delegate to \`researcher\` with the question in $ARGUMENTS.
When the notes are ready, \`docs-writer\` turns them into a page.`,
  },
  {
    name: 'launch',
    description: 'Prepare a product launch',
    body: `1. \`product-strategist\` writes the positioning memo.
2. \`frontend-designer\` builds the landing page.
3. \`copy-editor\` edits every public word.`,
  },
  {
    name: 'incident',
    description: 'Respond to a production incident',
    body: `Delegate to \`infra-watch\` to diagnose, and to \`support-triage\` to collect user reports.
Follow \`incident-runbook\`.`,
  },
  {
    name: 'audit-deps',
    description: 'Audit third-party dependencies',
    body: 'Ask `security-auditor` to run `dependency-audit` on the lockfile.',
  },
  {
    name: 'docs-sync',
    description: 'Bring the docs up to date with the code',
    body: 'Ask `docs-writer` to compare the README and the guides with the current code.',
  },
]
