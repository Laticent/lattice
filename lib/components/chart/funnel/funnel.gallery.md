---
marp: true
theme: indaco
paginate: true
header: "Lattice · funnel"
---

<!-- _class: title silent -->

# funnel

`Evidence · Canvas · Series`

Tapering stages that show where a flow drops off, with the conversion rate between each.

---

<!-- _class: funnel -->
<!-- _footer: "Default · funnel" -->

## The funnel narrows; the width is the story.

- Visitors `12,000`
  - Two-thirds arrive from inbound, not outbound
  - Paid search makes up the rest
- Signups `4,800`
- Activated `2,160`
- Paid `864`
- Renewed `670`


---

<!-- _class: funnel -->
<!-- stress-slide -->
<!-- _footer: "Stress test · funnel — Seven stages, one steep early drop." -->

## Seven stages, a steep early drop.

- Impressions `240,000`
- Clicks `38,400`
- Visits `21,600`
- Signups `5,400`
- Activated `2,160`
- Paid `648`
- Renewed `512`


---

<!-- _class: funnel dark -->
<!-- _footer: "Composition: dark · funnel dark" -->

## The funnel narrows; the width is the story.

- Visitors `12,000`
  - Two-thirds arrive from inbound, not outbound
  - Paid search makes up the rest
- Signups `4,800`
- Activated `2,160`
- Paid `864`
- Renewed `670`


---

<!-- _class: funnel compact -->
<!-- _footer: "Composition: compact · funnel compact" -->

## The funnel narrows; the width is the story.

- Visitors `12,000`
  - Two-thirds arrive from inbound, not outbound
  - Paid search makes up the rest
- Signups `4,800`
- Activated `2,160`
- Paid `864`
- Renewed `670`


---

<!-- _class: funnel accent -->
<!-- _footer: "Composition: accent · funnel accent" -->

## The funnel narrows; the width is the story.

- Visitors `12,000`
  - Two-thirds arrive from inbound, not outbound
  - Paid search makes up the rest
- Signups `4,800`
- Activated `2,160`
- Paid `864`
- Renewed `670`


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · funnel" -->

## When NOT to reach for funnel.

- **Stages that aren't a subset.** If a later stage can exceed an earlier one (it's a category breakdown, not a pipeline), the taper lies. Use `piechart` for parts of a whole or `progress` for independent metrics.
- **A funnel of two stages.** Two bands is a single conversion rate dressed up as a chart. State it as a `big-number` (‘18% convert’) or a two-tile `stats` instead.
- **Non-monotonic values.** Values that rise and fall make the trapezoids bulge and the conversion %s read oddly. A funnel assumes a monotonic narrowing; for an up-and-down series use a `progress` or a chart with an axis.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `progress` — independent metrics as labeled bars, not a narrowing pipeline
- `stats` — a row of headline figures with no drop-off relationship
- `piechart` — parts of a single whole rather than sequential stages
- `list-steps` — the stages are a process to walk through, not values to compare
- `big-number` — a single conversion rate is the whole story
