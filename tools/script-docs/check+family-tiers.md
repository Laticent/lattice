---
group: Lint & audit
---
Adaptive-family BEHAVIOR gate: renders one deck per family (wide/square/tall/strip) through the CLI and asserts each component actually reflows the way it intends — reading the COMPUTED style of a property only that family's rule can produce, plus the `data-family` stamp. Replaces the retired check-adaptive-families, which compared two CLASSIFIERS and so could only catch them disagreeing, never catch a whole tier being INERT — the square tier was dead for that gate's entire life (#1218). Asserting behavior catches a lost stamp, a bad selector, or a cascade change alike. Skips loudly with no Chromium.
