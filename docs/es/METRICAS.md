# Métricas: qué se midió y qué se descartó

[English](../METRICS.md)

Regla del proyecto: **todo indicador que se muestra cita su fuente y significa algo**. Una métrica
que suena bien pero no se sostiene contra los datos no entra, por vistosa que sea.

## Descartada: la cobertura de vocabulario como predictor de uso

**Hipótesis.** Una skill solo se activa si su `description` está escrita con las palabras que el
usuario realmente usa. Luego la fracción de términos de la description que aparecen en su historial
de prompts debería predecir cuánto se usa esa skill.

**Prueba.** 40 skills reales contra 7.007 prompts de `~/.claude/history.jsonl`, correlación de
Spearman contra el número real de invocaciones extraído de los transcripts.

| Variante | Spearman |
|---|---|
| A — presencia simple de términos | 0,21 |
| B — solo términos distintivos (df ≤ 3) | 0,18 |
| C — ponderada por rareza (IDF) y frecuencia en prompts | 0,29 |
| D — solo términos muy raros (df ≤ 2) | 0,25 |
| **Baseline tonto: longitud de la description** | **0,47** |

**Conclusión.** La hipótesis es falsa. Ninguna variante llega al baseline más ingenuo posible, así
que la métrica no aporta información: mostrarla como termómetro sería vender una precisión que no
existe. El baseline tampoco sirve para construir nada encima — que las descriptions largas se usen
más es, casi con seguridad, un proxy del esfuerzo invertido en esa skill, no una palanca.

**Qué se conserva.** El hecho verificable: *"estos términos de tu description no los has escrito
nunca"*. Ayuda a reescribir y no pretende pronosticar nada. Vive en `vocabularyGap()`.

## No se muestra: el coste en tokens de un servidor MCP

**Por qué importaría.** Las definiciones de herramientas de un servidor MCP conectado ocupan contexto
en cada sesión, igual que las descriptions de las skills.

**Por qué no se muestra.** El tamaño de esas definiciones solo se conoce conectándose al servidor y
pidiéndole sus herramientas. ai-office lee archivos de configuración y transcripts; nunca arranca ni
sondea un servidor (arrancarlo ejecuta el comando que lleve su definición). Estimarlo a partir de los
nombres de herramienta que aparecen en el historial mediría las herramientas que llamaste, no las que
están cargadas. Una cifra que no puede citar un archivo y un campo no entra, así que los servidores MCP
tienen cifras de uso (llamadas, herramientas, sesiones, proyectos, tendencia) y ninguna de coste.

## En uso

| Métrica | Definición | Fuente |
|---|---|---|
| **Ratio activo** | skills en práctica o acreditadas / skills vivas (las que el modelo puede elegir: las jubiladas, `disable-model-invocation: true`, salen del denominador) | catálogo + transcripts |
| **Grado** (sin estrenar / estrenado / en práctica / acreditado) | saturante. *estrenado*: algún uso; *en práctica*: ≥ 3 sesiones distintas; *acreditado*: ≥ 3 sesiones, ≥ 2 proyectos (≥ 2 semanas distintas si se mide un solo proyecto) y último uso en los últimos 90 días. En práctica y acreditado cuentan como activos | transcripts |
| **Coste de descriptions** | tokens estimados (~4 caracteres cada uno) de las descriptions de tus skills vivas (de usuario y de proyecto), que Claude Code carga en cada sesión | `description` de `SKILL.md` |
| **Brecha declarado↔probado** | aristas `declared` sin arista `proven` equivalente | grafo |
| **Usos, sesiones, proyectos, último uso** | por entidad: los usos se cuentan una vez por `tool_use` (deduplicado por id); las sesiones y los proyectos son **conjuntos**, así que tres agentes que usan una skill en una sesión son una sesión | transcripts, y `history.jsonl` para los comandos tecleados |
| **Tendencia** (`weekly`) | usos en cada una de las últimas 12 **ventanas móviles de 7 días** que terminan al construir el snapshot, de la más antigua a la actual. Un uso sin marca de tiempo entra en el total, no en la serie | transcripts / `history.jsonl` |
| **Usos por proyecto** (`byProject`) | usos por directorio de trabajo (`~/dev/x`), o por slug de la carpeta del transcript si la fuente no trae `cwd` | `cwd` de las líneas del transcript / `project` de `history.jsonl` |
| **Llamadas por herramienta** (`byTool`) | solo servidores MCP: llamadas por herramienta (`create_issue` → 12) | `mcp__<servidor>__<herramienta>` en los transcripts |
| **Plugins** (`plugins`) | plugins instalados, habilitados o no | `installed_plugins.json` |
| **Plugins habilitados** (`pluginsEnabled`) | los que tienen `true` en `enabledPlugins` combinado (usuario < proyecto < local < gestionado) | archivos `settings.json` |
| **Plugins sin uso** (`pluginsUnused`) | plugins habilitados sin ningún uso en el historial (el uso de un plugin es la suma del uso de sus skills, agentes, comandos y servidores MCP) | ajustes + transcripts |
| **Coste de descriptions de plugins** (`pluginDescriptionTokens`) | tokens de las descriptions de las skills de los plugins **habilitados** que no están jubiladas. Va aparte del coste de tus propias skills | `description` de los `SKILL.md` de los plugins |
| **Servidores MCP** (`mcpServers`) | **ámbito de proyecto: cargados** (ni tapados, ni desactivados, ni de un plugin deshabilitado). **Ámbito de usuario: configurados**: Claude Code guarda el estado encendido/apagado por proyecto, así que sin proyecto no se conoce (`enabled: null`) y el servidor cuenta como cargado. Misma frase, distinta cifra: compárala solo dentro de un ámbito | `~/.claude.json`, `.mcp.json`, plugins, gestionados |
| **Servidores MCP sin uso** (`mcpUnused`) | de esos, los que no tienen ninguna llamada en el historial | transcripts |

**Qué significa «sin uso».** «Ningún uso dentro de la ventana del historial» (`stats.historyWindowDays`,
el `cleanupPeriodDays` de Claude Code; 30 por defecto), **medido sobre lo que dice el
ámbito** (`snapshot.measuredOver`). En un ámbito de usuario se cuenta sobre todos los proyectos; en uno
de proyecto, solo sobre las invocaciones cuyo directorio de trabajo está dentro de ese proyecto (y sus
subdirectorios y worktrees), así que «sin uso» significa *no usado en este proyecto*. Toda cifra que
depende del historial sigue la misma regla: usos, sesiones, proyectos, tendencia, usos por proyecto,
llamadas por herramienta, grados, aristas probadas, ratio activo y los recuentos de sin uso. El censo
dice «en este proyecto» cuando aplica. No se filtran: el número de prompts tecleados y el vocabulario
que alimenta el contraste de descriptions. Midiendo un
solo proyecto, *acreditada* pide uso en ≥ 2 semanas distintas en vez de ≥ 2 proyectos (dentro de un
proyecto los únicos «proyectos» distintos serían sus worktrees).

El grado es deliberadamente saturante: el uso nº 4 no vale más que el nº 50. Así ninguna cifra del
producto mejora por gastar más en Claude.
