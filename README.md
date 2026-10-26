# ai-office

**¿Qué mitad de tu configuración de Claude Code no usas nunca?**

`ai-office` lee tus agentes, skills y comandos, los cruza con lo que de verdad ha pasado en tus
sesiones, y te enseña las dos cosas juntas: el organigrama que escribiste y el que existe.

```
npx ai-office censo
```

```
  agentes                            19   10 no han trabajado nunca
  skills                             40   24 no se han usado nunca
  comandos propios                   27   ninguno se ha ejecutado

  ratio activo  ████░░░░░░░░░░░░░░░░░░░░  15%
```

## Por qué existe

Cuando llevas un tiempo con Claude Code acumulas agentes, skills y comandos que te parecieron
buena idea. Nada te dice cuáles sobreviven. Los gestores de skills que hay te enseñan un
inventario; los visualizadores de sesiones te enseñan un instante. Ninguno te enseña **una hoja
de servicios**.

El hallazgo que da sentido al proyecto: **el grafo ya está escrito, en prosa**. Los agentes citan
skills en el cuerpo de su prompt (*"antes de trabajar, lee tal skill"*), los comandos nombran a los
agentes que convocan, y algunas skills declaran su clientela. Nada de eso es un campo estructurado,
así que ninguna herramienta lo ve. `ai-office` lo extrae, con el archivo y la línea que lo
justifican, y lo superpone a lo que los transcripts demuestran que pasó.

En una instalación real: 66 relaciones agente→skill escritas en los prompts, 0 en el campo
`skills:`, y 13 demostradas en el historial. Esa brecha es el producto.

## Las cuatro capas

| Capa | De dónde sale | Qué afirma |
|---|---|---|
| **Disponible** | las skills instaladas | cualquiera puede invocarla si el modelo lo decide |
| **Encomendada** | prosa del cuerpo del agente | su prompt se lo manda, nadie lo garantiza |
| **Precargada** | `skills:` del frontmatter | se carga siempre, cueste lo que cueste |
| **Acreditada** | transcripts | lo hizo, N veces, la última el X |

Manda la acreditada: es la única respaldada por hechos.

## Principios

- **Nada sale de tu máquina.** Sin servidor, sin telemetría, sin cuenta, sin red. Lee `~/.claude`
  y ya.
- **Todo indicador cita su fuente.** Si un número no puede decir de qué archivo y qué campo sale,
  no se muestra. Ver [docs/METRICAS.md](docs/METRICAS.md), donde también está la métrica que
  probamos, no se sostuvo contra los datos, y descartamos.
- **Ninguna cifra mejora por gastar más.** El *ratio activo* sube al usar lo que ya tienes o al
  jubilar lo que no usarás. El grado de una skill satura: el uso nº 50 no vale más que el nº 3.
- **Nada se borra.** Jubilar es reversible; toda escritura lleva diff previo y copia de seguridad.
- **El formato interno de Claude Code es frágil y se trata como tal.** El historial es
  enriquecimiento, nunca una dependencia de arranque: si cambia el formato, se pierde el
  historial, no el producto.

## Las dos vistas

**Sala** — la planta, en pixel art isométrico. No es una sala grande: son **despachos**, y el
reparto no lo decide un tema inventado sino dos hechos que ya están escritos en tus archivos —
qué skills cita cada agente en su prompt y qué comandos lo convocan. Por eso cada puerta lleva
el nombre de una skill o de un comando de verdad (`style-guide`, `/release`, `sql-recipes`) y
al señalarla te dice por qué están juntos: *«Los 6 citan `style-guide` en su prompt»*.

En el vestíbulo del centro estás tú, con el **archivo** de las skills que cita media planta y el
**depósito** de las que no reclama ningún agente. Son montones opuestos y por eso están
enfrentados: esa comparación es el producto entero.

Los despachos están separados por **pasillos** y cada uno tiene su puerta, como la planta de
cualquier juego de gestión de oficinas: el ojo necesita suelo vacío por medio para entender que
dos cosas están separadas. El pasillo no se dibuja, se deduce — es el suelo que no pertenece a
ningún despacho, así que sale con el parqué del edificio mientras cada despacho lleva su moqueta.

Dentro de un despacho la posición sigue siendo dato: un agente **en gris** nunca ha sido
delegado, la altura del lomo de una skill es su grado y un lomo en blanco —sin tejuelo— es una
skill que nadie ha usado. A vista de planta mandan las placas; los nombres aparecen al acercarse
o al señalar un despacho, porque diecinueve nombres a la vez no caben a ningún tamaño.

Con pasillos la planta ya no cabe entera ni en una ventana maximizada, así que la cámara tiene un
paso de **alejamiento** para verla completa y un **minimapa** abajo a la izquierda: enseña los
despachos con su color y el recuadro de lo que estás mirando, y se puede pinchar y arrastrar para
moverse por la planta.

**Plano** — el grafo. Las tres capas superpuestas: punteado lo que tus prompts declaran, sólido lo
que los transcripts demuestran. Al seleccionar algo, la ficha lateral cita el archivo y la línea de
cada afirmación.

## El cartel

```bash
ai-office censo --cartel mi-oficina.svg
```

Un SVG con los tres números y una figura por cada cosa que tienes, rellena si la usas y hueca si
no. Es texto, no necesita dependencias y se ve en GitHub.

## Editar

Todo lo que se edita pasa por el mismo sitio: **se muestra el diff antes de tocar el disco**, se
guarda una copia previa y queda una línea en el registro de auditoría. Nada se borra.

- **Arrastrar** de un agente a una skill en el Plano escribe la relación en su prompt.
- **La ficha** de un agente edita su `color`, su `model` y lo archiva; la de una skill la jubila
  (`disable-model-invocation`), que es la acción que más sube tu ratio activo.
- **El lienzo de flujos** compone un slash command: quién interviene, en qué orden y qué consulta.
  Los pasos de la misma fase se ejecutan en paralelo, y la vista previa enseña el Markdown exacto
  que se va a escribir. Los comandos que ya tienes se importan al lienzo.

## Tiempo real

Con los hooks instalados, la Sala se anima mientras trabajas en otra ventana: los agentes se
materializan al ser delegados y el lomo de una skill se ilumina al invocarse. Cada uno de esos
eventos deja rastro permanente en las fichas — a diferencia de un visualizador, aquí **ver trabajar
cambia lo que las cosas son**.

```bash
ai-office doctor          # qué hay instalado y con qué hooks tuyos convive
ai-office hooks install   # enseña el diff; no escribe sin --yes
```

## Estado

| Fase | Qué | Estado |
|---|---|---|
| F1 | Censo, catálogo, grafo declarado y acreditado, Sala y Plano, cartel | **listo** |
| F2 | Tiempo real por hooks y edición del grafo y las fichas | **listo** |
| F3 | Compilador de flujos, plugin de Claude Code, paquete npm | **listo** |

## Como plugin de Claude Code

```bash
claude plugin marketplace add alex-roc/ai-office
claude plugin install ai-office@ai-office
```

Instalarlo como plugin es la vía recomendada: sus hooks se declaran aparte y **no se toca tu
`settings.json`**, donde viven tus permisos y tus otros hooks. Añade el comando `/censo`.

## Desarrollo

Requiere Node ≥ 22.16 (ejecuta TypeScript sin transpilar) y pnpm.

```bash
pnpm install
pnpm censo        # el censo sobre tu propia instalación
pnpm test         # suite
pnpm typecheck
```

```
packages/core        dominio puro, sin I/O
packages/providers   lectura de ~/.claude: catálogo, grafo, transcripts, historial
packages/cli         la línea de comandos
```

MIT.
