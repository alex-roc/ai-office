# Publicar `ai-office` en npm

[English](../PUBLISHING.md)

Este documento son los pasos para publicar el paquete `ai-office` (lo que hoy vive en
`packages/cli`). Léelo junto a `tsdown.config.ts`, que explica el porqué de la estrategia.

## La estrategia, en corto

El monorepo tiene cinco paquetes (`core`, `providers`, `daemon`, `hook-relay`, `cli`) unidos por
`workspace:*`. Se publica **uno solo**: `ai-office`. `core` + `providers` + `daemon` + `cli` se
transpilan de TypeScript a JavaScript con [tsdown](https://tsdown.dev) en **modo `unbundle`**
(`unbundle: true`, `root: '.'`): cada archivo se compila por separado y el resultado conserva la
misma profundidad de carpetas que tienen hoy dentro del monorepo, solo que bajo
`packages/cli/dist/`.

No es la opción por defecto de un bundler (que fundiría todo en un `index.js`), y es deliberado:
dos archivos calculan una ruta a mano con `dirname(fileURLToPath(import.meta.url))` más una cadena
fija de `..`, asumiendo la profundidad exacta del monorepo —
`packages/daemon/src/server.ts` (para encontrar `apps/web/dist` y servir la interfaz) y
`packages/cli/src/commands/hooks.ts` (para encontrar `packages/hook-relay/bin/`). Un bundle plano
pisa esa profundidad y las rompe en silencio (la interfaz web deja de servirse, o
`ai-office hooks install` escribe una ruta al relay que no existe). `unbundle` con `root: '.'`
reproduce la misma profundidad dentro de `dist/`, así que ninguno de los dos archivos necesita
tocarse. `scripts/build.sh` copia después, en las rutas relativas que faltan para completar esa
misma estructura, lo que no debe pasar por ningún bundler: `apps/web/dist` (ya compilado por Vite)
y `packages/hook-relay/bin/ai-office-hook.mjs` (JavaScript plano, tal cual).

Los imports entre `@ai-office/core`, `@ai-office/providers` y `@ai-office/daemon` se resuelven
en `tsdown.config.ts` con un `alias` explícito a sus archivos fuente, no vía el symlink de pnpm en
`node_modules`: así el build no depende de si el workspace los tiene enlazados, y
`packages/cli/package.json` puede publicarse sin fingir que son paquetes de npm reales.

**Alternativa que se descartó**: publicar el TypeScript crudo (Node ≥ 22.18 lo ejecuta nativo, sin
build). Es más simple, pero exige resolver los `import`s entre paquetes sin `node_modules` real
(los paquetes no publicados no se pueden instalar), lo que obliga a reescribir specifiers a mano de
todas formas. Compilar con `unbundle` da lo mismo de simple en tiempo de publicación sin ese
problema, y de paso valida tipos y sintaxis en el momento del build.

## Qué SÍ se publica

- `dist/` — el resultado de `pnpm build` (ver abajo). Todo `.mjs`, sin `.ts`.
- El relay de hooks, copiado tal cual: `dist/packages/hook-relay/bin/ai-office-hook.mjs`.
- Los estáticos de la interfaz web, ya compilados: `dist/apps/web/dist/`.
- `README.md` y `LICENSE`, copiados desde la raíz del repo (por eso están en `.gitignore` dentro
  de `packages/cli/`: son artefactos de build, no archivos versionados ahí).

Dependencias reales en `packages/cli/package.json` (lo único que un `npm install ai-office`
instala): `yaml`, `fastify`, `@fastify/static`, `@fastify/websocket`. `@ai-office/core`,
`@ai-office/providers` y `@ai-office/daemon` están en `devDependencies` con `workspace:*` **solo**
para que `pnpm` los enlace durante el desarrollo (typecheck, `pnpm dev`, editor); no se instalan al
instalar el paquete publicado y no aparecen en el bundle final como paquetes separados.

## Qué NO se publica, y por qué

- `packages/{core,providers,daemon,hook-relay}/` como paquetes propios: no tiene sentido
  publicarlos sueltos si nadie más los va a instalar, y cada paquete extra es una versión más que
  mantener sincronizada.
- Los fuentes `.ts` de `apps/web/src`: solo se publica `apps/web/dist`, ya compilado.
- `node_modules`, tests, transcripts, `.claude` de nadie: `npm pack` los excluye por defecto (y
  `scripts/verificar-paquete.sh` lo comprueba, no lo da por hecho).
- `.claude-plugin/`, `hooks/`, `commands/`, `bin/ai-office`: son la distribución como **plugin de
  Claude Code**, un mecanismo aparte (ver más abajo). No forman parte del paquete npm.

## Antes de publicar

1. Comprueba que `repository`/`homepage`/`bugs` de `packages/cli/package.json` apuntan a
   `github.com/alex-roc/ai-office`.
2. Sube la versión (`packages/cli/package.json`, campo `version`) siguiendo semver.
3. `pnpm install && pnpm test && pnpm typecheck` en verde.
4. `pnpm build` (compila la web, transpila el CLI, copia el relay y los estáticos).
5. `pnpm verificar:paquete` — genera el tarball con `npm pack`, audita su contenido y lo instala en
   un directorio temporal fuera del repo para probar `ai-office --help` y `ai-office censo` de
   verdad, como lo haría alguien con `npx @alex-roc/ai-office`. Si esto no pasa, no se publica.
6. Revisa a mano el tarball si algo te da dudas: `npm pack --dry-run` desde `packages/cli/` lista
   el contenido sin generar el archivo.

## Publicar

El paquete es **`@alex-roc/ai-office`** (npm rechazó `ai-office` a secas por parecerse demasiado a
`aioffice`, que ya existe); el comando instalado sigue siendo `ai-office`.

**Vía normal: una release de GitHub.** `.github/workflows/release.yml` publica en npm al publicarse
una release, con **trusted publishing** (OIDC): npm confía en ese workflow, así que no hay secreto
`NPM_TOKEN`, ni código de un solo uso, y cada versión sale con su procedencia firmada. El workflow
pasa lint, typecheck, tests, el build y `verificar:paquete`, y se niega a publicar si la versión de
`packages/cli/package.json` no coincide con la etiqueta de la release.

```bash
# 1. subir la versión (packages/cli/package.json, plugin.json, CHANGELOG) y hacer commit
# 2. crear la release; el CI la publica
gh release create v0.2.0 --title "ai-office 0.2.0" --notes-file notas.md
```

**Configuración de una sola vez** (la hace el dueño de la cuenta, con sesión en npm; cambia la
configuración de la cuenta, así que un agente no debe hacerla por su cuenta):

```bash
npm trust github @alex-roc/ai-office --file release.yml --repo alex-roc/ai-office
npm trust list @alex-roc/ai-office      # comprobarlo
```

Exige **2FA activado en la cuenta de npm** (basta una passkey o Touch ID, sin app autenticadora) y
npm ≥ 11.15 para `npm trust`; un E400 suele significar que falta alguna de las dos. Lo mismo se
puede hacer en la web: el paquete → *Settings* → *Trusted Publisher* → *GitHub Actions* (owner
`alex-roc`, repo `ai-office`, workflow `release.yml`). Este paquete permite `npm publish` directo
(lo decidió el dueño); por defecto npm deja la versión preparada para aprobarla en la web. La conexión
queda «pendiente de validación» hasta la primera publicación por esa vía y luego pasa a «Valid»
(hecho con la 0.1.1).

Requisitos: npm ≥ 11.5.1 en el CI (el workflow lo actualiza), runners alojados por GitHub e
`id-token: write`. Fuentes: [trusted publishers](https://docs.npmjs.com/trusted-publishers/),
[npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

**A mano** (alternativa): desde `packages/cli/`, con sesión (`npm whoami`), `npm publish --access
public`. npm puede pedir confirmar en el navegador; `npm login` y esa confirmación necesitan una
terminal interactiva, no la shell de un agente.

## Relación con el plugin de Claude Code

`ai-office` tiene dos vías de distribución independientes:

| Vía | Qué instala | Dónde vive |
|---|---|---|
| **npm** (`npx @alex-roc/ai-office`) | el CLI compilado, para usarlo desde la terminal | `packages/cli` → este documento |
| **Plugin de Claude Code** (`claude plugin install`) | los hooks y el comando `/censo`, sin tocar `settings.json` | `.claude-plugin/`, `hooks/`, `commands/`, `bin/ai-office` |

Son mecanismos distintos y no se mezclan: el plugin ejecuta `bin/ai-office`, que lanza
`packages/cli/src/index.ts` **directamente con TypeScript** (Node lo ejecuta nativo, no hace falta
build) desde una instalación del propio monorepo del plugin. El paquete de npm, en cambio, existe
para poder escribir `npx @alex-roc/ai-office` sin clonar nada. `claude plugin validate .` sigue siendo el
chequeo del plugin y es independiente de todo lo de este documento.

Las dos vías llevan la misma interfaz y el mismo CLI, en inglés por defecto con español seleccionable
(`--lang es` / `AI_OFFICE_LANG=es` en npm, la opción `language` en el plugin): ver la sección
«Internacionalización» de [ARQUITECTURA](ARQUITECTURA.md).
