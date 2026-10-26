# Arquitectura

[English](../ARCHITECTURE.md)

## Fuentes de datos, por fiabilidad

| Fuente | Qué da | Estabilidad |
|---|---|---|
| `~/.claude/agents/*.md`, `commands/*.md`, `skills/*/SKILL.md` | catálogo y **grafo declarado** | formato documentado |
| `<proyecto>/.claude/agents`, `commands`, `skills` | lo mismo, para un ámbito de proyecto | formato documentado |
| `~/.claude/history.jsonl` | prompts tecleados, uso real de slash commands | estable de facto |
| `~/.claude/projects/**/*.jsonl` | **grafo acreditado** (skills, subagentes, llamadas a herramientas MCP) | **interno, sin contrato** |
| `claude agents --json` | sesiones vivas | CLI público |
| `~/.claude.json` | servidores MCP de usuario y por proyecto, listas de desactivados por proyecto, proyectos conocidos | interno, lo reescribe Claude Code |
| `<proyecto>/.mcp.json`, `managed-mcp.json` | servidores MCP de proyecto y gestionados | formato documentado |
| `~/.claude/settings.json` (`cleanupPeriodDays`) | cuánto historial conserva Claude Code | estable |
| `settings.json`, `.claude/settings.json`, `.claude/settings.local.json`, ajustes gestionados | `enabledPlugins`, `disabledMcpjsonServers` | formato documentado |
| `~/.claude/plugins/installed_plugins.json` y la carpeta de cada plugin | plugins instalados y lo que traen | **esquema en parte sin documentar** |

Qué está documentado y qué solo observado está en [CLAUDE-CODE-CONFIG](../CLAUDE-CODE-CONFIG.md) (en inglés).

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
`"name":"Skill"`, `"name":"Agent"`, `"name":"Task"` (el nombre antiguo de la herramienta de
subagentes: los historiales viejos siguen en disco) o `"name":"mcp__` (las herramientas MCP se llaman
`mcp__<servidor>__<herramienta>`). Sobre 1,2 GB y 692 archivos el escaneo
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
Catalog { agents, skills, commands, plugins, mcpServers, projects }
Edge { from, to, kind, layer: declared|preloaded|proven, evidence[], uses?, sessions?, projects? }
Grade = unused | tried | practicing | certified      (saturante, caduca a 90 días)
```

**El snapshot** (`packages/daemon/src/snapshot.ts`) es lo que dibuja la interfaz: `catalog`, `edges`,
`activity` (por id de entidad, de agentes, skills, comandos, plugins y servidores MCP), `scope` (el
ámbito con el que se construyó), `measuredOver` (sobre qué se midió esa actividad, ver
[Medir](#medir)), `knownProjects`, `scanErrors`, `stats`, `vocabularyGaps`, `planta` y
`mainThreadId`.

**El catálogo lista más de lo que se cuenta.** Lleva todo lo que hay en disco para poder enseñarlo:
agentes archivados, lo tapado por otro ámbito, el contenido de los plugins y el de los plugins
deshabilitados. Dos filtros (`providers/claude-code/live.ts`) deciden qué cuenta: `liveCatalog` es lo
que Claude Code carga (ni archivados, ni tapados, ni nada de un plugin deshabilitado, ni un servidor MCP
apagado; uno cuyo estado se desconoce, `enabled: null`, cuenta como cargado) y alimenta el grafo declarado;
`ownCatalog` es la parte viva que es del usuario o del proyecto (sin plugins) y alimenta
`stats.agents`, `skills` y `commands`, el ratio activo y el cartel. Los plugins y los servidores MCP
tienen sus propias cifras (`stats.plugins`…, ver [MÉTRICAS](METRICAS.md)).

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

## Qué puedes ver, editar y medir

Esta tabla es el contrato: dice qué existe y qué no. Lo que no está aquí no está hecho. Léela como lo
que expone el daemon (el snapshot, `/api/mutations`, `/api/entities`); la interfaz web lo va
enseñando vista a vista. Todo lo de la columna «editar» pasa por el mismo motor de diff, etag, backup
y auditoría (ver [Edición](#edición)). La CLI solo lee (`census`, `doctor`): las ediciones pasan por
el daemon.

| | Ver | Editar | Medir |
|---|---|---|---|
| **Agentes** | Archivo con números de línea reales, modelo, herramientas, color, skills precargadas, las skills que cita su prompt; grafo declarado, precargado y acreditado; agentes archivados | Description, prompt, modelo, herramientas, color, skills precargadas, skills que cita el prompt, archivar y restaurar. Crear (de usuario o de proyecto) | Delegaciones, sesiones, proyectos, grado, tendencia de 12 semanas, usos por proyecto; cuántos nunca se ejecutaron |
| **Skills** | Archivo con números de línea reales, description, herramientas permitidas, quién la cita y quién la usa; estado de jubilada | Description, cuerpo, jubilar y des-jubilar. Crear (de usuario o de proyecto) | Invocaciones, sesiones, proyectos, grado, tendencia, usos por proyecto; **coste de la description en tokens**; términos de la description que nunca has tecleado; ratio activo |
| **Comandos** | Archivo, pista de argumento, qué agentes convoca (grafo); pasos del flujo recuperados del texto | Description, pista de argumento, cuerpo. Crear (de usuario o de proyecto). Componer o reescribir como flujo en el lienzo | Tecleados por ti (`history.jsonl`) más invocados por el modelo mediante `Skill`; sesiones, proyectos, tendencia, usos por proyecto |
| **Plugins** | Qué hay instalado (versión, marketplace), si está habilitado y qué archivo de ajustes lo decide, qué trae. Sus agentes, skills y comandos aparecen en el catálogo | **Solo habilitar y deshabilitar** (`enabledPlugins` en los ajustes de usuario, de proyecto o locales). Los archivos de un plugin son de solo lectura: son copias que una actualización sobrescribe. Ni instalar, ni actualizar, ni desinstalar | Usos (suma de todo lo que trae), plugins habilitados sin uso, coste de las descriptions de sus skills habilitadas |
| **Servidores MCP** | Definición sin secretos: ámbito, transporte, ejecutable o host, los **nombres** de las variables de entorno y de las cabeceras, si está apagado o tapado | **Solo habilitar y deshabilitar, y solo con un ámbito de proyecto** (Claude Code guarda ese estado por proyecto). Nunca se crean, editan ni borran servidores; los gestionados son de solo lectura | Llamadas por herramienta, sesiones, proyectos, tendencia, usos por proyecto; servidores sin uso. **Sin coste en tokens** |

Lo que la tabla no marca con un visto, a propósito:

- **MCP no tiene coste en tokens** porque el tamaño de las definiciones de herramientas de un
  servidor solo se conoce conectándose a él, y ai-office nunca se conecta a un servidor, ni lo
  arranca, ni lo sondea. Una cifra sería inventada, así que no se muestra ninguna.
- **Las cifras de coste son estimaciones** (~4 caracteres por token) y cubren solo las descriptions
  de las skills, que Claude Code carga en cada sesión. Los prompts de los agentes y los cuerpos de los
  comandos no entran.
- **No se borra nada.** Jubilar una skill pone una marca en el frontmatter; archivar un agente mueve
  el archivo.
- **Lo de un plugin o lo gestionado nunca se escribe.** El daemon lo rechaza con `read-only`.

## Ámbito

Dos ámbitos, y la elección decide qué contiene el catálogo:

- **Usuario** (`{ kind: 'user' }`): `~/.claude` (agentes, skills, comandos), los plugins instalados
  para el usuario, los servidores MCP de `~/.claude.json` (nivel de usuario), los gestionados, y los
  ajustes de usuario y gestionados. No mira dentro de ningún proyecto.
- **Proyecto** (`{ kind: 'project', path }`): todo lo que cargaría una sesión de Claude Code lanzada
  en ese directorio. Es el `.claude/{agents,skills,commands}` del proyecto, **más** todo el ámbito de
  usuario, **más** los plugins que allí aplican (los instalados para el usuario y los instalados para
  ese proyecto), **más** sus servidores MCP (`<proyecto>/.mcp.json` y la entrada de ese proyecto en
  `~/.claude.json`) y los ajustes de proyecto y locales (`.claude/settings.json`,
  `.claude/settings.local.json`). Si el proyecto es `~` mismo, su `.claude/` es el del usuario y no se
  lee dos veces.

**Cómo se resuelve** (`providers/claude-code/scope.ts`), gana lo primero que aplique:

1. **Flag**: `--project <ruta>` (implica ámbito de proyecto) o `--scope user|project`. `--scope user`
   con `--project` es una contradicción (`conflicting-scope`). `--scope project` sin ruta usa la de
   `config.json` o, si no hay, el proyecto detectado desde el directorio actual; sin ninguna falla con
   `needs-project`.
2. **`config.json`**: `scope: "user"` fija el ámbito de usuario; si no, gana un `project` que todavía
   exista. Un proyecto que ya no está no es un error: la resolución pasa al paso siguiente.
3. **Autodetección**, solo en la CLI (`ai-office`, `census` y `doctor` la piden; el daemon nunca mira
   desde dónde se lanzó): el directorio actual, o la raíz git por encima, si tiene `.claude/` con
   `agents`, `skills` o `commands`, o un `.mcp.json`. `~` y el propio directorio de Claude Code no
   cuentan nunca como proyecto.
4. **Usuario**.

La CLI resuelve una vez al arrancar y le pasa el resultado al daemon, que lo guarda como ámbito
activo. Tanto el rótulo de arranque como `doctor` dicen qué ámbito salió y por qué (flag, config,
auto, por defecto).

**`config.json` y `/api/config`.** `~/.claude/ai-office/config.json` es la configuración propia de
ai-office y no se mezcla nunca con la de Claude Code. Claves: `scope`, `project` (ruta absoluta),
`show` (`agents`, `skills`, `commands`, `plugins`, `mcp`: qué familias enseña la interfaz, con sus
propios valores por defecto) y `lang`. `GET /api/config` devuelve `{ config, configError?, path,
scope, scopeSource, changed }`; `POST /api/config` recibe un **parche**: una clave presente sustituye,
`null` la quita y `show` se combina clave a clave. La validación es estricta (una clave desconocida o
un valor de otro tipo es `invalid-config`, no se ignora) porque un valor raro aquí decidiría qué
directorio se escanea y dónde se permite escribir; un proyecto tiene que existir (`project-not-found`)
y `scope: "project"` necesita uno (`needs-project`). Cambiar `scope` o `project` cambia el ámbito
**sin reiniciar y sin cambiar la URL ni el token**: solo se reescanea el catálogo, el historial se
reutiliza. Un archivo roto en disco es «sin configuración», nunca un fallo de arranque, y el error
viaja en `configError`. Es el único archivo que ai-office escribe fuera del motor de mutaciones (no es
de Claude Code, no hay etag que proteger), pero la escritura es atómica y deja línea de auditoría
(`config.set`).

**Proyectos conocidos.** `snapshot.knownProjects` sale de las claves de `projects` de `~/.claude.json`
y de los `cwd` de los transcripts, unificados por ruta real; primero los que existen, luego por número
de sesiones. El proyecto activo siempre figura en la lista. Se calcula con el historial, así que se
refresca con `/api/refresh`.

**Dónde se puede escribir.** Siempre `~/.claude` y `~/.agents`. Un ámbito de proyecto añade
`<proyecto>/.claude` y nada más: ninguna mutación escribe `<proyecto>/.mcp.json` (los servidores
nunca se crean ni se editan; su estado de encendido va a los ajustes), así que no se autoriza (mínimo
privilegio). `~/.claude.json` se autoriza solo para la única escritura que lo necesita (desactivar un
servidor MCP).

**Precedencia y tapado.** Cuando usuario y proyecto definen el mismo nombre, Claude Code carga solo
uno. ai-office deja al perdedor en el catálogo con `status: "shadowed"` y `shadowedBy`, para que lo
veas, y lo saca de los grafos, de las cifras y de la atribución de uso: lo tapado no es lo que Claude
Code ejecuta. Las reglas, con la fuente oficial de cada una, están en
[CLAUDE-CODE-CONFIG](../CLAUDE-CODE-CONFIG.md) (en inglés); lo que aplica el código (`applyPrecedence`
en `catalog.ts`, `markShadowed` en `mcp.ts`):

| | Regla | ¿Documentada? |
|---|---|---|
| Agentes | proyecto > usuario | sí |
| Skills | usuario > proyecto | sí |
| Comandos | se asume igual que las skills (usuario > proyecto) | **no**: si Claude Code lo resuelve distinto, esto es lo único que cambia |
| Servidores MCP | gestionado > local > proyecto > usuario | sí |
| Contenido de plugins | no compite: sus nombres llevan el prefijo del plugin (`<plugin>:<nombre>`) | sí |

Una entidad archivada, o una que no carga (enlace roto, YAML inválido), ni tapa ni es tapada.

## Plugins y servidores MCP

### Plugins

**De dónde se leen.** `installed_plugins.json` del directorio de plugins (`~/.claude/plugins`;
`CLAUDE_CODE_PLUGIN_CACHE_DIR` lo mueve, salvo con `CLAUDE_HOME`), en sus formas v1 y v2. De cada
instalación: su `installPath` (deducido del layout de la caché `cache/<marketplace>/<plugin>/<versión>`
si falta), el `.claude-plugin/plugin.json` opcional (description, y la versión como respaldo) y las
carpetas por defecto `agents/`, `skills/<nombre>/SKILL.md`, `commands/` y el `.mcp.json`. Las rutas
personalizadas que un manifiesto pueda declarar no se siguen. Una instalación para otro proyecto
(`scope: project|local` con otro `projectPath`) no es del ámbito actual.

**Qué es un plugin en el modelo.** Un `Plugin` (clave `<nombre>@<marketplace>`, versión, `enabled`,
`enabledSource`, los ids de lo que trae, `descriptionTokens`) más su contenido en
`catalog.agents|skills|commands|mcpServers` con `scope: "plugin"`, `plugin: <clave>`, un nombre con el
prefijo del plugin y `source.readOnly: true`. `enabled` sale de `enabledPlugins` combinado clave a
clave sobre usuario < proyecto < local < gestionado (gana el archivo más alto que nombra la clave; un
`true` gestionado fuerza, un `false` gestionado bloquea); un plugin que ningún archivo nombra no está
habilitado. El contenido de un plugin deshabilitado se queda en el catálogo, porque el historial de
cuando estaba habilitado tiene que seguir resolviéndose, pero `liveCatalog` lo saca de los grafos y de
las cifras.

**Cómo se miden.** En los transcripts no hay una «herramienta de plugin»: una skill de un plugin se
llama `plugin:skill`, sus agentes `plugin:agente`, sus comandos `/plugin:comando` y sus servidores MCP
`mcp__plugin_<plugin>_<servidor>__<herramienta>`. Cada uno de esos nombres se resuelve a su entidad, y
la actividad de un plugin se acumula **aparte** con el uso de todos ellos: sumar las entidades
contaría una sesión una vez por skill, y las sesiones y los proyectos son conjuntos.

**Qué se escribe.** `plugin.enable` / `plugin.disable` ponen `enabledPlugins["<nombre>@<marketplace>"]`
a `true` o `false` en un archivo de ajustes, elegido con `value: { scope: "user" | "project" | "local" }`
(usuario por defecto; los otros dos exigen un ámbito de proyecto, `needs-project`). Escribe un `false`
explícito en vez de borrar la clave: una clave borrada dejaría que volviera a ganar el `true` de una
capa inferior, y un `false` explícito se impone. El resto del archivo no se toca y conserva su
indentación. Un archivo de ajustes de proyecto que todavía no existe se crea (su etag es `absent`, y
la creación falla si alguien lo creó entretanto). El plan lleva dos avisos cuando proceden:
`reload-needed` (Claude Code solo relee los plugins al recargar: `/reload-plugins` en las sesiones
abiertas) y `overridden` (un archivo de mayor precedencia, p. ej. el gestionado, fija el valor
contrario: el cambio se escribe pero no surte efecto).

### Servidores MCP

**De dónde se leen** (el ámbito, entre paréntesis):

| Ámbito | Fuente | Exige ámbito de proyecto |
|---|---|---|
| `user` | `~/.claude.json` → `mcpServers` | no |
| `local` | `~/.claude.json` → `projects["<ruta>"].mcpServers` | sí |
| `project` | `<proyecto>/.mcp.json` | sí |
| `plugin` | el `.mcp.json` del plugin o `mcpServers` en su `plugin.json` | no |
| `managed` | `managed-mcp.json` en el directorio gestionado | no |

El ajuste `managedMcpServers` no se lee. La clave de `projects` se busca como la ruta del proyecto,
luego su ruta real, luego cualquier clave cuya ruta real coincida. Los servidores de plugin se llaman
`<plugin>:<servidor>`. Con `CLAUDE_HOME` nunca se lee el directorio gestionado de la máquina real.

**Los secretos los redacta el tipo, no la interfaz.** Un servidor en el modelo no tiene ningún campo
por el que pueda viajar un secreto: solo el **ejecutable** (la primera palabra de `command`, sin
directorios ni argumentos, que llevan tokens con frecuencia: `--token xxx`), el **host** (`URL.host`,
que descarta credenciales, ruta y consulta; una plantilla como `${MCP_URL}/mcp` que no es una URL no
da nada), los **nombres** de `env` y `headers`, y el transporte. Los valores, los argumentos y las URL
completas no llegan nunca al snapshot, así que ninguna vista puede filtrarlos por error.

**Encendido o apagado.** Claude Code guarda ese estado por proyecto, así que solo se conoce con un
ámbito de proyecto; en ámbito de usuario `enabled` es `null` («no se sabe») y cuenta como cargado. En
ámbito de proyecto:

- un servidor de `.mcp.json` está apagado si su nombre figura en `disabledMcpjsonServers` de algún
  archivo de ajustes (`disabledIn` dice cuáles);
- cualquier otro servidor está apagado si su nombre figura en `projects[<ruta>].disabledMcpServers`
  de `~/.claude.json`;
- un servidor de plugin está apagado si su plugin está deshabilitado, o si `plugin:<plugin>:<servidor>`
  figura en esa lista (**supuesto**, tal como lo enseña `/mcp`; Claude Code no lo documenta);
- un servidor gestionado está siempre encendido y es de solo lectura.

**Cómo se miden.** Las llamadas a herramientas salen en los transcripts como
`mcp__<servidor>__<herramienta>`: el prefiltro las admite y `parseMcpToolName` parte por el primer
`__` tras el prefijo, así que un nombre de herramienta puede contener `__`. Claude Code sustituye por
`_` todo lo que no sea `[A-Za-z0-9_-]` al construir ese nombre, y `mcpTranscriptKey` aplica la misma
regla al nombre del catálogo para casarlos. Un nombre de servidor que el catálogo no conoce
(conectores de claude.ai, servidores ya borrados) tiene igualmente su actividad, bajo un id del tipo
`mcp:claude-code/unknown/<clave>`; solo que no tiene ficha. La arista acreditada `agent-uses-mcp`
(agente → servidor) lleva como evidencia las tres herramientas más llamadas; la declarada sale del
frontmatter `tools:`, una por servidor, y se marca `dangling` si el servidor no está en el catálogo (un
servidor desactivado sigue siendo un destino válido).

**Qué se escribe.** `mcp.disable` / `mcp.enable` exigen siempre un ámbito de proyecto
(`needs-project`): sin proyecto no hay lista donde escribir. En qué archivo depende de dónde se
declara el servidor:

- **Servidor de `.mcp.json`** → `disabledMcpjsonServers` de un archivo de ajustes. Desactivar escribe
  en `settings.local.json`, el que no se comparte (`value: { scope }` elige otro). Activar quita el
  nombre de **todos** los archivos de ajustes (user, project, local) donde esté desactivado: dejarlo
  en uno mantendría el servidor apagado sin que nada dijera por qué. `value: { scope }` lo limita a
  ese archivo. Una lista que se vacía se quita, así que activar deja los archivos como estaban antes
  de desactivar. Cuando activar toca más de un archivo, el plan y la aplicación tienen otra forma:
  ver [Edición](#edición).
- **Cualquier otro servidor** (usuario, local, plugin) → `projects[<proyecto>].disabledMcpServers`
  de `~/.claude.json`. La entrada del proyecto se crea si no existe.
- **Servidor gestionado** → se rechaza como `read-only`.

**`~/.claude.json` se edita con una desconfianza extra** (ver [GOTCHAS](GOTCHAS.md)): Claude Code es
el dueño de ese archivo y lo reescribe a menudo, así que ai-office solo lo toca si su texto es
exactamente `JSON.stringify(parseado, null, 2)` (con o sin salto de línea final, que se conserva).
Cualquier otro formato se rechaza con `unexpected-format` en vez de reformatearse, y lo mismo un
archivo cuyo `projects`, entrada o lista no sea del tipo esperado. El etag es obligatorio, como en
toda escritura. Si `~/.claude.json` no existe, la escritura se rechaza con `not-found` /
`claude-json-missing` («Claude Code aún no lo ha creado: abre una sesión primero»): el archivo es
estado de Claude Code, e inventarlo con una sola lista dentro sería escribir su estado desde cero.

## Medir

`activityByTarget` (`providers/claude-code/proven.ts`) devuelve, para cada id de entidad, la misma
forma (`EntityActivity`): `uses`, `sessions` y `projects` (conjuntos), `lastUsedAt`, `grade`,
`active` y las tres series de abajo. De dónde sale la cuenta depende del tipo:

| Entidad | Qué cuenta como uso |
|---|---|
| Agente | una delegación: una llamada a la herramienta `Agent` (o la antigua `Task`) que lo nombra en `subagent_type` |
| Skill | una llamada a la herramienta `Skill` que la nombra |
| Comando | tecleado por el usuario (`history.jsonl`), más el modelo invocándolo mediante `Skill` |
| Servidor MCP | una llamada a cualquiera de sus herramientas (`mcp__<servidor>__<herramienta>`) |
| Plugin | la suma de lo anterior para todo lo que trae |

- **`weekly`**: 12 posiciones, de la más antigua a la actual; la última es la semana en curso. Son
  **ventanas móviles de 7 días** que terminan al construir el snapshot, no semanas de calendario: así
  la serie no cambia de forma según el día en que se mire. Una fecha futura (desfase de reloj) cuenta
  en la última ventana; un uso de hace más de 12 semanas entra en el total pero no en la serie; un
  uso sin marca de tiempo entra solo en el total. La serie no puede llegar más atrás que su fuente:
  Claude Code borra los transcripts a los `cleanupPeriodDays` días, así que skills, agentes y
  servidores MCP cubren esa ventana, mientras que los comandos tecleados salen de `history.jsonl`.
- **`byProject`**: usos por proyecto, con el directorio de trabajo abreviado (`~/dev/x`) o, si la
  fuente no trae `cwd`, el slug de la carpeta. Ausente si no hay datos.
- **`byTool`**: solo servidores MCP: llamadas por nombre de herramienta (`(unknown)` si la llamada no
  nombra ninguna).

**Cómo afecta el ámbito a la cuenta.** `scanTranscripts()` lee los transcripts de todos los proyectos
una sola vez, y el ámbito decide después **qué se cuenta** (`scopeHistory`,
`providers/claude-code/measure.ts`):

- **Ámbito de usuario**: todas las invocaciones y todos los comandos tecleados
  (`measuredOver: { kind: 'all' }`).
- **Ámbito de proyecto**: solo las invocaciones cuyo `cwd` está dentro de la ruta del proyecto, y los
  comandos tecleados (`history.jsonl`) con un `project` dentro de ella (`measuredOver: { kind:
  'project', path, sessions }`). «Dentro» compara rutas reales (el proyecto y cada `cwd` pasan por
  `realpath`; si un directorio ya no existe, su ancestro más cercano que sí existe) y por prefijo de
  ruta **con separador**: `/p/app-old` no está dentro de `/p/app`; los subdirectorios y los worktrees
  bajo el proyecto (`.claude/worktrees/…`) sí. Un worktree fuera de la ruta del proyecto es otra ruta y
  no cuenta. Una invocación sin `cwd` no se puede situar y queda fuera.
  Todo lo derivado se mide sobre ese subconjunto: usos, sesiones, proyectos, `weekly`, `byProject`,
  `byTool`, grados, aristas probadas, ratio activo y las cifras de «sin uso». En un ámbito de proyecto,
  «sin uso» significa por tanto *no usado en este proyecto*.
- Cambiar de ámbito filtra lo ya escaneado: no se vuelve a leer ningún transcript.
- `measuredOver.sessions` es el número de sesiones del proyecto: las que empezaron dentro (primer `cwd`
  de su transcript) más las que tienen alguna invocación contada. La interfaz lo usa para decir sobre
  qué se miden las cifras.
- No filtran por ámbito: `stats.historyPrompts`, `transcriptFiles`/`transcriptBytes` (lo leído) y
  `vocabularyGaps` (el vocabulario de todo lo que has tecleado).
- El grado se adapta al ámbito: midiendo todos los proyectos, *acreditada* pide ≥ 2 proyectos;
  midiendo uno solo (donde los únicos «proyectos» distintos serían sus worktrees) pide uso en ≥ 2
  semanas distintas: repetirse en el tiempo, no en sitios distintos (`gradeOf(…, { singleProject })`).

Lo tapado y lo archivado no recibe uso: no es lo que Claude Code ejecuta. Lo de un plugin
deshabilitado sí, porque lo que pasó mientras estaba habilitado sigue siendo historia.

**El Registro** (*Ledger*; `apps/web/src/Ledger.tsx`, lógica en `ledger.ts`, pura y con tests) es la
tercera vista: una tabla con una fila por agente (no archivado), skill y comando del catálogo.
Columnas: nombre, tipo, grado, usos, sesiones, proyectos, último uso, tendencia (las 12 semanas como
sparkline), coste de description (skills), skills citadas / acreditadas (agentes) y agentes a los que
llama (comandos). Se ordena por cualquier columna, se filtra por tipo y por «solo sin usar», y se
busca por nombre; pulsar una fila selecciona la entidad y abre su ficha, como en las otras vistas.
Cada cabecera cita en su `title` el archivo y el campo del que sale su cifra. Los plugins y los
servidores MCP no tienen filas en él: sus cifras están en el snapshot (`activity`, `stats`) y en el
censo.

## Interfaz

Tres vistas sobre el mismo snapshot, alternables sin perder la selección (la Sala y el Plano lo
dibujan; el Registro lo tabula, ver [Medir](#medir)):

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
- **Registro** (*Ledger*; `apps/web/src/Ledger.tsx`): una tabla ordenable. No tiene cámara, así que no
  implementa `ControlVista`; solo recibe la selección y la comunica.

La ficha lateral (`Ficha.tsx`) es común a todas y siempre cita el archivo del que sale cada dato. Los
diálogos de edición que se abren desde ella (`FichaEdicion.tsx`, `Edicion.tsx`, `Crear.tsx`) pasan por
el mismo flujo en dos tiempos que el resto de escrituras, y el visor de archivo (`VisorArchivo.tsx`)
enseña el archivo de la entidad con sus números de línea REALES, para que una evidencia
`archivo:línea` caiga donde dice.

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
reutiliza el historial; `/api/refresh` recalcula ambos. Un cambio de ámbito (`POST /api/config`) invalida el catálogo y
conserva el historial. Una construcción que empezó antes de una
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


## Edición

Todas las mutaciones pasan por un motor común (`mutations.ts`) en dos tiempos: `plan*` es puro y
devuelve el diff sin tocar nada, `apply*` comprueba el etag, guarda backup, escribe de forma
atómica en el `realPath` y registra la operación en `~/.claude/ai-office/logs/audit.ndjson`. Por HTTP
son `POST /api/mutations/plan` (devuelve el diff, los avisos y el etag) y `POST /api/mutations/apply`
(recibe ese etag; si el archivo cambió entretanto responde `conflict` y no escribe nada).

**Todos los tipos** (`MutationKind`, `daemon/src/mutations/router.ts`):

| Sobre | Tipos | Qué escribe |
|---|---|---|
| Agente | `agent.description`, `agent.body`, `agent.model`, `agent.tools`, `agent.color` | el campo del frontmatter, o el cuerpo, de su `.md`, nada más |
| Agente | `agent.preloadedSkills` | `skills:` del frontmatter; el plan avisa con `preload-cost` y `broken-citation` |
| Agente | `agent.skillMentions` | una sección gestionada del cuerpo entre marcadores `<!-- ai-office:skills:inicio -->` y `…:fin`; la prosa escrita a mano fuera de ella no se toca nunca |
| Agente | `agent.archive`, `agent.unarchive` | mueve el archivo a `agents/.archive/` y de vuelta; nunca pisa |
| Skill | `skill.description`, `skill.body` | el campo del frontmatter o el cuerpo de su `SKILL.md` |
| Skill | `skill.retire`, `skill.unretire` | `disable-model-invocation: true` en `SKILL.md`; no se mueven la carpeta ni los symlinks |
| Comando | `command.description`, `command.argumentHint`, `command.body` | el campo del frontmatter o el cuerpo; un comando sin frontmatter recibe uno |
| Plugin | `plugin.enable`, `plugin.disable` | `enabledPlugins` de un archivo de ajustes (ver [Plugins](#plugins)) |
| Servidor MCP | `mcp.enable`, `mcp.disable` | una lista de servidores desactivados (ver [Servidores MCP](#servidores-mcp)) |

Antes de tocar nada el router comprueba que el tipo case con la entidad (`skill.body` sobre el id de
un agente escribiría en un archivo que no es el que se ve: `wrong-entity-kind`), que no sea de solo
lectura (`read-only`: todo lo de un plugin o lo gestionado) y que el estado de archivo tenga sentido
(`already-archived`, `not-archived`). Escribir en los archivos de un proyecto solo se permite en el
ámbito de ese proyecto (ver [Ámbito](#ámbito)).

**Crear.** `POST /api/entities/plan` y `/api/entities/create` reciben
`{ kind: "agent" | "skill" | "command", name, description, body?, scope?, lang? }`. El archivo nace en
`~/.claude` (`scope: "user"`, por defecto) o en `<proyecto>/.claude` (`scope: "project"`, que exige un
proyecto abierto: `needs-project`). El nombre es `[a-z0-9-]`, de 1 a 64 caracteres; sin `body` se
escribe uno inicial breve en `lang`. El frontmatter se emite con la librería `yaml`, nunca desde una
plantilla (ver [GOTCHAS](GOTCHAS.md)). Un nombre ocupado falla con `file-exists` **antes** de
escribir, y en los agentes uno archivado con ese nombre cuenta como ocupado, porque restaurarlo
después chocaría. La creación va por `applyCreateFile`, aparte del motor: ese exige leer el estado
previo para comparar etags y aquí no hay ninguno que preservar. Comparte validación de raíces,
escritura atómica (`wx`, así que nunca pisa) y auditoría, para que crear no sea un agujero por el que
se escriba sin dejar rastro. No se pueden crear plugins ni servidores MCP.

**Flujos.** Un comando compuesto en el lienzo es el archivo entero: uno nuevo se crea en
`~/.claude/commands`; uno existente (de usuario o de proyecto) se reescribe **en su sitio**, en su ruta
real y con su nombre real (`commands/ns/x.md` es `ns:x`, y un comando que es symlink no debe
reemplazarse por un archivo suelto).

**Lotes.** Asignar una skill a varios agentes es **una mutación por agente** (`agent.skillMentions`
con la lista completa de cada uno), no una operación especial. La interfaz las planea todas antes de
enseñar nada y muestra un único diálogo con el diff combinado y un solo «guardar». Al guardar se
aplican **en orden y una a una**, cada una con su etag, porque son archivos distintos: no hay
transacción. Si una falla, lo ya escrito queda escrito, se retira del diálogo, y lo pendiente se
queda ahí con el error a la vista.

**Entidades de solo lectura.** Todo lo que tenga `source.readOnly` (contenido de plugins, servidores
gestionados) se puede ver, abrir y medir pero no editar: el daemon responde `read-only`. Son copias
que una actualización sobrescribe, o política de otro.

**Planes que escriben más de un archivo.** Solo `mcp.enable` sobre un servidor de `.mcp.json` desactivado
en varios archivos de ajustes (y sin `value.scope`). La respuesta de `POST /api/mutations/plan` es la
de siempre más `files`: un `{ scope, path, diff, changed }` por archivo, en orden user, project, local.
Entonces `path` es el del primero, `diff` es la concatenación de los diffs de todos, `changed` es que
cambie alguno y **`etag` es compuesto** (`multi:<hash>` de todas las rutas y etags): el cliente lo
devuelve tal cual en `POST /api/mutations/apply`, el daemon lo recalcula y, si algún archivo cambió,
responde `conflict` sin escribir nada. Después los aplica **en orden, uno a uno, cada uno con su propio
etag**: no hay transacción, así que si uno falla los anteriores quedan escritos. La respuesta del
apply es el `{ path, etag, backup }` de siempre del primer archivo más `files: [{ path, etag, backup }]`
en el orden aplicado; su `etag` es el compuesto de los nuevos. Con un solo archivo (cualquier otra
mutación, o con `value.scope`) no cambia nada: sin `files`, con el etag del propio archivo.

**Citar skills.** `agent.skillMentions` escribe cada skill como se invoca y donde vive: una skill de
usuario como `~/.claude/skills/<n>/SKILL.md`, una de proyecto como `.claude/skills/<n>/SKILL.md` y una de
plugin por su nombre invocable `` `<plugin>:<n>` `` sin ruta (los archivos de un plugin cambian de
carpeta con cada versión). Lo decide el daemon desde el catálogo (`value` sigue siendo la lista de
nombres); un nombre que el catálogo no conoce se cita como de usuario. El grafo declarado reconoce las
tres formas, y `plugin:n` no cuenta como cita de una skill de usuario `n`.

**Los archivos JSON se escriben distinto que el Markdown.** `plugin.*` y `mcp.*` usan el mismo motor
(`json-mutations.ts`) con dos diferencias: el archivo puede no existir todavía (unos ajustes de
proyecto) y lo que se escribe es JSON, así que solo se toca la clave pedida. Los archivos de ajustes
conservan su indentación. `~/.claude.json` es la excepción, y la más estricta: ver
[Servidores MCP](#servidores-mcp).

Los backups van a `~/.claude/ai-office/backups/<tipo>/<nombre>/` y la línea de auditoría anota los
hashes de antes y después y la diferencia de bytes.

## Probar sin tocar la configuración real

`paths()` respeta la variable `CLAUDE_HOME`, así que se puede levantar el daemon contra una copia:

```bash
CLAUDE_HOME=/tmp/mi-copia node packages/cli/src/index.ts start
```

También respeta `CLAUDE_CONFIG_DIR`, la variable oficial de Claude Code (con `CLAUDE_HOME` por
delante cuando están las dos). Es como se prueban las escrituras de verdad —crear un comando, dar color a un agente, jubilar una
skill, deshabilitar un plugin— sin riesgo para la instalación del usuario. Con cualquiera de las dos
variables `.claude.json` vive dentro de ese directorio. Solo con `CLAUDE_HOME` también se mueven
dentro el directorio de plugins y el gestionado (`<dir>/managed`), así que una copia de pruebas nunca
lee los plugins ni los ajustes gestionados de la máquina real; `CLAUDE_MANAGED_DIR` mueve el
gestionado de forma explícita.

## La instalación de demostración

`packages/cli/src/demo/` define una oficina ficticia (catálogo en `catalog.ts`, actividad en
`synth.ts`) y la escribe con la forma exacta de `~/.claude`: agentes, skills, comandos,
`settings.json`, `history.jsonl` y transcripts con subagentes. También escribe lo que necesitan el
ámbito de proyecto y los plugins: dos plugins ficticios con el layout de la caché de Claude Code y un
`installed_plugins.json` v2 (uno habilitado y otro no), servidores MCP de usuario en `.claude.json` y
un proyecto (`acme-web`) con su propio `.claude/agents` (un agente tapa a uno del usuario) y un
`.mcp.json`. Los secretos de esas definiciones MCP son inventados a propósito: un test comprueba que
nunca llegan al snapshot. La demo se abre en el ámbito `acme-web` mediante su `config.json`. La
actividad se sintetiza RELATIVA a la fecha de hoy con un PRNG de semilla fija: el grado caduca a 90
días, así que una demo con fechas congeladas se iría apagando sola.

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
