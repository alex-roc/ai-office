---
description: Census of your Claude Code setup - what you have, what you use and what you have never tried
---

Run the ai-office census and discuss the result with the user.

1. Run `ai-office census` (or `node "${CLAUDE_PLUGIN_ROOT}/packages/cli/src/index.ts" census` if the
   binary is not on the PATH). If the user asks for a shareable image, add
   `--poster ai-office-census.svg`.
2. Read the output and summarize **what stands out most**, not everything: the number of untried
   agents, the number of unused skills, and the gap between declared and proven relations.
3. Propose at most three concrete actions, each naming the file that would have to change.
   Do not apply them unless the user asks.

If the user passes $ARGUMENTS, use it to narrow the discussion (for example, to a specific agent).
