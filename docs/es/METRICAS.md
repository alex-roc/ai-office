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

## En uso

| Métrica | Definición | Fuente |
|---|---|---|
| **Ratio activo** | skills en práctica o acreditadas / skills existentes | catálogo + transcripts |
| **Grado** (sin estrenar / estrenado / en práctica / acreditado) | saturante: ≥3 sesiones distintas y ≥2 proyectos, con vigencia de 90 días | transcripts |
| **Coste de descriptions** | suma de tokens de las descriptions, que se cargan en cada sesión | catálogo |
| **Brecha declarado↔probado** | aristas `declared` sin arista `proven` equivalente | grafo |

El grado es deliberadamente saturante: el uso nº 4 no vale más que el nº 50. Así ninguna cifra del
producto mejora por gastar más en Claude.
