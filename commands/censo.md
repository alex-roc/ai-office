---
description: Censo de tu configuración de Claude Code - qué tienes, qué usas y qué nunca has estrenado
---

Ejecuta el censo de ai-office y comenta el resultado con el usuario.

1. Corre `ai-office censo` (o `node "${CLAUDE_PLUGIN_ROOT}/packages/cli/src/index.ts" censo` si el
   binario no está en el PATH). Si el usuario pide una imagen compartible, añade
   `--cartel ai-office-censo.svg`.
2. Lee la salida y resume **lo que más sorprenda**, no todo: el número de agentes sin estrenar, el
   de skills sin usar, y la brecha entre relaciones declaradas y demostradas.
3. Propón como mucho tres acciones concretas, cada una nombrando el archivo que habría que tocar.
   No las apliques sin que el usuario lo pida.

Si el usuario pasa $ARGUMENTS, úsalo para acotar el comentario (por ejemplo, a un agente concreto).
