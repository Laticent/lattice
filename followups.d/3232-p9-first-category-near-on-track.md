---
origin: 3232
priority: P9
recorded: 2026-11-21
area: theming
severity: low
swimlane: engineering/decisions/2026-11-16-status-triplets.md §3
deferred: blocked — each palette's first category is a brand call for the owner, as carbone's was (#3360 D2)
source: https://github.com/Laticent/lattice/pull/3360
---

# Two more palettes' first category sits close to on-track

```text
  P9 · [no ticket] ardesia (light) and a11y-protanopia (dark) lead with a near-on-track hue
       why now   — Found while applying the owner's D2 answer on #3360 (carbone's first category
                   re-hued to blue). A chart paints an unstatused mark in the first category, so a
                   first category close to the on-track fill reads as on track. Measured as OKLab
                   distance from --chart-cat1 to --pass-mark over every palette, token-resolved:
                   ardesia light 0.068 (dark 0.098) and a11y-protanopia dark 0.067 (light
                   0.105). Every other palette clears 0.08; carbone now sits at 0.224 / 0.233.
       where     — themes/ardesia/ardesia.css and themes/a11y-protanopia/a11y-protanopia.css,
                   --chart-cat1 (and its generated ink, node tools/derive-chart-cat-ink.js).
       done when — the owner picks per palette, as for carbone: re-hue the first category (swap
                   the cycle's first two slots), push pass off it, or accept it. Then extend the
                   carbone pin in test/unit/palette/chart-solids.test.js ("the first category
                   stands off the on-track fill") to every palette.
       verify    — that test; and on a render, the OKLab distance between an unstatused
                   .state-node's background and an on-track one's, on both faces.
```
