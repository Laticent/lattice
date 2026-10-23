---
origin: 2864
priority: P3
recorded: 2026-10-22
area: chart
severity: low
swimlane: engineering/decisions/2026-10-20-callout-placement.md § 12
source: https://github.com/Laticent/lattice/pull/2864
---

# A callout's ring on a flowchart or state chart is a rectangle, whatever the shape

`placeCallouts` (`callout-browser.js`) hands `place` each shape's box as `{cx, cy, w, h}`, so the ring is a plain rectangle. A diamond, a pill, a circle, a cylinder or a state chart's rounded tile each show the ring's square corners standing outside the shape's own outline. `place` already rings a path-shaped mark along its own outline (`ring: 'path'` with `d`, used by the map and the pie).

why now   — the 10/10 bar for a visual: on the demo deck's state chart the ring on `Approved` and `Live` is visibly squarer than the tile it rings. It does not hide or mislead; it is a finish.
where     — `flowchart.layout.js` and `state-chart.layout.js` `calloutsOf` (pass each node's outline `d` and `ring: 'path'`), `ctx.outline` in `docs/src/lib/trama/pipeline.ts` (it returns markup, so a path-only twin is needed), `callout-browser.js`.
done when — a callout on a diamond, a pill, a circle, a cylinder and a rounded tile is ringed along that shape's own outline, in the Studio and in the export, and a callout-free chart is unchanged.
evidence  — the demo deck's two slides, plus a deck with one callout per shape word, light and dark, at 16:9 and 9:16, as PDFs.
verify    — the browser pass and the export bootstrap agree (HARD RULE #1); the Trama change is additive. Tier 1 (a checker): it touches the shared pipeline's context.
