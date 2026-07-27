---
marp: true
theme: indaco
paginate: true
header: 'Lattice · every chart label inside the drawing'
---

<!-- _class: title -->

<!-- _footer: "chart-family-all-svg — the last two HTML labels move into their viewBoxes" -->

# Every label inside the drawing

`chart family · 2026-07-27`

The two chart labels that were still HTML — word-cloud's size key and radar's
small-multiple captions — now live inside their viewBoxes. Both components flip
from `render: hybrid` to `svg`, derived from the rendered export rather than
asserted.

---

<!-- _class: word-cloud -->

<!-- _footer: "word-cloud · the size key is SVG, in the cloud's own viewBox" -->

`SIZE = FREQUENCY`

## The key scales with the words it explains.

- execution `5`
- discipline `4.5`
- velocity `4`
- integrations `3.5`
- talent `3`
- residency `2`
- cadence `1`

*The size ramp used to be an HTML rail, sized from the slide's type scale rather
than the chart's. Inside the viewBox it is locked to the cloud it explains.*

---

<!-- _class: radar small-multiples -->

<!-- _footer: "radar small-multiples · each series name inside its own mini" -->

`Scale · 0–10`

## Four minis, four names, one drawing each.

- Atlas
  - Adoption `9`
  - Margin `7`
  - NPS `8`
  - Velocity `6`
  - Risk `9`
- Beacon
  - Adoption `7`
  - Margin `8`
  - NPS `6`
  - Velocity `9`
  - Risk `7`
- Cinder
  - Adoption `8`
  - Margin `6`
  - NPS `9`
  - Velocity `7`
  - Risk `5`
- Drift
  - Adoption `6`
  - Margin `9`
  - NPS `7`
  - Velocity `8`
  - Risk `8`

*Exported on its own this used to be four unnamed shapes — the names were figure
captions sitting outside the drawing.*

---

<!-- _class: radar small-multiples -->

<!-- _footer: "radar small-multiples · a long name wraps, and every mini shares the band" -->

`Scale · 0–10`

## A wrapping name grows the band for all of them.

- Northwind Logistics and Distribution
  - Adoption `9`
  - Margin `7`
  - NPS `8`
- Atlas
  - Adoption `7`
  - Margin `8`
  - NPS `6`
- Beacon
  - Adoption `8`
  - Margin `6`
  - NPS `9`

*The caption band is sized once per chart from the longest name, so the row stays
aligned — and a chart of one-line names pays for one line, not two.*

---

<!-- _class: piechart -->

<!-- _footer: "piechart · the model both conversions follow" -->

`Q3 · effort split`

## The pie set the pattern: key inside, key below at portrait.

- Onboarding `34`
- Pricing `26`
- Support `22`
- Integrations `18`

*Diagram, spine and key in one viewBox, scaling as one unit. The word cloud now
shares that spine builder instead of a third copy of the same gradient.*

---

<!-- _class: radar -->

<!-- _footer: "radar default · the legend was already SVG" -->

`Scale · 0–10`

## The single radar was never the problem.

- Lattice
  - Adoption `9`
  - Margin `7`
  - NPS `8`
  - Velocity `6`
  - Risk `9`
- Rival North
  - Adoption `7`
  - Margin `8`
  - NPS `6`
  - Velocity `9`
  - Risk `7`

*Web, spokes, axis labels and legend were already inside the viewBox. Only the
small-multiples captions had stayed outside — 22 characters of HTML.*

---

<!-- _class: closing index -->

<!-- _footer: "chart-family-all-svg · seven SVG, two hybrid, four HTML" -->

## What changed, and what proves it

- `render` is derived, not claimed
  - `check-render-nature` renders each gallery through the export path and fails when a manifest disagrees with the artifact.
- Size-neutral where it was right, a fix where it was not
  - The caption still renders at 10.78px; at portrait the old HTML key had overflowed its own rail.
- The stage-fit invariant now has a gate
  - `check-chart-fit` fails on the shapes that clipped, and passes here.
