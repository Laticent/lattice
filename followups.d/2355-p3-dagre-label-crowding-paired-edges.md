---
origin: 2355
priority: P3
recorded: 2026-09-24
---

# dagre crowds labels on a paired back-and-forth edge

```text
  P3 · [no ticket] A state-chart machine re-ranked by dagre crowds the labels of a paired edge.
       why now   — a `block => 7` / `unblock => 3` pair lands two labels in one short rank gap,
                   and a long back-edge's label can sit against a forward edge's (#2355 moved
                   its dark demo slide to a chain to keep the deck clean; main is far worse).
       where     — state-chart.transform.js dagrePositions (rank gap from the machine-wide
                   maxW) and placeLabel's walk on dagre routes (no ctx.segs there).
       done when — the #2355 dark-slide machine with the block/unblock pair renders with no
                   label touching another label or a line.
       evidence  — the lab.cjs probe from #2355 (.scratch/rt) reports 0 collisions on it.
       verify    — tier 1: render + probe.
```
