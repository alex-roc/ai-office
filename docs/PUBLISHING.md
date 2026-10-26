# Publishing `ai-office` to npm

[Español](es/PUBLICAR.md)

This document lists the steps to publish the `ai-office` package (what currently lives in
`packages/cli`). Read it alongside `tsdown.config.ts`, which explains the reasoning behind the
strategy.

## The strategy, in short

The monorepo has five packages (`core`, `providers`, `daemon`, `hook-relay`, `cli`) tied together by
`workspace:*`. **Only one** is published: `ai-office`. `core` + `providers` + `daemon` + `cli` are
transpiled from TypeScript to JavaScript with [tsdown](https://tsdown.dev) in **`unbundle` mode**
(`unbundle: true`, `root: '.'`): each file is compiled separately and the output keeps the same
folder depth it has today inside the monorepo, only under `packages/cli/dist/`.

That is not a bundler's default (which would fuse everything into one `index.js`), and it is
deliberate: two files compute a path by hand with `dirname(fileURLToPath(import.meta.url))` plus a
fixed chain of `..`, assuming the exact depth of the monorepo —
`packages/daemon/src/server.ts` (to find `apps/web/dist` and serve the UI) and
`packages/cli/src/commands/hooks.ts` (to find `packages/hook-relay/bin/`). A flat bundle breaks that
depth and silently breaks them (the web UI stops being served, or `ai-office hooks install` writes a
path to the relay that doesn't exist). `unbundle` with `root: '.'` reproduces the same depth inside
`dist/`, so neither file needs to be touched. `scripts/build.sh` then copies, at the relative paths
needed to complete that same structure, what must not go through any bundler: `apps/web/dist`
(already built by Vite) and `packages/hook-relay/bin/ai-office-hook.mjs` (plain JavaScript, as is).

Imports between `@ai-office/core`, `@ai-office/providers` and `@ai-office/daemon` are resolved in
`tsdown.config.ts` with an explicit `alias` to their source files, not through the pnpm symlink in
`node_modules`: that way the build doesn't depend on whether the workspace has them linked, and
`packages/cli/package.json` can be published without pretending they are real npm packages.

**Alternative that was rejected**: publishing the raw TypeScript (Node ≥ 22.18 runs it natively, no
build). It is simpler, but it requires resolving the `import`s between packages without a real
`node_modules` (unpublished packages cannot be installed), which forces rewriting specifiers by hand
anyway. Compiling with `unbundle` is just as simple at publish time without that problem, and it
validates types and syntax at build time as a bonus.

## What IS published

- `dist/` — the output of `pnpm build` (see below). All `.mjs`, no `.ts`.
- The hook relay, copied as is: `dist/packages/hook-relay/bin/ai-office-hook.mjs`.
- The web UI's static files, already built: `dist/apps/web/dist/`.
- `README.md` and `LICENSE`, copied from the repo root (that is why they are in `.gitignore` inside
  `packages/cli/`: they are build artifacts, not files versioned there).

Real dependencies in `packages/cli/package.json` (the only thing an `npm install ai-office`
installs): `yaml`, `fastify`, `@fastify/static`, `@fastify/websocket`. `@ai-office/core`,
`@ai-office/providers` and `@ai-office/daemon` are in `devDependencies` with `workspace:*` **only**
so `pnpm` links them during development (typecheck, `pnpm dev`, editor); they are not installed when
installing the published package and do not appear in the final bundle as separate packages.

## What is NOT published, and why

- `packages/{core,providers,daemon,hook-relay}/` as packages of their own: there is no point
  publishing them separately if nobody else is going to install them, and every extra package is one
  more version to keep in sync.
- The `.ts` sources of `apps/web/src`: only `apps/web/dist` is published, already built.
- `node_modules`, tests, transcripts, anyone's `.claude`: `npm pack` excludes them by default (and
  `scripts/verificar-paquete.sh` checks it instead of taking it for granted).
- `.claude-plugin/`, `hooks/`, `commands/`, `bin/ai-office`: they are the distribution as a **Claude
  Code plugin**, a separate mechanism (see below). They are not part of the npm package.

## Before publishing

1. Check that `repository`/`homepage`/`bugs` in `packages/cli/package.json` point to
   `github.com/alex-roc/ai-office`.
2. Bump the version (`packages/cli/package.json`, `version` field) following semver.
3. `pnpm install && pnpm test && pnpm typecheck` all green.
4. `pnpm build` (builds the web, transpiles the CLI, copies the relay and the static files).
5. `pnpm verificar:paquete` — generates the tarball with `npm pack`, audits its contents and
   installs it in a temporary directory outside the repo to really try `ai-office --help` and
   `ai-office censo`, the way someone with `npx @alex-roc/ai-office` would. If this doesn't pass, you don't
   publish.
6. Review the tarball by hand if anything gives you doubts: `npm pack --dry-run` from `packages/cli/`
   lists the contents without generating the file.

## Publishing

The package is **`@alex-roc/ai-office`** (npm rejected the bare `ai-office` as too similar to the
existing `aioffice`); the installed command is still `ai-office`.

**Normal way: a GitHub release.** `.github/workflows/release.yml` publishes to npm when a release
is published, through **trusted publishing** (OIDC): npm trusts that workflow, so there is no
`NPM_TOKEN` secret, no one-time password, and every version ships with signed provenance. The
workflow runs lint, typecheck, tests, the build and `verificar:paquete`, and refuses to publish if
the version in `packages/cli/package.json` doesn't match the release tag.

```bash
# 1. bump the version (packages/cli/package.json, plugin.json, CHANGELOG) and commit
# 2. create the release; CI publishes it
gh release create v0.2.0 --title "ai-office 0.2.0" --notes-file notes.md
```

**One-time setup** (done by the account owner, logged in to npm; it changes account settings, so
an agent must not do it on its own):

```bash
npm trust github @alex-roc/ai-office --file release.yml --repo alex-roc/ai-office
npm trust list @alex-roc/ai-office      # check it
```

It needs **2FA enabled on the npm account** (a passkey or Touch ID is enough, no authenticator app)
and npm ≥ 11.15 for `npm trust`; an E400 usually means one of those is missing. The same setup can
be done on the website instead: the package → *Settings* → *Trusted Publisher* → *GitHub Actions*
(owner `alex-roc`, repo `ai-office`, workflow `release.yml`). This package allows direct `npm publish`
(checked by the owner); npm's default is staged publishing, approved on the website. The connection
is "pending validation" until the first publish through it, then "Valid" (done with 0.1.1).

Requirements: npm ≥ 11.5.1 in CI (the workflow updates it), GitHub-hosted runners, and
`id-token: write`. Sources: [trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

**By hand** (fallback): from `packages/cli/`, logged in (`npm whoami`), `npm publish --access public`.
npm may ask to confirm in the browser; `npm login` and that confirmation need an interactive
terminal, not an agent's shell.

## Relationship with the Claude Code plugin

`ai-office` has two independent distribution routes:

| Route | What it installs | Where it lives |
|---|---|---|
| **npm** (`npx @alex-roc/ai-office`) | the compiled CLI, to use from the terminal | `packages/cli` → this document |
| **Claude Code plugin** (`claude plugin install`) | the hooks and the `/censo` command, without touching `settings.json` | `.claude-plugin/`, `hooks/`, `commands/`, `bin/ai-office` |

They are different mechanisms and are not mixed: the plugin runs `bin/ai-office`, which launches
`packages/cli/src/index.ts` **directly as TypeScript** (Node runs it natively, no build needed) from
an install of the plugin's own monorepo. The npm package, on the other hand, exists so you can type
`npx @alex-roc/ai-office` without cloning anything. `claude plugin validate .` remains the plugin's check and
is independent of everything in this document.

Both routes ship the same interface and CLI, in English by default with Spanish selectable
(`--lang es` / `AI_OFFICE_LANG=es` for npm, the `language` option for the plugin): see the
"Internationalization" section in [ARCHITECTURE](ARCHITECTURE.md).
