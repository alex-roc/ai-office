# Security · Seguridad

## Reporting · Cómo reportar

Please report vulnerabilities **privately** through
[GitHub Security Advisories](https://github.com/alex-roc/ai-office/security/advisories/new).
You will get an answer within a week.

Reporta las vulnerabilidades **en privado** desde
[GitHub Security Advisories](https://github.com/alex-roc/ai-office/security/advisories/new).
Tendrás respuesta en menos de una semana.

## Threat model · Modelo de amenazas

ai-office runs a local daemon that can **write to your Claude Code configuration**. Any web page
open in your browser can try to talk to `127.0.0.1`, so the daemon assumes it will:

- It listens on `127.0.0.1` only.
- Every `/api` request needs a random token, regenerated on each start and stored in a file only
  your user can read. The WebSocket authenticates in its first frame.
- `Host` and `Origin` must be local (DNS-rebinding defence).
- Writes need a custom `X-AI-Office` header, which forces a CORS preflight (no form-based CSRF).
- The guard decides on the **resolved** route, so percent-encoded paths cannot bypass it.
- Every write is restricted to Claude Code's own directories, shows a diff first, keeps a backup
  and is appended to `~/.claude/ai-office/logs/audit.ndjson`.
- Generated frontmatter is serialised with a YAML library, never by string concatenation.

The hook relay never sends anything over the network except to the local daemon socket, never
stores the contents of `Write`, `Edit` or `Bash` inputs, and can be disabled entirely.
