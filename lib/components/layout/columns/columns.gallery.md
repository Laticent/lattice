---
marp: true
theme: indaco
paginate: true
header: "Lattice · columns"
---

<!-- _class: title silent -->

# columns

`Layout · Split · Mixed`

Two components side by side on one slide, at a ratio you choose.

---

<!-- _class: columns ratio-60-40 -->
<!-- _footer: "Default · columns" -->

`Q3 review`

## Services outgrew licenses for the first time.

<!-- _pane: bar -->
### Revenue by line
`$M, trailing four quarters`

- Licenses `42`
- Services `47`
- Training `9`

<!-- _pane: list -->
### What changed

- Services passed licenses in March
- Two renewals slipped to Q4

> The mix shift is structural, not seasonal.


---

<!-- _class: columns ratio-45-55 no-rule -->
<!-- _footer: "no rule · columns no-rule — Drops the spine between the panes." -->

`Support · after the migration`

## The migration halved support tickets.

### Before

- 1,240 tickets a month
- 31 hours to first reply

### After

- 610 tickets a month
- 6 hours to first reply


---

<!-- _class: columns ratio-40-60 -->
<!-- stress-slide -->
<!-- _footer: "Stress test · columns — A list beside a four-column table at 40/60, with the slide's Key Insight." -->

`columns · stress`

## Two vendors cleared the security review.

<!-- _pane: list -->
### Cleared

- Northwind
- Contoso

<!-- _pane: table -->
### Findings by vendor

| Vendor | Critical | High | Status |
|---|---|---|---|
| Northwind | 0 | 1 | Cleared |
| Contoso | 0 | 2 | Cleared |
| Fabrikam | 2 | 4 | Rejected |

> Fabrikam can re-apply after its Q1 fixes.


---

<!-- _class: columns ratio-60-40 dark -->
<!-- _footer: "Composition: dark · columns dark" -->

`Q3 review`

## Services outgrew licenses for the first time.

<!-- _pane: bar -->
### Revenue by line
`$M, trailing four quarters`

- Licenses `42`
- Services `47`
- Training `9`

<!-- _pane: list -->
### What changed

- Services passed licenses in March
- Two renewals slipped to Q4

> The mix shift is structural, not seasonal.


---

<!-- _class: columns ratio-60-40 compact -->
<!-- _footer: "Composition: compact · columns compact" -->

`Q3 review`

## Services outgrew licenses for the first time.

<!-- _pane: bar -->
### Revenue by line
`$M, trailing four quarters`

- Licenses `42`
- Services `47`
- Training `9`

<!-- _pane: list -->
### What changed

- Services passed licenses in March
- Two renewals slipped to Q4

> The mix shift is structural, not seasonal.


---

<!-- _class: columns ratio-60-40 accent -->
<!-- _footer: "Composition: accent · columns accent" -->

`Q3 review`

## Services outgrew licenses for the first time.

<!-- _pane: bar -->
### Revenue by line
`$M, trailing four quarters`

- Licenses `42`
- Services `47`
- Training `9`

<!-- _pane: list -->
### What changed

- Services passed licenses in March
- Two renewals slipped to Q4

> The mix shift is structural, not seasonal.


---

<!-- _class: cards-stack -->
<!-- _footer: "Anti-patterns · columns" -->

## When NOT to reach for columns.

- Two unrelated points
  - Two panes are one argument. If the halves say different things, make two slides.
- A binary decision with a verdict
  - Weighing two options and landing a recommendation is `split-compare`, whose verdict card this layout does not have.
- Three or more things
  - A pane layout holds two panes. Three parallel items are `cards-grid` or `compare-prose`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `rows` — the two components are wide and read better stacked
- `split-panel` — one featured element beside supporting points, not two components
- `split-compare` — two options and a recommendation
- `compare-prose` — two or three co-equal options in prose
