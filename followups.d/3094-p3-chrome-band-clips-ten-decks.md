---
origin: 3094
priority: P3
recorded: 2026-11-09
area: engine
severity: high
swimlane: engineering/decisions/2026-11-08-anchor-chrome.md
deferred: off-path — #3095's footer band, which another session shipped; the overflow-floor PR only records floors
source: https://github.com/Laticent/lattice/actions/runs/42600201917
---

# Ten decks clip slides since #3095's footer band

why now   — the first scheduled overflow nightly after #3095 (run 81, `main@978728bb`) reports
            10 decks clipping slides their floor says are clean. Swept locally on 2026-11-09:
            all 10 are clean at `f13a118` (#3095's parent) and clip at `978728b`, the same
            pages the nightly names. Nothing else merged between the two.
where     — the decks and pages:
              examples/authority-chain-rail.md     p2
              examples/cards-register-catalog.md   p8 (p6 was already on its floor)
              examples/inventory-split-portrait.md p10
              examples/legend-below-portrait.md    p8, p9, p10
              examples/portrait-gantt-statechart.md p6
              examples/portrait-journey.md         p6, p14
              examples/portrait-roadmap.md         p6
              examples/position-marks.md           p2, p7, p12
              examples/split-decision.md           p2, p11
              examples/split-horizontal.md         p2
            Likely suspects in #3095: the four-column footer grid and its fixed row, and the
            chrome text boxes taking the band's line box. Not bisected inside the PR.
done when — `node tools/check-overflow-corpus.js` over those 10 decks reports none above
            baseline, with the slides fixed, not the floor re-blessed. Then delete this file.
evidence  — the sweep output before and after, and a raster of one fixed slide.
verify    — tier 1: the sweep, plus a look at each fixed page.
