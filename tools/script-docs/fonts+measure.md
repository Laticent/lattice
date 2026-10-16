---
group: Lint & audit
---
Re-measure GLYPH_UPPER (the per-glyph advance table behind uppercase tracked chart labels) and hub-spoke's mixed-case hand table (HAND_ADVANCE) against the shipped woff2s in real Chromium, at the labels' own CSS. On-demand, never writes: the remediation path when checkFontMetricsPin reports font drift. `--strings` also re-derives the unit suite's MEASURED array.
