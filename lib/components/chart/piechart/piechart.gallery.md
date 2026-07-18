---
marp: true
theme: indaco
paginate: true
header: "Lattice · piechart"
---

<!-- _class: title silent -->

# piechart

`Evidence · Canvas · Series`

Pie or donut chart with legend — proportional wedges.

---

<!-- _class: piechart -->
<!-- _footer: "Default · piechart" -->

`H1 2026 · 1,840 person-hours`

## The pie gives each share one wedge.

Nearly half went to producing decks; the deciding itself was the smallest slice.

- Deck production `46%`
  - 92 decks, averaging 18 slides each
  - Most of it review-cycle churn
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`


---

<!-- _class: piechart donut -->
<!-- _footer: "donut · piechart donut — The center carries the total." -->

`H1 2026 · 1,840 person-hours`

## donut opens the center for the total.

The toil-and-on-call slice is the one nobody put in the roadmap.

- Signal Intake build `46%`
- Scoring policy work `22%`
- Decision Log integration `18%`
- Explaining the framework to stakeholders `9%`
- Toil and on-call `5%`

Refreshed weekly · figures from the time-tracking export


---

<!-- _class: piechart -->
<!-- stress-slide -->
<!-- _footer: "Stress test · piechart — Eleven slices — the legend's limit." -->

`FY2026 · 1,840 person-hours`

## Stress test — eleven slices, long-tail distribution, none of it on the roadmap.

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

<!-- _class: piechart dark -->
<!-- _footer: "Composition: dark · piechart dark" -->

`H1 2026 · 1,840 person-hours`

## The pie gives each share one wedge.

Nearly half went to producing decks; the deciding itself was the smallest slice.

- Deck production `46%`
  - 92 decks, averaging 18 slides each
  - Most of it review-cycle churn
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`


---

<!-- _class: piechart compact -->
<!-- _footer: "Composition: compact · piechart compact" -->

`H1 2026 · 1,840 person-hours`

## The pie gives each share one wedge.

Nearly half went to producing decks; the deciding itself was the smallest slice.

- Deck production `46%`
  - 92 decks, averaging 18 slides each
  - Most of it review-cycle churn
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`


---

<!-- _class: piechart accent -->
<!-- _footer: "Composition: accent · piechart accent" -->

`H1 2026 · 1,840 person-hours`

## The pie gives each share one wedge.

Nearly half went to producing decks; the deciding itself was the smallest slice.

- Deck production `46%`
  - 92 decks, averaging 18 slides each
  - Most of it review-cycle churn
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · piechart" -->

## When NOT to reach for piechart.

- Slices that don't sum to a whole
  - A pie of unrelated metrics is meaningless — the visual implies parts of a whole. If your values are independent measures, use stats or a bar chart instead.
- Two slices
  - A two-slice pie is just a percentage with extra steps. Use big-number or split-panel metric — the audience can read '38% / 62%' faster than they can decode a half-and-half disc.
- Comparing two pies
  - Side-by-side pies force the audience to compare wedge angles across two figures — humans are bad at this. Use grouped bars or a slope chart to land the comparison cleanly.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `progress` — comparable parts but precise differences matter
- `stats` — the values are independent metrics, not a partition
- `big-number` — the headline is one slice, not the breakdown
- `kpi` — the slices need status framing and targets
