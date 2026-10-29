---
origin: 2908
priority: P3
recorded: 2026-10-28
area: chart
severity: medium
swimlane: engineering/chart-styling.md §3
source: https://github.com/Laticent/lattice/pull/2908
---

# Name the invariant the chart finishes keep see-sawing on, and decide if it has a solution

```text
  P3 · Study, not a fix: why do some charts never reach 9 in their finish?
       why now   — #2908 went through several fix-and-revert rounds on the same charts (tone
                   progress one-hue then back, the pigment kanban tint added then dropped for AA,
                   status levels raised then lowered). The owner's read: there may be a
                   fundamental invariant that cannot be satisfied, and we should understand it
                   before tuning again.
       where     — the charts still under 9 on cdf3de6 (blind mean of 2): pigment kanban 7.5 and
                   risk-matrix 7.5; etch word-cloud 6.5, slope 7.5, bullet 8; tone flowchart 8.5,
                   progress 8.5; pigment-dark status reds louder than greens (flowchart, hub-spoke,
                   waterfall, progress).
       hypothesis — three constraints collide on some marks and cannot all hold at once:
                   (1) text on a mark must clear 4.5:1 (AA), (2) the mark must show its finish's
                   trait (pigment solid, etch wash + ink edge, tone shade of one hue), and
                   (3) consistency: one level per class (status), category hue only where it means
                   something. A mark that carries text, or is a single ink (a word, a line), has
                   too few channels to satisfy all three: e.g. a kanban card's inline code fails AA
                   on any pigment tint (4.19:1 on carbone), and a word cannot take a wash plus an
                   outline. Pigment-dark reds are a theme fact: state-fail and state-pass hues are
                   not luminance-matched in dark.
       done when — a short decision note lists, per chart class, which constraints bind, the
                   measured feasible range (e.g. the highest card tint that keeps inline code at
                   4.5:1 on every theme), and either a design that satisfies all three or a named,
                   owner-approved exception per chart.
       evidence  — the per-chart worst text contrast over 31 themes x 2 modes x 3 finishes
                   (.scratch/aa-min.jsonl on #2908; every chart clears 4.5:1, the tightest are
                   roadmap 4.55, heatmap 4.58, kanban 4.58) and the blind scores (r15).
       verify    — tier 0: analysis; any fix it proposes is its own PR.
```
