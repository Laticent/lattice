---
origin: 2245
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2245#issuecomment-5754168975
backfill: true
---

# Decide the fate of claude/dark-sovereign-canvas (94005a3)

Backfilled verbatim from the continuation brief on #2245 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Decide the fate of claude/dark-sovereign-canvas (94005a3)
       why now   — a real, gated fix sitting unmerged; while parked, five accent covers
                   (decision-cover, compare-code-cover, compare-split-cover,
                   list-tabular-cover, split-panel-cover) keep losing their panel under dark.
       where     — lib/base/base.modifiers.css (the section.dark:not(:where(…)) rule) and
                   test/unit/palette/dark-canvas-ownership.test.js.
       done when — the owner has decided: land it, land only the accent-cover half, or drop
                   the branch. ASK — do not decide this one.
       evidence  — a rendered MIXED dark deck (anchor slide and content slide together). A
                   gallery in isolation does not show the problem; that is how it was missed.
       verify    — tier 0 gates plus the owner's eye, because the open question is visual
                   taste, not correctness.
```
