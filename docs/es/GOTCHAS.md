# Gotchas que ya costaron tiempo

[English](../GOTCHAS.md)

Cada uno de estos costó al menos una sesión de depuración. Léelos antes de tocar la Sala, el
Plano, el daemon, los hooks o lo que se escribe en los archivos de Claude Code (plugins, MCP, ámbito):
casi todos fallan **en silencio**.

**Variables CSS en SVG.** Un atributo de presentación (`fill="var(--ink)"`, `stroke="var(--x)"`) NO
resuelve variables CSS: el elemento se dibuja invisible, sin ningún error en consola. Los colores
van siempre por `style={{ fill, stroke }}`, que sí es propiedad CSS. Pasó en `Plano.tsx` y costó
una sesión de depuración con el DOM correcto y la pantalla en blanco.

**d3-force dentro de React.** No animar la simulación con `requestAnimationFrame` + `setState`: con
StrictMode el doble montaje deja el layout colapsado en el origen, y además contradice la regla de
no meter estado de 60 fps en React. Se calcula el layout de una vez (`sim.stop()` + N ticks) y se
congela; queda determinista y el pan/zoom es lo único interactivo.

**pnpm 11 y los build scripts.** La aprobación va en `pnpm-workspace.yaml` con la clave
`allowBuilds: { esbuild: true }`. Ni `onlyBuiltDependencies` en `package.json` ni en `.npmrc`
funcionan en esta versión, y `pnpm approve-builds` escribe una clave duplicada que rompe el YAML.

**Vite escucha en IPv6 y el daemon en IPv4.** El dev server responde en `localhost` (`::1`) pero no
en `127.0.0.1`; el daemon solo en `127.0.0.1` a propósito. El proxy de Vite los une, y necesita
**`ws: true`** o el upgrade del WebSocket no se reenvía: la interfaz se queda sin eventos en vivo
en silencio, sin ningún error.

**El guard de Fastify se salta con una ruta codificada.** Decidir con `req.url` a pelo
(`startsWith('/api/')`) deja pasar `POST /%61pi/mutations/apply` sin token: find-my-way decodifica
el percent-encoding ANTES de enrutar, así que el manejador de `/api/...` se ejecuta aunque el guard
no vea `/api`. El guard decide con la ruta normalizada (decodificada, también el doble, con `//`,
`..` y mayúsculas resueltos) y con la que el router resolvió, y trata lo público como lista blanca
exacta, no al revés. Lo cubre `packages/daemon/test/auth.test.ts`, incluida una petición HTTP real.

**El frontmatter YAML no se escribe con plantillas.** `description: ${texto}` a pelo es una
inyección: un `:` o un `#` lo rompen y un salto de línea seguido de `allowed-tools: Bash(*)` añade
una clave que Claude Code obedece. `compileFlow` emite el frontmatter con la librería `yaml`, y las
notas libres se sanean para que no puedan abrir otro bloque `---` ni falsificar los marcadores de
flujo. Mismo cuidado con los nombres de agente al construir una `RegExp`: se escapan.

**El WebSocket no puede autenticarse por cabecera.** Una petición de upgrade no lleva
`Authorization`, así que el guard deja pasar `/api/live` y el token viaja en el primer frame. Si se
olvida esa excepción, el socket abre y se cierra sin decir por qué.

**El token cambia en cada arranque del daemon.** Pegar el enlace nuevo en una pestaña ya abierta
solo cambia el hash y no recarga la página, así que leer el token una vez al cargar el módulo deja
la interfaz muerta con 401 sin explicación. Se relee en cada petición y se escucha `hashchange`.

**El hook sabe nombres, no identidades.** Un evento trae `skill: "style-guide"`, no el id del
catálogo. El daemon lo resuelve al publicar, que es donde el catálogo existe; sin eso la interfaz
recibe el evento pero no sabe a qué figura de la sala corresponde y no pasa nada visible.

**El pixel art depende de cuatro cosas a la vez, y con que falte una se convierte en acuarela.**
`resolution: 1` en la `Application` (no `devicePixelRatio`), `antialias: false`, `scaleMode:
'nearest'` en TODA textura, escala de cámara **entera** (nada de 1,37) y `image-rendering:
pixelated` en el canvas. Quien ampliaba era el navegador, y sin esa última línea de CSS interpola
y se pierde de golpe el aspecto que costó toda una sesión conseguir.

**Reducir pixel art generado se hace por MODA, no por media.** Las hojas salen a 1024 px y hay que
bajarlas a ~70. Cualquier redimensionado normal promedia e inventa colores intermedios: los bordes
se emborronan y la paleta deja de estar cerrada. `tools/sprites/recortar.mjs` toma el color más
repetido de cada bloque, y el bloque sale transparente si menos de la mitad tenía tinta. Además,
todas las piezas de una hoja se reducen con el MISMO factor (`--alto` se aplica a la más alta):
escalar cada una a su altura destruiría las proporciones entre una silla y una persona.

**La baldosa isométrica ensancha 2·w/h por fila, no w/h.** Con la mitad del ancho las baldosas no
se tocan y el suelo sale agujereado, cosa que solo se ve al mirar de cerca. Y cubre algo MÁS que
el rombo geométrico a propósito: las dos filas centrales van las dos a ancho completo para que las
baldosas engranen en vez de dejar una costura. Los dos hechos están fijados en `lienzo.test.ts`.

**Las paredes van de una pieza.** Teselar una pared inclinada por baldosas deja una costura de un
píxel en cada junta que se ve muchísimo al ampliar. `paredLarga(segmentos, lado)` genera la pared
entera en un lienzo.

**Renombrar una variable CSS rompe el Plano en silencio.** `Plano.tsx` resuelve `var(--ink)` y
compañía DESDE JS. Un `var()` que no existe no da error ni aviso: simplemente no pinta. Por eso
`styles.css` mantiene nueve alias en inglés apuntando a la paleta en español. Es el mismo gotcha
de arriba visto desde el otro lado.

**El `stage` de Pixi con `hitArea` universal se traga el tap.** El manejador de "clic en el vacío"
recibe también el evento que ya atendió una figura, así que deselecciona justo después de
seleccionar y el clic parece no hacer nada. Hay que comprobar `e.target === stage`.

**Separar rótulos exige un escalón mayor que el propio rótulo.** Bajar 12 px un texto de 16 sigue
solapando, y un escalonado fijo o por carriles tampoco vale: cada rótulo arranca a la altura de su
figura. Se comparan rectángulos de verdad y el escalón sale de `rotulo.height`.

**`Escena.iniciar()` es asíncrono y el snapshot llega antes.** Carga veinte texturas; el efecto de
React que aplica el snapshot corre mucho antes y, como el snapshot ya no vuelve a cambiar, no se
repetiría nunca y la sala se quedaría vacía. `Sala.tsx` guarda el último en una `ref` y lo aplica
al resolverse. Por lo mismo, cualquier sonda de depuración contra la escena tiene que esperar a
que cargue: medir a los dos segundos da "no se ejecuta" y manda a perseguir un fallo que no existe.

**El inspector del navegador corre en un mundo aislado.** No ve los `globalThis`/`window` que pone
la página. Para sacar una medición de dentro de Pixi hay que escribirla al DOM (`dataset`,
`document.title`), que sí es compartido.

**Vite sirve `index.html` desde la caché del navegador.** Tras un `pnpm build:web`, recargar normal
puede seguir cargando el bundle anterior por su hash viejo, y se depura una y otra vez un fallo ya
corregido. Recarga dura (cmd+shift+R) antes de dar nada por roto.

**Agrupar por similitud sin descontar lo común no agrupa nada.** Media plantilla cita las mismas
skills de contexto, así que un Jaccard a pelo da un bloque de nueve agentes y cuatro sueltos. Con
IDF (y solo con IDF) salen nueve despachos con sentido. Está medido en `salas.test.ts`.

**La planta ya no tiene tamaño fijo.** `iso.ts` exportaba `COLS`/`ROWS` como constantes; ahora el
suelo depende de cuántos despachos salgan del reparto, así que `toScreen` devuelve coordenadas
SIN desplazar y el origen (`origenX(filas)`) se aplica una sola vez al contenedor del mundo.

**La rejilla más cuadrada NO es la más pequeña.** En isométrico el rombo mide `(cols + filas)` de
ancho y la mitad de alto, así que la forma de la rejilla no cambia la proporción en pantalla, solo
el tamaño — y como una celda es más ancha que alta, con diez despachos 2x5 ocupa 960 px y 4x3
ocupa 1024. Se busca a lo bruto el reparto que minimiza `cols + filas`.

**Falta una esquina entre las dos paredes exteriores.** El tramo que va del vértice izquierdo de
la primera baldosa al vértice superior no pertenece a ninguna de las dos paredes: hay que dibujar
la del fondo con un segmento MÁS, medio paso a la izquierda y medio arriba, o queda una muesca
negra justo donde primero mira el ojo.

**Diecinueve rótulos no caben en una planta, y ningún reparto lo arregla.** A vista general mandan
las placas de los despachos; los nombres se encienden al pasar de 2x de zoom, al señalar el
despacho o al seleccionar a alguien. Intentar que quepan todos fue tiempo perdido dos veces.

**Sin pasillo, los despachos no se leen como despachos.** Pegados unos a otros la planta parece
una sola nave a rayas de colores. El pasillo no hace falta dibujarlo: basta con que el suelo que
no pertenece a ninguna bahía salga con el parqué del edificio.

**Al reducir por debajo de 1x hay que cambiar a filtrado `linear`.** `nearest` es obligatorio al
AMPLIAR —es lo que mantiene el píxel duro— pero al reducir va tirando uno de cada dos píxeles y
la miniatura queda comida y parpadeante. Por eso `texturas.ts` lleva un registro de todo lo
creado y `filtrarTodo()` cambia el modo al cruzar el 1x, no en cada cuadro.

**El minimapa comparte proyección con la planta.** Uno cenital sería más legible en abstracto,
pero entonces el recuadro de "lo que estás viendo" saldría girado y deformado; compartiendo
proyección es un rectángulo, y hay que recortarlo al panel o al alejarse pinta dos rayas sueltas
por encima de la escena.

**Un `replace` que no encuentra su texto no avisa.** Pasó al editar `escena.ts` justo después de
un `biome check --write`, que había colapsado un encadenamiento de varias líneas en una sola: la
sustitución no casó, no falló, y se depuró durante un rato un arreglo que nunca llegó al archivo.
Si editas por script, **afirma que el patrón existe** antes de sustituir.

**Un lienzo de Pixi no se entera de que su contenedor cambió de tamaño.** `resizeTo` solo escucha
el `resize` de la VENTANA. Al descartar la banda de bienvenida o al aparecer una banda de error,
el contenedor crece pero el canvas se quedaba con el tamaño viejo y dejaba una franja negra.
`Escena` observa el host con un `ResizeObserver` y llama a `app.resize()`.

**Resolución entera es la única excepción a `resolution: 1`.** Con un devicePixelRatio ENTERO (2,
3) cada píxel de arte es un bloque exacto de 2x2 o 3x3 físicos, idéntico a lo que hacía el
navegador al ampliar, y los rótulos de texto salen nítidos en Retina. Con 1,25 o 1,5 el reparto es
desigual y se rompe el pixel art: ahí se queda en 1. Comprobado a ojo con `agent-browser set
viewport 1280 700 2`.

**Dos vistas montadas a la vez se ocultan con `visibility`, no con `display: none`.** Con
`display: none` el host mide 0x0 y Pixi, que solo reacciona al `resize` de la ventana, queda con un
lienzo de tamaño cero al volver. La Sala oculta además pausa su ticker.

**Pixi no se destruye dos veces ni a medio inicializar.** Si `destruir()` llega mientras
`iniciar()` espera a Pixi o a las texturas, `Escena` lo registra y `iniciar` se retira solo;
`destruir()` es idempotente.

**El zoom con rueda no puede dar un paso por evento.** Un gesto de trackpad son cientos de eventos
y llevaba de 0,5x a 4x de un golpe. `Escena.rueda` acumula y da UN paso por gesto (silencio de
140 ms entre gestos); para más, `+`/`-`.

**El token se relee por `hashchange` Y se reconecta el WebSocket.** `api.ts` avisa a los
suscriptores (`subscribeToken`): `App` recarga el snapshot y `useLiveConnection` reabre el socket
con el token nuevo. `connected` solo pasa a true al recibir la primera respuesta: un token malo
también abre el socket y el servidor lo cierra sin decir por qué.

**El 500 vacío de Vite es "no hay daemon".** Con el daemon caído, el proxy de desarrollo contesta
500 sin cuerpo JSON; el daemon siempre contesta sus errores con JSON. `api.ts` traduce un 5xx sin
JSON a "no se puede hablar con el daemon".

**HMR de Vite duplica `api.ts` si lo editas con la página abierta.** Quedan dos copias del módulo
con tokens distintos y el estado parece roto sin estarlo. Recarga dura antes de depurar.

**`fs.watch` pierde lo que ocurre justo después de crearse (macOS).** Un hook que escribe en el
spool en los primeros milisegundos tras arrancar el daemon no dispara ningún evento, y no hay
error. Se vio como un test intermitente (~5 %) de `watchSpool` que dejaba el proceso colgado.
`watchSpool` no confía solo en el watcher: revisa el directorio cada segundo.

**Leer-y-borrar el spool pierde líneas.** El relay sigue añadiendo al archivo del día mientras el
daemon lo procesa. Se renombra a `.draining` antes de leer: el relay crea uno nuevo y nada se pisa.

**Un hook registrado desde la caché de `npx` muere en silencio.** Claude Code ignora un hook cuyo
archivo ya no existe. Por eso `hooks install` copia el relay a `~/.claude/ai-office/bin/` y registra
esa ruta; `doctor` avisa si un hook de settings.json apunta a algo que ya no existe.

**Las mamparas laterales de un despacho se dibujaban una baldosa desplazadas.** `mamparaColumna`
colocaba el lienzo con el mismo desplazamiento `(-w/2, +h/2)` que la pared exterior izquierda, pero
el lienzo de una pared que SUBE hacia la derecha tiene su borde inferior izquierdo en
`(0, longitud·h/2 + alto)`, no en `(0, alto)`. Por dentro de la planta se disimulaba (caía sobre el
pasillo); en el borde del edificio salía flotando fuera del suelo. La esquina inferior izquierda
del lienzo tiene que caer EXACTAMENTE en `toScreen(col, row1)`.

**El primer encuadre puede hacerse con el tamaño viejo del lienzo.** Si el snapshot llega antes de
que la cabecera, la bienvenida o un aviso terminen de ocupar su sitio (pasa siempre en la demo
estática, que lee un JSON local en milisegundos), `encajar()` calcula con un alto que ya no es el
real y la planta queda fuera de la vista: lienzo "vacío" sin ningún error. Mientras el usuario no
haya movido la cámara, cada cambio de tamaño vuelve a encuadrar.

**`frontmatter.ts` no puede importar nada de Node.** El compilador de flujos (`compile.ts`) corre
también en el navegador, en la demo estática, y arrastra a `frontmatter.ts`. Por eso `etagOf`
(que usa `node:crypto`) vive aparte, en `etag.ts`. Un import de Node ahí rompe la demo en el build.

**En macOS el directorio temporal es un symlink** (`/var` → `/private/var`). Los `realPath` del
catálogo salen con la forma resuelta, así que al reescribir rutas temporales (el snapshot de la
demo) hay que sustituir las dos formas o queda un `/private~/.claude/...` en pantalla.

**i18n: el catálogo en inglés es la fuente de verdad.** Todo texto visible entra primero en el
catálogo inglés (la web y el CLI tienen cada uno el suyo) y el español se deriva de él: un test
comprueba que el español tiene exactamente las mismas claves, así que una clave que falta o sobra
rompe la CI en vez de enseñarle a alguien una clave cruda. Y los textos de Pixi de la Sala
(rótulos, placas) no son React: no se repintan solos al cambiar de idioma, así que la escena los
regenera al cambiar. Añadir un texto en Pixi sin pasar por ese camino lo deja pegado al idioma
anterior, sin ningún error.

**`t()` fuera de React no re-renderiza nada.** La Sala la dibuja Pixi, fuera de React: sus placas,
tooltips y rótulos se escriben una vez al pintar la escena. Cambiar de idioma tiene que volver a
aplicar el snapshot a la escena (lo hace `Sala.tsx`), o la Sala se queda en el idioma anterior
mientras el resto de la página cambia. Los avisos efímeros se redactan al crearse y conservan su
idioma; los errores de las bandas y los diálogos guardan su clave y se vuelven a traducir.

**Los diálogos de edición se pintan en un portal sobre `<body>`.** Los abre la ficha lateral, y
dentro del `aside` heredaban sus estilos (sus reglas `aside.side h3` alcanzan al título del diálogo)
y su desplazamiento, y se recortaban con su caja. `Dialogo.tsx` pinta todos los diálogos con
`createPortal(…, document.body)`. No falla nada: el diálogo sale mal estilado o cortado y el CSS
parece correcto.

**`~/.claude.json` lo reescribe Claude Code, así que solo lo editamos si podemos reproducirlo byte a
byte.** Ese archivo es estado de Claude Code, no configuración, y lo reescribe a menudo. Una escritura
que lo volviera a serializar cambiaría su formato (y quizá números o escapes que no sobreviven al
viaje de ida y vuelta) en un archivo cuyo formato es de Claude Code.
`computeSetClaudeJsonMcpDisabled` lo parsea y exige que el original sea exactamente
`JSON.stringify(parseado, null, 2)` (con o sin salto de línea final, que se conserva); si no, lo
rechaza con `unexpected-format` en vez de reformatearlo. Los archivos de ajustes son distintos a
propósito: son nuestros para editar, así que se detecta y se conserva su indentación.

**Borrar una clave de `enabledPlugins` no deshabilita el plugin.** La clave se combina entre
usuario < proyecto < local < gestionado, así que quitarla de un archivo deja que vuelva a ganar un
`true` de uno inferior, y el plugin sigue encendido sin ningún error. Deshabilitar escribe un `false`
explícito. Un `false` en un archivo que otro superior anula (el gestionado) se escribe pero no surte
efecto: el plan avisa con `overridden`.

**Los servidores MCP desactivados viven en dos sitios distintos, y escribir en el equivocado no hace
nada.** Uno de `.mcp.json` se apaga por nombre en `disabledMcpjsonServers` de un archivo de ajustes;
cualquier otro (usuario, local, plugin) en `projects[<ruta>].disabledMcpServers` de `~/.claude.json`.
La lista equivocada es JSON válido que Claude Code simplemente nunca consulta para ese servidor.

**La clave de un proyecto en `~/.claude.json` no está documentada, y una equivocada es silenciosa.**
El ámbito guarda la ruta real del proyecto; Claude Code puede haberlo registrado con la ruta tal como
se tecleó (a través de un symlink; en macOS `/tmp` es `/private/tmp`). `claudeJsonProjectKey` prueba
la ruta, su ruta real y cualquier clave cuya ruta real coincida; si no hay ninguna, se crea una
entrada nueva bajo la ruta real, que Claude Code quizá nunca lea. Lo mismo con el nombre de un
servidor de plugin en esa lista (`plugin:<plugin>:<servidor>`, como lo enseña `/mcp`): es un
supuesto, no un hecho documentado.

**En ámbito de usuario un servidor MCP no está ni encendido ni apagado: su estado se desconoce.**
Claude Code lo guarda por proyecto, así que sin uno el valor honesto es `enabled: null`, no `true`.
Cuenta como cargado y el interruptor se rechaza (`needs-project`); enseñarlo como «encendido» sería
afirmar algo sin fuente.

**El nombre de una herramienta MCP no es el nombre del config.** Claude Code sustituye por `_` todo
lo que no sea `[A-Za-z0-9_-]` al construir `mcp__<servidor>__<herramienta>`, y el servidor de un
plugin pasa a ser `plugin_<plugin>_<servidor>`. Casar por el nombre crudo hace que un servidor parezca
sin uso sin ningún error; `mcpTranscriptKey` aplica la misma regla al catálogo. Y el prefiltro de
`transcripts.ts` tiene que conocer `"name":"mcp__`: si no, las llamadas no llegan nunca al parser y un
servidor con cientos de llamadas no enseña ninguna.

**El ámbito filtra lo que se cuenta, no lo que se lee.** Los transcripts se escanean una vez; un ámbito
de proyecto se queda luego solo con las invocaciones cuyo `cwd` está dentro del proyecto (rutas reales,
prefijo CON separador, worktrees y subdirectorios incluidos) y uno de usuario con todas. «Sin uso» en un
proyecto significa «no usado en este proyecto». Tres trampas: comparar rutas como cadenas falla a
través de un symlink (`/tmp` frente a `/private/tmp` en macOS) y con un worktree borrado, que
`realpath` no puede resolver (se resuelve su ancestro existente más cercano); un `startsWith(ruta)` a
pelo mete `/p/app-old` dentro de `/p/app`; y una invocación sin `cwd` no se puede situar, así que no
cuenta en ningún proyecto. Los comandos tecleados (`history.jsonl`) se filtran igual por su `project`,
y por eso sus eventos llevan ahora el `sessionId`. El snapshot dice sobre qué midió en `measuredOver`:
si la interfaz enseña «sin uso» tiene que decir sin uso dónde.

**Una skill de plugin se cita por nombre, y el grafo tiene que leerlo.** Su ruta cambia con cada
versión, así que `agent.skillMentions` escribe `- **kit:lint** — \`kit:lint\``. Dos detalles de
`findMentions`: una línea es UNA mención aunque el nombre salga dos veces (la del negrita va primero y
no lleva backtick, así que juzgar solo el primer acierto descartaba una cita perfectamente explícita),
y un `:` antes del nombre no cuenta como frontera, o citar `kit:lint` acreditaría a la skill de usuario
`lint`.

**La actividad de un plugin no es la suma de la de sus entidades.** Tres skills de un plugin usadas
en una misma sesión son una sesión, no tres: las sesiones y los proyectos son conjuntos.
`activityByTarget` acumula el cubo del plugin en paralelo a cada uso en vez de sumar a los hijos, y
sumarlos en la interfaz infla las sesiones y, con ellas, el grado.

**`CLAUDE_HOME` tiene que aislar todo, o un test lee la máquina real.** Además de `agents/`, `skills/`
y `settings.json`: el directorio de plugins (si no, lee `CLAUDE_CODE_PLUGIN_CACHE_DIR` y el
`installed_plugins.json` real), el directorio gestionado (el `managed-settings.json` y el
`managed-mcp.json` de la máquina se colarían en una copia) y `.claude.json` (que vive DENTRO del
directorio, no en `~/`). Un test que ve un plugin que nunca instaló es esto.
