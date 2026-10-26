# Arquitectura

[English](../ARCHITECTURE.md)

## Fuentes de datos, por fiabilidad

| Fuente | Qué da | Estabilidad |
|---|---|---|
| `~/.claude/agents/*.md`, `commands/*.md`, `skills/*/SKILL.md` | catálogo y **grafo declarado** | formato documentado |
| `~/.claude/history.jsonl` | prompts tecleados, uso real de slash commands | estable de facto |
| `~/.claude/projects/**/*.jsonl` | **grafo acreditado** | **interno, sin contrato** |
| `claude agents --json` | sesiones vivas | CLI público |
| `~/.claude.json` | contadores propios del CLI | interno |
| `~/.claude/settings.json` (`cleanupPeriodDays`) | cuánto historial conserva Claude Code | estable |

**El directorio de Claude Code no siempre es `~/.claude`.** `paths()` resuelve, por este orden,
`CLAUDE_HOME` (la nuestra, para probar), `CLAUDE_CONFIG_DIR` (la oficial de Claude Code: varias
cuentas, contenedores) y `~/.claude`. Con cualquiera de las dos variables, `.claude.json` vive
DENTRO de ese directorio y no en `~/`. El relay de hooks aplica la misma regla: si el daemon mira
un directorio y el relay escribe en otro, los eventos no llegan nunca y nada avisa.

## Reglas que no se negocian

**Escribir siempre al `realPath`.** `~/.claude/skills` suele ser una proyección por symlinks de
otro store (p. ej. `~/.agents/skills`, compartido con otros agentes). Escribir sobre el enlace lo
reemplazaría por un archivo regular y rompería la proyección. El escáner agrupa por destino real y
guarda todas las rutas desde las que una entidad es visible.

**El historial es opcional.** Todo el parseo de transcripts vive tras `transcripts.ts`, es
defensivo y no falla el arranque. Los subagentes ya se mudaron de un campo del archivo principal a
archivos propios entre versiones recientes: esa fragilidad es la norma, no la excepción.

**Atribución de subagentes.** Cada subagente tiene su transcript en
`projects/<proyecto>/<sesión>/subagents/agent-<id>.jsonl` y un `agent-<id>.meta.json` hermano con
`{agentType, description, toolUseId, spawnDepth}`. Emparejar ambos da la atribución sin recorrer la
cadena `tool_use` → `tool_result`.

**Prefiltro antes de parsear.** Solo se hace `JSON.parse` de las líneas que contienen
`"name":"Skill"`, `"name":"Agent"` o `"name":"Task"` (el nombre antiguo de la herramienta de
subagentes: los historiales viejos siguen en disco). Sobre 1,2 GB y 692 archivos el escaneo
completo tarda ~3,5 s. Cada `tool_use` se cuenta una sola vez aunque aparezca en varias líneas
(sesiones reanudadas o bifurcadas): se deduplica por su id.

**La ventana del historial es finita.** Claude Code borra los transcripts a los
`cleanupPeriodDays` días (30 por defecto). `stats.historyWindowDays` la expone y el censo y el cartel
dicen «en los últimos N días» donde antes decían «nunca»: «sin uso» solo vale dentro de esa ventana.

**Actividad de los comandos.** Un slash command no deja rastro como herramienta cuando lo teclea el
usuario: se cuenta desde `history.jsonl` (con sus sesiones y proyectos). Y en versiones recientes el
modelo también los invoca por la herramienta `Skill`, con el nombre del comando en
`tool_input.skill`: si ese nombre no es una skill pero sí un comando, la invocación es del comando.
Los dos orígenes se suman en `activityByTarget`, que devuelve la misma forma (`EntityActivity`) para
skills, agentes y comandos. Las sesiones y los proyectos son CONJUNTOS: tres agentes que usan una
skill en la misma sesión son una sesión, no tres.

## Modelo

```
Catalog { agents, skills, commands, mcpServers, projects }
Edge { from, to, kind, layer: declared|preloaded|proven, evidence[], uses?, sessions?, projects? }
Grade = unused | tried | practicing | certified      (saturante, caduca a 90 días)
```

**Ratio activo.** `activas / vivas`, donde las vivas son las skills que el modelo puede elegir. Una
skill jubilada (`disable-model-invocation: true`) sale del denominador —y de las cifras de coste—
porque su description ya no se carga en cada sesión: jubilar lo que no usas SÍ sube el ratio, que es
lo que promete el README. Se calcula en `providers/claude-code/stats.ts` y lo comparten el snapshot
y el censo, para que no puedan discrepar. `stats.skillsRetired` dice cuántas hay.

**Agentes archivados.** `agent.archive` mueve el `.md` a `agents/.archive/`; `scanAgents` los lista
con `archived: true` (y un id propio, `…/user/.archive/<nombre>`, para que no choquen con uno activo
del mismo nombre) y la mutación `agent.unarchive` los restaura. Los archivados por versiones
anteriores en `agents/.archivo/` se siguen leyendo y listando igual; los nuevos van siempre a
`.archive/`. Viajan en `catalog.agents` para que la interfaz pueda ofrecer «restaurar», pero no
cuentan en las estadísticas, ni entran en el grafo declarado, ni en el reparto de despachos.

**Lo que no se pudo leer.** Un symlink roto o un `.md` ilegible no tumba el escaneo: se acumula en
`snapshot.scanErrors` (`ruta: motivo`) y la interfaz lo puede enseñar.

`packages/core` no importa nada de `packages/providers`: el dominio no sabe qué es un hook ni un
`.md`. Esa separación es lo que permitirá añadir otros proveedores sin refactor.


## Interfaz

Dos vistas sobre el mismo snapshot, alternables sin perder la selección:

- **Sala** (`apps/web/src/sala/`): PixiJS 8 **imperativo**, sin `@pixi/react`. Proyección
  isométrica 2:1 y pixel art. `Sala.tsx` es un envoltorio tonto: monta la escena, le pasa el
  snapshot y recibe la selección; todo lo que ocurre a 60 fps vive en `escena.ts` y no toca React
  ni una vez. El layout (`layout.ts`) es puro y razona en coordenadas de BALDOSA, no de pantalla:
  dado un snapshot devuelve en qué casilla va cada cosa, y solo `iso.ts` sabe traducir eso a
  píxeles.

  **El reparto en despachos no se decide en la interfaz.** Lo calcula `agruparEnSalas`
  (`packages/core/src/graph/salas.ts`) sobre el grafo DECLARADO, y viaja en el snapshot. Está en
  `core` y no aquí por dos motivos: es un dato derivado, no geometría, y así se prueba en Node
  sin levantar un canvas. `layout.ts` solo decide dónde cae cada despacho en el suelo.

  El arte se reparte en dos por una regla clara:

  - **Generado** (`atlas.ts` + `public/sprites/`): personas y muebles, veinte PNG recortados de
    dos hojas hechas con `codex-image-gen`. Son volúmenes orgánicos que no dependen del dato.
  - **Procedural** (`texturas.ts` sobre `lienzo.ts`): suelo, paredes, baldas, lomos de skill y
    tarjetas de comando. Todo lo que tiene que TESELAR sin costura o CAMBIAR con el dato. Una
    baldosa generada no casaría con su vecina, y el lomo de una skill cambia de alto y de color
    según su grado y su dueño.

  `lienzo.ts` es un búfer RGBA crudo, sin canvas de por medio: cada píxel se decide a mano, así
  que los bordes son exactos y se puede afirmar sobre ellos en un test de Node sin WebGL.

  La cámara escala por **enteros** hacia arriba (nada de 1,37: interpolaría el píxel) más un
  único paso de alejamiento a 0,5, porque con pasillos la planta no cabe entera ni maximizada.
  Al cruzar el 1x se cambia el filtrado de todas las texturas de `nearest` a `linear`: ampliar
  con `linear` emborrona, pero reducir con `nearest` va tirando uno de cada dos píxeles y deja la
  imagen comida. El **minimapa** usa la misma proyección reducida, no una vista cenital, y por
  eso el recuadro de "lo que estás viendo" es un rectángulo de verdad y no un rombo deformado.
- **Plano** (`apps/web/src/Plano.tsx`): SVG con d3-force. El layout se calcula **una sola vez** y
  se congela (ver el gotcha en `CLAUDE.md`); el pan y el zoom son lo único interactivo.

La ficha lateral (`Ficha.tsx`) es común a las dos y siempre cita el archivo del que sale cada dato.

**Red en un solo módulo.** Toda llamada al daemon pasa por `api.ts` (`apiGet`, `apiPost`,
`abrirSocketVivo`); `flows.ts`, `mutations.ts` y `live.ts` no tocan `fetch` ni `WebSocket`. Ahí se
enchufará un modo demo estático (`import.meta.env.VITE_DEMO`). Los errores se traducen en
`errores.ts` a partir del `code` estable del daemon, al idioma activo.

**Estado en vivo fuera de React.** `live.ts` es un almacén con suscripción por selector: un evento
no re-renderiza `App`, solo el indicador de conexión; la Sala recibe los destellos por `onEvento`.

**Las dos vistas viven montadas a la vez.** `App` alterna su visibilidad; ambas exponen la misma
interfaz (`ControlVista`: encuadrar, zoom, centrarEn) que usan los atajos y el buscador. La cámara
solo se reencuadra al cambiar el conjunto de entidades (`claveDeConjunto`), no en cada snapshot.

**Fases de un flujo** (`fases.ts`, puro y con tests): un grupo "a la vez" es una racha de pasos con
el mismo número de fase; todas las operaciones (mover, unir, separar) trabajan por bloques y
renumeran a 1..n.

**Internacionalización.** El inglés es el idioma por defecto y el español es seleccionable en todas
las superficies: la interfaz web (conmutador EN/ES en la cabecera, o `?lang=es` en la URL), el CLI
(`--lang es` o `AI_OFFICE_LANG=es`) y el plugin (opción `language`, que llega al CLI como
`CLAUDE_PLUGIN_OPTION_LANGUAGE`). Cada superficie tiene su propio catálogo de mensajes y el inglés es
la fuente de verdad: un test comprueba que el español tiene exactamente las mismas claves. Los
textos de Pixi de la Sala no son React, así que la escena los regenera al cambiar de idioma (ver
[GOTCHAS](GOTCHAS.md)).

**Los errores del daemon llevan un `code` estable.** El mensaje es para personas y puede reformularse
o traducirse; el `code` es el contrato. La interfaz asigna cada `code` a su entrada del catálogo y,
si no lo conoce, recurre al mensaje del daemon.

## Cómo se agrupan los despachos

Agrupar por tema ("jurídico", "datos") sería una lista de palabras escrita a mano, y un tema
inventado no puede citar su fuente — que es la regla que sostiene el producto. En vez de eso una
sala sale de dos hechos ya escritos en los archivos del usuario: **qué skills cita cada agente**
en el cuerpo de su prompt y **qué comandos lo convocan** (los slash commands son repartos hechos
a mano, o sea el organigrama que el usuario ya dibujó sin darse cuenta).

Los dos rasgos se descuentan por IDF antes de comparar, y ese descuento no es un adorno
estadístico: sin él no funciona. En una instalación real media plantilla cita las mismas cuatro
skills de contexto y un comando de revisión convoca a ocho, así que la similitud sin pesar mete a nueve
agentes en un único despacho gigante y la planta deja de existir. Lo que identifica a alguien es
lo que comparte con POCOS, no lo que comparte con todos.

El agrupamiento es aglomerativo por enlace medio, con umbral calibrado sobre una instalación real
de 19 agentes. Cada sala se nombra con su rasgo más característico —una skill o un comando que
existen— y guarda el motivo, que es lo que la placa de la puerta enseña al señalarla.

Dos sitios del vestíbulo recogen lo que no es de ningún despacho, y están separados a propósito
porque significan lo contrario: el **archivo común** (skills que cita media planta) y el
**depósito** (skills que no cita nadie). Juntarlos borraría la distinción que da sentido a todo.

## Compilador de flujos

`compile.ts` traduce entre un flujo (`{name, description, steps[]}`) y un slash command en
Markdown. El archivo generado debe ser indistinguible de uno escrito a mano: no se inventa un
formato propio. El Markdown sale en el idioma elegido (inglés por defecto; los encabezados y marcadores
estructurales cambian con `--lang`/`language`) e `importFlow` reconoce ambos, así que un comando
compilado en un idioma se vuelve a leer tras cambiar al otro. `importFlow` recupera los pasos de los comandos existentes —incluidos los escritos
a mano— buscando nombres de agentes conocidos; sobre una instalación real recupera pasos de 21 de
27 comandos, que son exactamente los que nombran agentes.

## El daemon

**Guard de autenticación.** Decide con la ruta NORMALIZADA (percent-decoding, también el doble,
`//`, `..`, mayúsculas) y con la ruta que el router resolvió, y lo público es una lista blanca
exacta (`/api/health`, `/api/live` y los estáticos). Todo lo demás bajo `/api` exige token y, si no
es GET, la cabecera `X-AI-Office`. Ver el gotcha en `docs/es/GOTCHAS.md`.

**Arranque.** El token solo se escribe a disco cuando el servidor ya escucha: un segundo arranque
con el puerto ocupado no invalida el del primero. Si el puerto lo ocupa otro ai-office lo dice (sonda
a `/api/health`), antes de tocar el socket de ingesta o el spool.

**Snapshot en dos cachés.** El historial (transcripts, `history.jsonl`, ajustes: segundos) y el
catálogo (milisegundos) tienen ciclos de vida distintos. Una mutación reescanea solo el catálogo y
reutiliza el historial; `/api/refresh` recalcula ambos. Una construcción que empezó antes de una
mutación termina con un catálogo anterior al cambio, así que se devuelve pero NO se cachea (contador
`generation`). La promesa en curso se limpia en `finally`: si fallase y se quedara guardada, todas
las peticiones siguientes recibirían el mismo error para siempre.

**Spool.** El relay escribe `AAAA-MM-DD.ndjson`; el daemon lo renombra a `.draining` ANTES de leerlo
(leer y borrar perdía las líneas añadidas entre una cosa y otra). `fs.watch` no es fiable en macOS
(descarta lo que ocurre justo tras crearse), así que además se revisa cada segundo. El relay no deja
crecer el spool más de 5 MB: descarta lo nuevo y lo anota una vez (`.lleno`).

**Presencia.** Las sesiones terminadas se olvidan a los 10 minutos; antes el mapa solo crecía. Un
WebSocket que no manda su primer frame (el del token) en 5 s se cierra.

## Distribución

Requiere Node ≥ 22.18. `.claude-plugin/plugin.json` declara el plugin; `hooks/hooks.json` sus hooks, todos con
`"async": true` para no entrar nunca en el camino crítico de una sesión; `bin/ai-office` entra en
el PATH de la herramienta Bash. `claude plugin validate .` debe pasar antes de publicar.

`bin/ai-office` comprueba que el plugin tenga sus dependencias (se clona sin `node_modules`) y, si
faltan, dice el comando exacto (`pnpm install --prod` en el directorio del plugin) en vez de un
`ERR_MODULE_NOT_FOUND`. Las opciones de `userConfig` llegan por la convención de Claude Code,
`CLAUDE_PLUGIN_OPTION_<CLAVE>`: `port` y `language` los lee la CLI (`packages/cli/src/env.ts`) y
`telemetry` el relay. Fuera del plugin valen `AI_OFFICE_PORT`, `AI_OFFICE_LANG` y
`AI_OFFICE_TELEMETRY=0`.

**Hooks por settings.json.** `hooks install` copia el relay a `~/.claude/ai-office/bin/` y registra
esa ruta: la del paquete puede vivir en la caché de `npx`, que se purga, y Claude Code ignora en
silencio un hook cuyo archivo no existe. Crea `settings.json` si no existe, escribe en el destino
real si es un symlink (conservando permisos) y su lista de eventos debe coincidir con
`hooks/hooks.json` (lo comprueba un test). Si el plugin y los hooks de settings.json están activos a
la vez, cada evento llega dos veces: `doctor` lo advierte.

**Privacidad del relay.** `tool_input` de `Write`, `Edit`, `MultiEdit`, `NotebookEdit` y `Bash` es
contenido del usuario (texto de archivos, comandos con tokens). El relay no lo reenvía ni lo guarda
en el spool, que queda en disco días: de esas herramientas solo salen el nombre del archivo y los
bytes; tampoco su salida. Con `telemetry` desactivada no escribe nada.


## Escritura

Todas las mutaciones pasan por un motor común (`mutations.ts`) en dos tiempos: `plan*` es puro y
devuelve el diff sin tocar nada, `apply*` comprueba el etag, guarda backup, escribe de forma
atómica en el `realPath` y registra la operación en `~/.claude/ai-office/logs/audit.ndjson`.

Crear un archivo nuevo (un comando compilado desde el lienzo) va por `applyCreateFile`, aparte del
motor: ese exige leer el estado previo para comparar etags y aquí no hay estado previo que
preservar. Comparte validación de raíces, escritura atómica y auditoría, para que crear no sea un
agujero por el que se escriba sin dejar rastro.

## Probar sin tocar la configuración real

`paths()` respeta la variable `CLAUDE_HOME`, así que se puede levantar el daemon contra una copia:

```bash
CLAUDE_HOME=/tmp/mi-copia node packages/cli/src/index.ts start
```

También respeta `CLAUDE_CONFIG_DIR`, la variable oficial de Claude Code (con `CLAUDE_HOME` por
delante cuando están las dos). Es como se prueban las escrituras de verdad —crear un comando, dar color a un agente, jubilar una
skill— sin riesgo para la instalación del usuario.

## La instalación de demostración

`packages/cli/src/demo/` define una oficina ficticia (catálogo en `catalog.ts`, actividad en
`synth.ts`) y la escribe con la forma exacta de `~/.claude`: agentes, skills, comandos,
`settings.json`, `history.jsonl` y transcripts con subagentes. La actividad se sintetiza RELATIVA
a la fecha de hoy con un PRNG de semilla fija: el grado caduca a 90 días, así que una demo con
fechas congeladas se iría apagando sola.

Tiene tres usos, todos sobre el mismo código que una instalación real:

- **`ai-office demo`** escribe la oficina en un directorio temporal, apunta `CLAUDE_HOME` ahí y
  arranca el daemon en el puerto 7379. Se puede editar todo: las escrituras van a la copia.
- **La demo estática** de la página del proyecto. `scripts/demo-snapshot.ts` construye el snapshot
  con `buildSnapshot` del daemon y la interfaz se compila con `VITE_DEMO=1`. En ese modo
  `apps/web/src/demo.ts` sustituye los tres puntos de red de `api.ts`: el snapshot sale del JSON,
  el lienzo de flujos usa el compilador real en el navegador, las escrituras se rechazan con un
  mensaje que explica por qué, y el WebSocket es un guion que reproduce el grafo ACREDITADO.
- **Las capturas** del README y de la página.

## La página del proyecto

`site/` es HTML, CSS y JS sin build, bilingüe (el inglés está en el HTML; el español en
`i18n.js`, que captura el inglés del propio DOM para no duplicarlo). `scripts/build-site.sh` la
monta en `_site/` con los sprites de la interfaz y la demo estática en `_site/demo/`, y el
workflow `pages.yml` la publica en cada push a `main` y una vez por semana (para que la demo no
envejezca).
