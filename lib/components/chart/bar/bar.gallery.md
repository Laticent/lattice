---
marp: true
theme: indaco
paginate: true
header: "Lattice · bar"
---

<!-- _class: title silent -->

# bar

`Evidence · Canvas · Series`

Bars from a zero baseline that compare magnitude across categories — as columns, rows, side-by-side groups, or signed off a centered zero.

---

<!-- _class: bar -->
<!-- _footer: "Default · bar" -->

`Revenue · FY26`

## Growth is concentrated in two regions.

- North America `$4.2M`
  - Two enterprise renewals landed in Q4
- EMEA `$3.1M`
- APAC `$1.8M`
- LATAM `$0.6M`


---

<!-- _class: bar row -->
<!-- _footer: "row · bar row — Horizontal bars with the category name in a wide left gutter — the correct form whenever the names are long or numerous." -->

## Support load sits with two teams.

- Platform Engineering `1,240`
- Customer Success `980`
- Data & Analytics `410`
- Design Systems `260`
- Developer Relations `95`


---

<!-- _class: bar grouped -->
<!-- _footer: "grouped · bar grouped — Two to four series side by side in each category, selected by nesting numeric children under each category." -->

## We beat plan everywhere but APAC.

- Americas
  - Plan `3.2`
  - Actual `3.9`
- EMEA
  - Plan `2.6`
  - Actual `3.1`
- APAC
  - Plan `1.9`
  - Actual `1.4`


---

<!-- _class: bar diverging row -->
<!-- _footer: "diverging · bar diverging — Signed values off a centered zero rule, both sides on one scale — the variance and tornado form." -->

## What moves the forecast, and which way.

- Renewal rate `+2.4`
- Enterprise pipeline `+1.6`
- Price realization `+0.7`
- Services attach `-0.5`
- Churn in mid-market `-1.8`
- FX exposure `-2.9`


---

<!-- _class: bar row -->
<!-- stress-slide -->
<!-- _footer: "Stress test · bar — Eight business units with full-length names — the case that forces the row form." -->

## Every unit named in full, nothing abbreviated.

- Commercial Banking `$182M`
- Wealth & Asset Management `$154M`
- Global Transaction Services `$121M`
- Insurance & Protection `$96M`
- Markets & Securities `$74M`
- Retail & Small Business `$61M`
- Corporate Real Estate `$38M`
- Private Credit Partnerships `$12M`


---

<!-- _class: bar dark -->
<!-- _footer: "Composition: dark · bar dark" -->

`Revenue · FY26`

## Growth is concentrated in two regions.

- North America `$4.2M`
  - Two enterprise renewals landed in Q4
- EMEA `$3.1M`
- APAC `$1.8M`
- LATAM `$0.6M`


---

<!-- _class: bar compact -->
<!-- _footer: "Composition: compact · bar compact" -->

`Revenue · FY26`

## Growth is concentrated in two regions.

- North America `$4.2M`
  - Two enterprise renewals landed in Q4
- EMEA `$3.1M`
- APAC `$1.8M`
- LATAM `$0.6M`


---

<!-- _class: bar accent -->
<!-- _footer: "Composition: accent · bar accent" -->

`Revenue · FY26`

## Growth is concentrated in two regions.

- North America `$4.2M`
  - Two enterprise renewals landed in Q4
- EMEA `$3.1M`
- APAC `$1.8M`
- LATAM `$0.6M`


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · bar" -->

## When NOT to reach for bar.

- Parts of one whole
  - If the categories add up to a total and the split is the story, use `piechart` or `stacked-bar`. A plain bar says nothing about it.
- A continuous series over time
  - Twelve monthly bars ask a reader to compare twelve lengths when the claim is a trend. Use `line`, whose job is the movement.
- A percentage against a target
  - '68% of goal' is attainment, not magnitude across categories. `progress` shows attainment; `bullet` adds the target and the band.
- A rainbow single series
  - One series is one hue by design: the length carries the comparison. Color earns its place in `grouped`, where it names the series.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `progress` — attainment against 100% rather than magnitude against each other
- `piechart` — parts of a single whole, where the shares sum to one total
- `funnel` — each stage is a subset of the one before and the drop-off is the story
- `stats` — a row of headline figures with no like-for-like comparison between them
- `big-number` — one figure is the whole slide
