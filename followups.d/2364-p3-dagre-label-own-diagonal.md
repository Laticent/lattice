---
origin: 2364
priority: P3
recorded: 2026-09-25
---

# A dagre edge label can sit on its own shallow diagonal

```text
  P3 · [no ticket] On a dagre route, a label beside a shallow diagonal crosses its own line.
       why now   — the probe (tools/state-chart-label-probe.js) counts 16 collisions over the
                   14 state-chart decks after #2364; the ones inspected are a label on its own
                   diagonal (`hold`, `a`–`d` on the stress fan-out, `accept`/`refuse`).
       where     — state-chart.transform.js placeLabel: on dagre, `ctx.ownRuns` is false, so
                   the walk ignores the label's own segments.
       done when — own-line hits on dagre are resolved without moving a label that touches
                   nothing else. Measured in #2364: counting own segments takes 16 -> 5 but
                   breaks "an uncrowded label keeps its midpoint" (the FAN test), because every
                   beside-the-line spot on a shallow diagonal crosses it; a below-the-line
                   placement for shallow runs is the likely answer.
       evidence  — the probe over the 14 decks, before and after.
       verify    — tier 1: render + probe.
```
