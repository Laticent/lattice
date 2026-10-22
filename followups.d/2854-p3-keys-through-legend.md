---
origin: 2854
priority: P3
recorded: 2026-10-21
area: chart
severity: low
swimlane: engineering/decisions/2026-10-20-callout-placement.md § 7 P5
source: https://github.com/Laticent/lattice/pull/2854
---

# Keys through `@legend` on every component that already draws one

Plan item P5. Authors cannot rename or reorder a chart's key entries today: the key is derived from the data. The brief for this PR stopped at callouts on the charts and on the journey and risk matrix (P1 to P4); this is the part that lets an author write `@legend{[{Fast, c1}, {Slow, c2}], key}` on a bar, a pie, a map, a radar, a quadrant, a tower or a line.

why now   — the reader and the key emitter exist (`legend.js`, `keySvg`); the charts' `layer.choose` loop already builds a key around each candidate unit, so an authored key is a different row source, not a new layout.
where     — each keyed chart's `keySvg({ rows })` call: take the rows from the slide's `@legend` key paragraph when there is one (`lib/core/lift-label-set.js` `liftLegends`, layout `key`), else derive them as now. `lint-core.js` stops warning that a `key` legend is not drawn, on those charts.
done when — an authored key renames and reorders the entries on each keyed chart, a chart with no `@legend` renders byte for byte as before, and the demo deck carries one slide per chart family.
evidence  — `diff -r` of every tracked deck before and after (byte-identical), and the demo deck at five shapes, light and dark.
verify    — the runtime and engine paths agree (HARD RULE #1); an entry naming no series is reported, not dropped silently.
