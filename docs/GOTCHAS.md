# Gotchas que ya costaron tiempo

Cada uno de estos costó al menos una sesión de depuración. Léelos antes de tocar la Sala, el
Plano, el daemon o los hooks: casi todos fallan **en silencio**.

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
