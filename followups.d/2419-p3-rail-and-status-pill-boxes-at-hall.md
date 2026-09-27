---
origin: 2419
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2419
---

# Check fixed-size rail and status-pill boxes at `venue: hall`.

Found by the card-tag audit (PR #2419, `2026-09-27-card-tag-register.md` §3.6). It is out
of that design's scope, so it is logged here.

```text
  P3 · [no ticket] Fixed-cqi marker boxes may not grow with venue.
       why now   — --fs-meta grows up to 1.95x at hall, but these boxes are fixed cqi:
                   list-steps timeline disc (2.03125cqi), timeline-list pill height
                   (1.875cqi), .chart-status height (1.71875cqi), kanban status
                   (1.5625cqi), journey mood disc (1.40625cqi). Roadmap pills use a raw
                   cqi font and ignore venue entirely.
       where     — the component styles.css files above; chart-family.css:1210-1286.
       done when — each marker's text fits its box at hall, or the claim is refuted
                   by a render.
       evidence  — a hall render of each, rasterized.
       verify    — inferred from CSS by an audit scout, NOT rendered. The card-tag
                   equivalent of this claim did not reproduce at hall, so render first.
```
