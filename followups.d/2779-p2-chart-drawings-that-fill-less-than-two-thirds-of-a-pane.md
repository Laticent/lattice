---
origin: 2779
priority: P2
recorded: 2026-10-22
area: chart
severity: low
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md §8.9
source: this session's pane measurement, 2026-10-22
---

# `piechart` at 50% and `map` at 50% and 75% fill under two-thirds of their pane

why now   — §8.9 retired the "one pane rule by declared aspect" idea for charts, because every chart SVG already
            fills its pane and letterboxes centered. What remains is each chart's own choice of drawing.
found     — CLI render of each chart beside a text pane at 25/75, 50/50, 75/25; the SVG's `viewBox` against the
            pane's stage, on a five-item deck (a four-item `piechart` measures 61% at 50/50, so re-measure on the chart's own gallery data): `piechart` 56% at 50/50 (`viewBox` 480x200 in a 544x404 stage); `map` 64% at 50/50
            (1155x1332) and 62% at 75/25 (1826x564). `radar` and `funnel` are 74% or better.
where     — the chart's transform picks the `viewBox` from the pane's shape (`fitKeyToPane` in
            `lib/components/chart/_chart-family/svg-legend.js`; the map's own region picker).
done when — each of those cells fills at least 75% of the pane, or the note says why the shape cannot.
verify    — before/after fill numbers from the same probe, light and dark, via SendUserFile
note      — a drawing choice per chart (a stacked key under the disc at 50%), not a pane rule. No manifest field.
