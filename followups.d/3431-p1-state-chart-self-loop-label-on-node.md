---
origin: 3431
priority: P1
recorded: 2026-11-22
area: chart
severity: medium
swimlane: engineering/decisions/2026-09-27-trama-graph-chart-library.md
deferred: off-path — Trama's self-loop label placement; the state chart never read the tall canvas that PR 3431 retired
source: https://github.com/Laticent/lattice/pull/3431
---

# A state chart's self-loop label runs into the node it loops on (story)

```text
  P1 · state-chart: the `revise` self-loop label overlaps the `In Review` tile at story
       why now   — PR 3431's sweep of every portrait chart slide (a Chromium overlap pass, then each flagged
                   slide looked at) found it: examples/state-chart-polish.md p5 at story prints `revise`
                   across the right edge of `In Review` ("evise" shows; the `r` sits on the tile). Clean at
                   4:5 and mobile. Related but separate: followups.d/2887-p2-visual-sweep-preexisting.md notes the
                   curved variant's back edge running through the same label.
       where     — the state chart's Trama adapter (lib/plugins/chart-family/kinds/state-chart/state-chart.layout.js)
                   and Trama's shared line-label painter (`ctx.lines`, docs/src/lib/trama/), which places a
                   self-loop's label beside its tile.
       done when — a self-loop label clears its own tile and every other tile at 4:5, story and mobile on
                   examples/state-chart-polish.md and the state-chart gallery.
       evidence  — the C0 contact sheet (PR 3431 body, "P2, by eye"), slide 0110 of the flagged set.
       verify    — export examples/state-chart-polish.md --size story; page 5 shows `revise` whole and off the tile.
```
