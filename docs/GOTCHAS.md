# Gotchas that already cost us time

[Español](es/GOTCHAS.md)

Each of these cost at least one debugging session. Read them before touching the Office, the
Blueprint, the daemon, the hooks, or what is written to Claude Code's files (plugins, MCP, scope):
almost all of them fail **silently**.

**CSS variables in SVG.** A presentation attribute (`fill="var(--ink)"`, `stroke="var(--x)"`) does
NOT resolve CSS variables: the element is drawn invisible, with no error in the console. Colors
always go through `style={{ fill, stroke }}`, which is a CSS property and does work. It happened in
`Plano.tsx` and cost a debugging session with the DOM correct and a blank screen.

**d3-force inside React.** Don't animate the simulation with `requestAnimationFrame` + `setState`:
with StrictMode the double mount leaves the layout collapsed at the origin, and it also contradicts
the rule of keeping 60 fps state out of React. The layout is computed once (`sim.stop()` + N ticks)
and frozen; it stays deterministic and pan/zoom are the only interactive parts.

**pnpm 11 and build scripts.** Approval goes in `pnpm-workspace.yaml` under the key
`allowBuilds: { esbuild: true }`. Neither `onlyBuiltDependencies` in `package.json` nor in `.npmrc`
works in this version, and `pnpm approve-builds` writes a duplicate key that breaks the YAML.

**Vite listens on IPv6 and the daemon on IPv4.** The dev server answers on `localhost` (`::1`) but
not on `127.0.0.1`; the daemon only on `127.0.0.1`, on purpose. Vite's proxy joins them, and it needs
**`ws: true`** or the WebSocket upgrade is not forwarded: the UI silently ends up with no live events
and no error.

**The Fastify guard is bypassed with an encoded path.** Deciding on a raw `req.url`
(`startsWith('/api/')`) lets `POST /%61pi/mutations/apply` through without a token: find-my-way
decodes percent-encoding BEFORE routing, so the `/api/...` handler runs even though the guard doesn't
see `/api`. The guard decides on the normalized path (decoded, double too, with `//`, `..` and case
resolved) and on the one the router resolved, and treats what is public as an exact whitelist, not
the other way round. Covered by `packages/daemon/test/auth.test.ts`, including a real HTTP request.

**YAML frontmatter is not written with templates.** A raw `description: ${text}` is an injection: a
`:` or a `#` breaks it, and a newline followed by `allowed-tools: Bash(*)` adds a key that Claude
Code obeys. `compileFlow` emits the frontmatter with the `yaml` library, and free-form notes are
sanitized so they cannot open another `---` block or forge the flow markers. Same care with agent
names when building a `RegExp`: they are escaped.

**The WebSocket cannot authenticate by header.** An upgrade request carries no `Authorization`, so
the guard lets `/api/live` through and the token travels in the first frame. If that exception is
forgotten, the socket opens and closes without saying why.

**The token changes on every daemon start.** Pasting the new link into an already open tab only
changes the hash and doesn't reload the page, so reading the token once at module load leaves the UI
dead with 401 and no explanation. It is re-read on every request and `hashchange` is listened to.

**The hook knows names, not identities.** An event carries `skill: "style-guide"`, not the catalog
id. The daemon resolves it when publishing, which is where the catalog exists; without that the UI
receives the event but doesn't know which figure in the Office it corresponds to, and nothing visible
happens.

**Pixel art depends on four things at once, and if one is missing it turns into watercolor.**
`resolution: 1` on the `Application` (not `devicePixelRatio`), `antialias: false`, `scaleMode:
'nearest'` on EVERY texture, an **integer** camera scale (no 1.37) and `image-rendering: pixelated`
on the canvas. The browser was the one doing the magnifying, and without that last line of CSS it
interpolates and the look that took a whole session to achieve is lost at once.

**Shrinking generated pixel art is done by MODE, not by average.** The sheets come out at 1024 px
and have to be brought down to ~70. Any normal resize averages and invents intermediate colors:
edges blur and the palette stops being closed. `tools/sprites/recortar.mjs` takes the most frequent
color of each block, and the block comes out transparent if less than half of it had ink. Also, all
the pieces of a sheet are shrunk by the SAME factor (`--alto` applies to the tallest one): scaling
each piece to its own height would destroy the proportions between a chair and a person.

**The isometric tile widens 2·w/h per row, not w/h.** With half the width the tiles don't touch and
the floor comes out full of holes, which only shows up when you look closely. And it covers
something MORE than the geometric rhombus on purpose: the two central rows both go at full width so
the tiles interlock instead of leaving a seam. Both facts are pinned in `lienzo.test.ts`.

**Walls go in one piece.** Tiling a slanted wall by tiles leaves a one-pixel seam at every joint that
is very visible when zoomed in. `paredLarga(segmentos, lado)` generates the whole wall in a single
canvas.

**Renaming a CSS variable silently breaks the Blueprint.** `Plano.tsx` resolves `var(--ink)` and
friends FROM JS. A `var()` that doesn't exist gives no error or warning: it just doesn't paint. That
is why `styles.css` keeps nine English aliases pointing at the Spanish palette. It is the same gotcha
as above seen from the other side.

**A Pixi `stage` with a universal `hitArea` swallows the tap.** The "click on empty space" handler
also receives the event that a figure already handled, so it deselects right after selecting and the
click seems to do nothing. You have to check `e.target === stage`.

**Separating labels needs a step larger than the label itself.** Moving a 16 px text down 12 px still
overlaps, and a fixed or lane-based staggering doesn't work either: each label starts at the height
of its figure. Real rectangles are compared and the step comes from `rotulo.height`.

**`Escena.iniciar()` is asynchronous and the snapshot arrives first.** It loads twenty textures; the
React effect that applies the snapshot runs long before and, since the snapshot no longer changes, it
would never repeat and the Office would stay empty. `Sala.tsx` keeps the latest one in a `ref` and
applies it once loading resolves. By the same token, any debugging probe against the scene has to
wait for it to load: measuring at two seconds gives "doesn't run" and sends you chasing a failure
that doesn't exist.

**The browser inspector runs in an isolated world.** It doesn't see the `globalThis`/`window` that
the page sets. To get a measurement out of Pixi you have to write it to the DOM (`dataset`,
`document.title`), which is shared.

**Vite serves `index.html` from the browser cache.** After a `pnpm build:web`, a normal reload may
keep loading the previous bundle through its old hash, and you debug over and over a bug that is
already fixed. Hard reload (cmd+shift+R) before assuming anything is broken.

**Grouping by similarity without discounting the common stuff groups nothing.** Half the staff cites
the same context skills, so a raw Jaccard gives one block of nine agents and four loose ones. With
IDF (and only with IDF) nine sensible rooms come out. It is measured in `salas.test.ts`.

**The floor plan no longer has a fixed size.** `iso.ts` used to export `COLS`/`ROWS` as constants;
now the floor depends on how many rooms come out of the assignment, so `toScreen` returns UNSHIFTED
coordinates and the origin (`origenX(filas)`) is applied once to the world container.

**The squarest grid is NOT the smallest.** In isometric the rhombus is `(cols + rows)` wide and half
as tall, so the grid's shape doesn't change the on-screen proportion, only the size — and since a
cell is wider than tall, with ten rooms 2x5 takes 960 px and 4x3 takes 1024. The split that
minimizes `cols + rows` is found by brute force.

**A corner is missing between the two outer walls.** The stretch from the left vertex of the first
tile to the top vertex belongs to neither wall: the back wall has to be drawn with ONE more segment,
half a step to the left and half up, or a black notch is left right where the eye first looks.

**Nineteen labels don't fit on a floor plan, and no layout fixes it.** In the overview the room
plaques take over; names light up past 2x zoom, when pointing at the room or when selecting someone.
Trying to make them all fit was wasted time twice.

**Without a corridor, rooms don't read as rooms.** Stuck against each other, the floor plan looks like
one big striped hall. The corridor doesn't need to be drawn: it is enough for the floor that belongs
to no bay to come out in the building's parquet.

**When shrinking below 1x you must switch to `linear` filtering.** `nearest` is mandatory when
MAGNIFYING —it is what keeps the pixel hard— but when shrinking it drops every other pixel and the
thumbnail comes out chewed up and flickering. That is why `texturas.ts` keeps a registry of
everything created and `filtrarTodo()` switches the mode when crossing 1x, not on every frame.

**The minimap shares the floor plan's projection.** A top-down one would be more legible in the
abstract, but then the "what you are looking at" frame would come out rotated and distorted; sharing
the projection makes it a rectangle, and it has to be clipped to the panel or, when zooming out, it
draws two stray lines over the scene.

**A `replace` that doesn't find its text doesn't warn.** It happened when editing `escena.ts` right
after a `biome check --write`, which had collapsed a multi-line chain into a single line: the
substitution didn't match, didn't fail, and we debugged for a while a fix that never reached the file.
If you edit by script, **assert that the pattern exists** before substituting.

**A Pixi canvas doesn't notice that its container changed size.** `resizeTo` only listens to the
WINDOW's `resize`. When dismissing the welcome band or when an error band appears, the container
grows but the canvas kept its old size and left a black strip. `Escena` observes the host with a
`ResizeObserver` and calls `app.resize()`.

**Integer resolution is the only exception to `resolution: 1`.** With an INTEGER devicePixelRatio
(2, 3) each art pixel is an exact 2x2 or 3x3 block of physical pixels, identical to what the browser
did when magnifying, and text labels come out crisp on Retina. With 1.25 or 1.5 the split is uneven
and pixel art breaks: there it stays at 1. Checked by eye with `agent-browser set viewport 1280 700
2`.

**Two views mounted at once are hidden with `visibility`, not `display: none`.** With `display: none`
the host measures 0x0 and Pixi, which only reacts to the window's `resize`, is left with a
zero-size canvas on return. The hidden Office also pauses its ticker.

**Pixi is not destroyed twice, nor half-initialized.** If `destruir()` arrives while `iniciar()` is
waiting on Pixi or the textures, `Escena` records it and `iniciar` withdraws on its own; `destruir()`
is idempotent.

**Wheel zoom cannot take one step per event.** A trackpad gesture is hundreds of events and went from
0.5x to 4x in one go. `Escena.rueda` accumulates and takes ONE step per gesture (140 ms of silence
between gestures); for more, `+`/`-`.

**The token is re-read on `hashchange` AND the WebSocket reconnects.** `api.ts` notifies subscribers
(`subscribeToken`): `App` reloads the snapshot and `useLiveConnection` reopens the socket with the
new token. `connected` only becomes true on receiving the first response: a bad token also opens the
socket and the server closes it without saying why.

**Vite's empty 500 means "there is no daemon".** With the daemon down, the dev proxy answers 500
with no JSON body; the daemon always answers its errors with JSON. `api.ts` translates a non-JSON
5xx to "cannot talk to the daemon".

**Vite HMR duplicates `api.ts` if you edit it with the page open.** Two copies of the module remain
with different tokens and the state looks broken without being so. Hard reload before debugging.

**`fs.watch` loses what happens right after being created (macOS).** A hook that writes to the spool
in the first milliseconds after the daemon starts fires no event, and there is no error. It showed up
as an intermittent test (~5 %) of `watchSpool` that left the process hanging. `watchSpool` doesn't
rely on the watcher alone: it checks the directory every second.

**Read-and-delete on the spool loses lines.** The relay keeps appending to the day's file while the
daemon processes it. It is renamed to `.draining` before reading: the relay creates a new one and
nothing is overwritten.

**A hook registered from the `npx` cache dies silently.** Claude Code ignores a hook whose file no
longer exists. That is why `hooks install` copies the relay to `~/.claude/ai-office/bin/` and
registers that path; `doctor` warns if a settings.json hook points at something that no longer
exists.

**A room's side partitions were drawn one tile off.** `mamparaColumna` placed the canvas with the
same `(-w/2, +h/2)` offset as the outer left wall, but the canvas of a wall that RISES to the right
has its bottom-left edge at `(0, length·h/2 + height)`, not at `(0, height)`. Inside the floor plan
it was disguised (it fell over the corridor); at the edge of the building it came out floating
outside the floor. The canvas's bottom-left corner has to land EXACTLY on `toScreen(col, row1)`.

**The first framing can be done with the canvas's old size.** If the snapshot arrives before the
header, the welcome band or a notice finish taking up their place (it always happens in the static
demo, which reads a local JSON in milliseconds), `encajar()` computes with a height that is no longer
the real one and the floor plan ends up out of view: an "empty" canvas with no error. As long as the
user hasn't moved the camera, every size change re-frames.

**`frontmatter.ts` cannot import anything from Node.** The flow compiler (`compile.ts`) also runs in
the browser, in the static demo, and drags `frontmatter.ts` along. That is why `etagOf` (which uses
`node:crypto`) lives apart, in `etag.ts`. A Node import there breaks the demo at build time.

**On macOS the temp directory is a symlink** (`/var` → `/private/var`). The catalog's `realPath`s
come out in the resolved form, so when rewriting temp paths (the demo's snapshot) you have to replace
both forms or a `/private~/.claude/...` stays on screen.

**i18n: the English catalog is the source of truth.** Every visible text goes first into the English
catalog (web and CLI each have their own) and Spanish is derived from it: a test checks that the
Spanish one has exactly the same keys, so a missing or stray key fails CI instead of showing a raw
key to someone. And the Office's Pixi texts (labels, plaques) are not React: they don't re-render on
their own when the language changes, so the scene regenerates them on a language switch. Adding a
text in Pixi without going through that path leaves it stuck in the previous language, with no error.

**`t()` outside React does not re-render anything.** The Office is drawn by Pixi, outside React: its
plates, tooltips and labels are written once when the scene is painted. Switching language must
re-apply the snapshot to the scene (`Sala.tsx` does it), or the Office stays in the old language
while the rest of the page changes. Toasts are composed when they are created and keep their
language; errors in bands and dialogs keep their key and are translated again.

**Edit dialogs are painted in a portal on `<body>`.** They are opened from the side panel, and inside
the `aside` they inherited its styles (its `aside.side h3` rules reach the dialog's heading) and its
scrolling, and were clipped by its box. `Dialogo.tsx` renders every dialog with
`createPortal(…, document.body)`. Nothing fails: the dialog just comes out wrongly styled or cut
off, and the CSS looks right.

**`~/.claude.json` is rewritten by Claude Code, so we only edit it when we can reproduce it byte for
byte.** The file is Claude Code's state, not configuration, and it rewrites it often. A write that
re-serializes it would change its formatting (and possibly numbers or escapes that do not survive a
round trip) in a file whose format is Claude Code's. `computeSetClaudeJsonMcpDisabled` parses it and
requires the original to be exactly `JSON.stringify(parsed, null, 2)` (with or without the trailing
newline, which is preserved); otherwise it is refused with `unexpected-format` instead of being
reformatted. Settings files are different on purpose: they are ours to edit, so their indentation is
detected and kept.

**Deleting a key from `enabledPlugins` does not disable the plugin.** The key is merged across
user < project < local < managed, so removing it from one file lets a `true` from a lower one win
again, and the plugin stays on with no error. Disabling writes an explicit `false`. A `false` in a
file that a higher one overrides (managed) is written but has no effect: the plan warns `overridden`.

**Disabled MCP servers live in two different places, and writing in the wrong one does nothing.**
A server from `.mcp.json` is turned off by name in `disabledMcpjsonServers` of a settings file; any
other (user, local, plugin) in `projects[<path>].disabledMcpServers` of `~/.claude.json`. The wrong
list is valid JSON that Claude Code simply never consults for that server.

**The key of a project in `~/.claude.json` is not documented, and a wrong one is silent.** The scope
holds the project's real path, Claude Code may have keyed it by the path as typed (through a symlink;
on macOS `/tmp` is `/private/tmp`). `claudeJsonProjectKey` tries the path, its real path and any key
whose real path matches; if none exists, a new entry is created under the real path, which Claude
Code may never read. Same for the name of a plugin server in that list (`plugin:<plugin>:<server>`, as
`/mcp` shows it): it is an assumption, not a documented fact.

**In a user scope an MCP server is neither on nor off: its state is unknown.** Claude Code stores it
per project, so without one the honest value is `enabled: null`, not `true`. It is counted as loaded
and the toggle is refused (`needs-project`); showing it as "on" would be a claim with no source.

**MCP tool names are not the names in the config.** Claude Code replaces whatever is not
`[A-Za-z0-9_-]` with `_` when it builds `mcp__<server>__<tool>`, and a plugin's server becomes
`plugin_<plugin>_<server>`. Matching on the raw name makes a server look unused with no error;
`mcpTranscriptKey` applies the same rule to the catalog. And the prefilter in `transcripts.ts` has to
know `"name":"mcp__`: if it does not, the calls never reach the parser and a server with hundreds of
calls shows none.

**The scope filters what is counted, not what is read.** All transcripts are scanned once; a project
scope then keeps only the invocations whose `cwd` is inside the project (real paths, prefix WITH a
separator, worktrees and subdirectories included) and a user scope keeps all of them. "Unused" in a
project means "not used in this project". Three traps: comparing paths as strings fails through a
symlink (`/tmp` vs `/private/tmp` on macOS) and for a deleted worktree, which `realpath` cannot
resolve (its nearest existing ancestor is resolved instead); a bare `startsWith(path)` makes
`/p/app-old` part of `/p/app`; and an invocation with no `cwd` cannot be placed, so it counts in no
project. Typed commands (`history.jsonl`) are filtered by their `project` the same way, which is why
their events now carry the `sessionId`. The snapshot says what it measured over in `measuredOver`: if
the interface shows "unused" it has to say unused where.

**A plugin skill is cited by name, and the graph has to read it.** Its path changes with every version,
so `agent.skillMentions` writes `- **kit:lint** — \`kit:lint\``. Two details in `findMentions`: a line
is ONE mention even if the name appears twice (the bold one comes first and has no backtick, so
judging only the first hit dropped a perfectly explicit citation), and `:` before the name does not
count as a boundary, or citing `kit:lint` would credit the user skill `lint`.

**A plugin's activity is not the sum of its entities'.** Three skills of a plugin used in one session
are one session, not three: sessions and projects are sets. `activityByTarget` accumulates the
plugin's bucket in parallel with each use instead of adding up the children, and summing them in the
UI inflates the sessions and, with them, the grade.

**`CLAUDE_HOME` has to isolate everything, or a test reads the real machine.** Beyond `agents/`,
`skills/` and `settings.json`: the plugins directory (otherwise it reads
`CLAUDE_CODE_PLUGIN_CACHE_DIR` and the real `installed_plugins.json`), the managed directory (the
machine's `managed-settings.json` and `managed-mcp.json` would leak into a copy) and `.claude.json`
(which lives INSIDE the directory, not in `~/`). A test that sees a plugin it never installed is this.
