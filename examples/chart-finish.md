---
marp: true
size: 16:9
theme: indaco
paginate: true
header: "Chart finish"
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _footer: "Chart finish · title" -->

# One line sets how every chart spends its color

`Charts · chart-finish`

Pigment, etch or tone, set once for the deck and overridden per slide. Say nothing and it is pigment.

---

<!-- _class: bar -->
<!-- _footer: "no chart-finish: key · a finish is always on, and the default is pigment" -->

`Pigment · identity in the body`

## Every region grew, and EMEA grew fastest.

- North America
  - FY24 `3.1`
  - FY25 `3.6`
  - FY26 `4.2`
- EMEA
  - FY24 `1.7`
  - FY25 `2.4`
  - FY26 `3.1`
- APAC
  - FY24 `1.2`
  - FY25 `1.5`
  - FY26 `1.8`

---

<!-- _class: bar chart-finish-etch -->
<!-- _footer: "_class: chart-finish-etch · one slide overrides the deck" -->

`Etch · identity in the line`

## Every region grew, and EMEA grew fastest.

- North America
  - FY24 `3.1`
  - FY25 `3.6`
  - FY26 `4.2`
- EMEA
  - FY24 `1.7`
  - FY25 `2.4`
  - FY26 `3.1`
- APAC
  - FY24 `1.2`
  - FY25 `1.5`
  - FY26 `1.8`

---

<!-- _class: bar chart-finish-tone -->
<!-- _footer: "_class: chart-finish-tone · one hue in stepped shades" -->

`Tone · identity in value`

## Every region grew, and EMEA grew fastest.

- North America
  - FY24 `3.1`
  - FY25 `3.6`
  - FY26 `4.2`
- EMEA
  - FY24 `1.7`
  - FY25 `2.4`
  - FY26 `3.1`
- APAC
  - FY24 `1.2`
  - FY25 `1.5`
  - FY26 `1.8`

---

<!-- _class: piechart donut chart-finish-tone -->
<!-- _footer: "The key repaints with the wedges it names" -->

`H1 2026 · 1,840 person-hours`

## Nearly half the hours went to producing decks.

- Deck production `46%`
- Meetings `22%`
- Realigning `18%`
- Stakeholders `9%`
- Deciding `5%`

---

<!-- _class: heatmap chart-finish-etch -->
<!-- _footer: "Each value picks black or white from its own cell" -->

`Retention · 2026 cohorts`

## Retention decays fastest in month two.

|  | M0 | M1 | M2 | M3 |
| --- | --: | --: | --: | --: |
| Jan 2026 | 100 | 62 | 48 | 44 |
| Feb 2026 | 100 | 58 | 44 | 41 |
| Mar 2026 | 100 | 71 | 59 | 55 |
| Apr 2026 | 100 | 69 | 57 |  |

---

<!-- _class: gantt -->
<!-- _footer: "A status keeps its own color, and a task with none wears the neutral one" -->

`[{Timeline, 2026 Q1 .. 2026 Q4, today=Q3}]`

## Two workstreams land the scoring model by Q4.

- Framework
  - Signal taxonomy `Q1..Q2` `done`
  - Scoring model v2 `Q2..Q3` `live` `after=Signal taxonomy`
  - Per-team weighting `Q3..Q4` `at-risk` `after=Scoring model v2`
- Adoption
  - Pilot onboarding `Q1..Q2` `done`
  - Training plan `Q2..Q3`
  - Org-wide rollout `Q3..Q4` `blocked` `after=Per-team weighting`

---

<!-- _class: progress -->
<!-- _footer: "The readout sits on its own plate, so the bar keeps its color on a dark slide too" -->

`H1 2026 · readiness`

## Three of the four workstreams are on pace.

- Signal intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`
- Rollout `55%`

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _footer: "Chart finish · closing" -->

`chart-finish: pigment · etch · tone`

## Omit the key and every chart wears pigment.
