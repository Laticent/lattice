---
origin: 2854
priority: P3
recorded: 2026-10-21
area: chart
severity: low
swimlane: engineering/decisions/2026-10-20-callout-placement.md § 7 P2
source: https://github.com/Laticent/lattice/pull/2854
---

# The heatmap keeps its own placement loop

P2 moved the heatmap's lane sizing, marker sizing and aspect scoring into `callout-layer.js`, and the heatmap imports them. Its placement loop (`buildHeatmap`) is still its own, because it lays the grid out per candidate and a plain `choose` would move it. The two loops now differ in one rule: `choose` prefers a layout that breaks no word in a note, and the heatmap ellipsizes instead.

why now   — a third copy of the pick rule is how the two charts' choices drift apart.
where     — `lib/components/chart/heatmap/heatmap.transform.js` `buildHeatmap`, and `callout-layer.js` `choose`.
done when — `buildHeatmap` calls `choose`, and every heatmap deck (`examples/callout-placement.md` at five shapes, `examples/legend-anchored.md`, the gallery) renders byte for byte as before, or the PR names each slide that moved and why.
evidence  — `diff -r` of the rendered HTML before and after, as in P2's own check.
verify    — `heatmap-placement.test.js` unchanged and green.
