# Metrics: what was measured and what was dropped

[Español](es/METRICAS.md)

Project rule: **every indicator shown cites its source and means something**. A metric that sounds
good but doesn't hold up against the data doesn't ship, however flashy it is.

## Dropped: vocabulary coverage as a predictor of usage

**Hypothesis.** A skill only fires if its `description` is written with the words the user actually
uses. So the fraction of the description's terms that appear in their prompt history should predict
how much that skill gets used.

**Test.** 40 real skills against 7,007 prompts from `~/.claude/history.jsonl`, Spearman correlation
against the real number of invocations extracted from the transcripts.

| Variant | Spearman |
|---|---|
| A — plain term presence | 0.21 |
| B — distinctive terms only (df ≤ 3) | 0.18 |
| C — weighted by rarity (IDF) and frequency in prompts | 0.29 |
| D — very rare terms only (df ≤ 2) | 0.25 |
| **Dumb baseline: description length** | **0.47** |

**Conclusion.** The hypothesis is false. No variant reaches the most naive baseline possible, so the
metric carries no information: showing it as a thermometer would be selling a precision that doesn't
exist. Nor can the baseline be built upon — that longer descriptions get used more is, almost
certainly, a proxy for the effort invested in that skill, not a lever.

**What is kept.** The verifiable fact: *"you have never typed these terms from your description"*. It
helps with rewriting and does not pretend to forecast anything. It lives in `vocabularyGap()`.

## In use

| Metric | Definition | Source |
|---|---|---|
| **Active ratio** | skills practicing or certified / existing skills | catalog + transcripts |
| **Grade** (unused / tried / practicing / certified) | saturating: ≥3 distinct sessions and ≥2 projects, valid for 90 days | transcripts |
| **Description cost** | sum of tokens of the descriptions, which are loaded in every session | catalog |
| **Declared↔proven gap** | `declared` edges with no equivalent `proven` edge | graph |

The grade is deliberately saturating: use #4 is worth no more than use #50. That way no figure in the
product improves by spending more on Claude.
