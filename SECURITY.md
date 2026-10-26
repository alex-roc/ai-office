# Security

[Español](#español)

## Reporting

Please report vulnerabilities **privately** through
[GitHub Security Advisories](https://github.com/alex-roc/ai-office/security/advisories/new).
You will get an answer within a week.

## Threat model

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

## Español

[English](#security)

### Cómo reportar

Reporta las vulnerabilidades **en privado** desde
[GitHub Security Advisories](https://github.com/alex-roc/ai-office/security/advisories/new).
Tendrás respuesta en menos de una semana.

### Modelo de amenazas

ai-office ejecuta un daemon local que puede **escribir en tu configuración de Claude Code**.
Cualquier página web abierta en tu navegador puede intentar hablar con `127.0.0.1`, así que el
daemon parte de que lo hará:

- Escucha solo en `127.0.0.1`.
- Toda petición a `/api` exige un token aleatorio, regenerado en cada arranque y guardado en un
  archivo que solo tu usuario puede leer. El WebSocket se autentica en su primer frame.
- `Host` y `Origin` deben ser locales (defensa contra DNS rebinding).
- Las escrituras exigen la cabecera propia `X-AI-Office`, que fuerza un preflight de CORS (sin CSRF
  por formulario).
- El guard decide sobre la ruta **ya resuelta**, así que una ruta codificada con porcentajes no lo
  puede esquivar.
- Toda escritura queda restringida a los directorios propios de Claude Code, muestra primero un
  diff, guarda un backup y se anota en `~/.claude/ai-office/logs/audit.ndjson`.
- El frontmatter generado se serializa con una librería YAML, nunca concatenando cadenas.

El relay de hooks nunca envía nada por red salvo al socket del daemon local, nunca guarda el
contenido de las entradas de `Write`, `Edit` o `Bash`, y se puede desactivar por completo.
