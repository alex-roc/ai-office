# assets/

[Español](#español)

The sprites of people and furniture were generated with AI (OpenAI's image generator via Codex) from
the prompts in `fuentes/`, then cropped and reduced by hand with `tools/sprites/`. They are
distributed under the same MIT license as the rest of the project.

`fuentes/` keeps the PROVENANCE of the art, not the art that is served:

- `estilo.txt`, `personajes.txt`, `mobiliario.txt` — the exact prompts the sheets were generated
  with. The style one is identical for all sheets on purpose: it is the only thing that keeps the
  palette and lighting consistent from one sheet to the next.
- `crudo/*.png` — the sheets exactly as they came out of the generator, at 1024×1024.

The already cropped and reduced pieces live in `apps/web/public/sprites/`, which is what Vite serves
and what ends up in the package. They are regenerated with:

```bash
node tools/sprites/recortar.mjs assets/fuentes/crudo/personajes.png apps/web/public/sprites \
  "investigador,analista,jurista,contable,auditor,redactor,ingeniero,gestor" --alto 72
node tools/sprites/contacto.mjs apps/web/public/sprites /tmp/contacto.png 5   # review by eye
```

The floor, walls, skill spines and command cards are NOT generated: they are drawn pixel by pixel
in `apps/web/src/sala/texturas.ts`. A generated tile would not match its neighbor, and a spine has
to change height and color with the data.

## Español

[English](#assets)

Los sprites de personas y muebles se generaron con IA (generador de imágenes de OpenAI vía Codex)
a partir de los prompts de `fuentes/`, y se recortaron y redujeron a mano con `tools/sprites/`.
Se distribuyen bajo la misma licencia MIT que el resto del proyecto.

`fuentes/` guarda la PROCEDENCIA del arte, no el arte que se sirve:

- `estilo.txt`, `personajes.txt`, `mobiliario.txt` — los prompts exactos con los que se generaron
  las hojas. El de estilo es idéntico para todas las hojas a propósito: es lo único que mantiene
  la paleta y la luz coherentes entre una hoja y la siguiente.
- `crudo/*.png` — las hojas tal y como salieron del generador, a 1024×1024.

Las piezas ya recortadas y reducidas viven en `apps/web/public/sprites/`, que es lo que Vite
sirve y lo que acaba en el paquete. Se regeneran con:

```bash
node tools/sprites/recortar.mjs assets/fuentes/crudo/personajes.png apps/web/public/sprites \
  "investigador,analista,jurista,contable,auditor,redactor,ingeniero,gestor" --alto 72
node tools/sprites/contacto.mjs apps/web/public/sprites /tmp/contacto.png 5   # revisión a ojo
```

El suelo, las paredes, los lomos de skill y las tarjetas de comando NO se generan: se dibujan
píxel a píxel en `apps/web/src/sala/texturas.ts`. Una baldosa generada no casaría con su vecina,
y un lomo tiene que cambiar de altura y color según el dato.
