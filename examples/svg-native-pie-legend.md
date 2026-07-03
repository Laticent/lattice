---
marp: true
theme: indaco
paginate: true
header: "SVG-native chart legends"
---

<!-- _class: title silent -->

# Four charts, four keys — each one SVG.

`piechart · radar · map · cohort quadrant · 2026-06-13`

The diagram, the gradient spine, and the legend now share a single viewBox on
every keyed chart, so the whole thing scales as one proportional unit — and the
four read as one family.

---

<!-- _class: piechart -->
<!-- _footer: "Default — disc · spine · key, one unit" -->

`H1 2026 · 1,840 person-hours`

## Where the planning quarter actually went.

The key scales with the diagram; the spine floats in a comfortable gap.

- Deck production `46%`
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`

---

<!-- _class: piechart donut -->
<!-- _footer: "Donut — same unit, hollow centre" -->

`H1 2026 · 1,840 person-hours`

## The engineering quarter, as a donut.

Wedges, spine and key are all emitted in viewBox units.

- Signal Intake build `46%`
- Scoring policy work `22%`
- Decision Log integration `18%`
- Explaining the framework `9%`
- Toil and on-call `5%`

---

<!-- _class: piechart -->
<!-- _footer: "Long tail — the key fit-scales so every row fits" -->

`FY2026 · the long tail`

## Eleven slices still fit — the legend scales itself down.

No clipping: the font shrinks just enough to seat every keyed row.

- Signal Intake engineering `28%`
- Scoring policy work `16%`
- Decision Log integration `13%`
- Per-team calibration `11%`
- Explaining the framework to stakeholders `9%`
- Pilot and team support `7%`
- Documentation and gallery `5%`
- Adoption dashboard `4%`
- Auditor export `3%`
- Incident response `2%`
- Miscellaneous toil `2%`

---

<!-- _class: piechart claim-hero -->
<!-- _footer: "claim-hero — the whole unit scales up, key included" -->

`H1 2026 · 1,840 person-hours`

## Where the planning quarter actually went.

Cover just works — the key scales up with the diagram, no special-casing.

- Deck production `46%`
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`

---

<!-- _class: piechart dark -->
<!-- _footer: "Dark — every colour is a palette token" -->

`H1 2026 · dark canvas`

## Spine, swatches, labels — all token-driven.

Every colour flips with the canvas; nothing is a baked literal.

- Signal Intake build `46%`
- Scoring policy work `22%`
- Decision Log integration `18%`
- Explaining the framework `9%`
- Toil and on-call `5%`

---

<!-- _class: radar -->
<!-- _footer: "Radar — same key model, no value column (labels reclaim the width)" -->

`Scale · 0–10`

## How we stack up across the buying criteria.

The key rides the same shared builder — swatch, label, spine — keyed off the
series colour instead of a wedge.

- Meridian
  - Performance `9`
  - Pricing `7`
  - Support `8`
  - Ecosystem `6`
  - Security `9`
- Vantage
  - Performance `7`
  - Pricing `8`
  - Support `6`
  - Ecosystem `9`
  - Security `7`
- Helios
  - Performance `6`
  - Pricing `9`
  - Support `7`
  - Ecosystem `8`
  - Security `8`

---

<!-- _class: map -->
<!-- _footer: "Map — swatches mirror the choropleth ramp; values right-aligned" -->

## Where our programs reached — unevenly.

Each swatch is the region's own fill, so the key reads as a legend of the map
itself.

- India `48.2`
- Nigeria `36.4`
- Kenya `31.0`
- Brazil `27.5`
- Indonesia `19.3`
- Ethiopia `14.1`
- Bangladesh `11.8`
- Peru `9.6`

---

<!-- _class: quadrant cohort -->
<!-- _footer: "Cohort quadrant — swatch + item count, one family with the rest" -->

`Effort 0–10 → Reach 0–100`

## Cohorts of work for next quarter.

- Quick Wins
  - Weekly signal digest `2, 82`
  - Slack intake bot `3, 72`
- Strategic Bets
  - Scoring model v2 `8, 88`
  - Decision-log API `7, 74`
- Defer
  - Per-team weighting UI `2, 28`
  - Maturity self-assessment `1, 20`
- Time Sinks
  - Bespoke board exports `8, 18`
  - Custom calibration tooling `9, 26`

---

<!-- _class: title silent -->

# One viewBox, and it travels.

`piechart · radar · map · cohort quadrant`

Proportional at any size, self-contained for export, accessible (the key is
re-stated in a `<desc>`), and still palette-blind and sketch-aware — one shared
builder under all four keyed charts.
