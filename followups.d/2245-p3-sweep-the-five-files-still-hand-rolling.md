---
origin: 2245
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2245#issuecomment-5754168975
backfill: true
---

# Sweep the five files still hand-rolling the depth-blind <h2> regex

Backfilled verbatim from the continuation brief on #2245 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Sweep the five files still hand-rolling the depth-blind <h2> regex
       why now   — each is the bug lib/core/top-level-h2.js exists to prevent; left off-path
                   on #2245 and recorded only in that kernel's header.
       where     — lib/core/carousel.js (8 occurrences), split-envelope.js (3),
                   split-panels.js (2), premise.js (1),
                   lib/components/chart/_chart-family/chart-family.js (1).
       done when — each reads through the shared kernel and all 362 committed decks still
                   render byte-identically.
       evidence  — the byte-identical render diff across every committed deck.
       verify    — tier 1 checker, because it touches the masthead path on every deck.
```
