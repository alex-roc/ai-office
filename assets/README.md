# assets/

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
