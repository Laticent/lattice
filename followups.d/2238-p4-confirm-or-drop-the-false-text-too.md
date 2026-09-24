---
origin: 2238
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2238#issuecomment-5752514215
---

# Confirm or drop the false "text too small" under a live Anima stage

Backfilled verbatim from the continuation brief on #2238 (merged 2026-09-20).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P4 · [no ticket] Confirm or drop the false "text too small" under a live Anima stage
       why now   — logged in passing under HARD RULE #18 with no artifact in the tree; a
                   live observation, not yet a finding, and it should not rot
       where     — the Playground's fit/lint readout; reproduce with motion: on vs off on
                   the same deck (funnel reports 4.8pt, heatmap 5.2pt — general, not
                   heatmap-specific). Suspect the hidden poster measuring 0×0.
       done when — either a reproduction with an artifact and a filed card, or a note in
                   the decision record saying it did not reproduce
       evidence  — the two readouts captured from the real Playground, same deck
       verify    — tier 0 gates, it is an investigation not a change
```
