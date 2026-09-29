---
marp: true
theme: indaco
paginate: true
header: "Lattice · rows"
---

<!-- _class: title silent -->

# rows

`Layout · Split · Mixed`

Two components stacked on one slide, one above the other.

---

<!-- _class: rows -->
<!-- _footer: "Default · rows" -->

## Hiring kept pace with the plan through Q3.

<!-- _pane: progress -->
### Hired against plan

- Engineering `98%`
- Sales `92%` `at-risk`

<!-- _pane: table -->
### By function

| Function | Plan | Hired |
|---|---|---|
| Engineering | 120 | 118 |
| Sales | 60 | 55 |


---

<!-- _class: rows 35/65 no-rule -->
<!-- _footer: "no rule · rows no-rule — Drops the rule between the panes." -->

## Three regions carried the quarter.

### What happened

Two renewals and a price rise lifted EMEA and APAC; North America held.

<!-- _pane: bar -->
### Revenue by region
`$M, Q3`

- North America `4.2`
- EMEA `3.1`
- APAC `1.8`


---

<!-- _class: rows -->
<!-- stress-slide -->
<!-- _footer: "Stress test · rows — Progress over a four-column table, with the slide's Key Insight below both." -->

## Hiring kept pace with the plan through Q3.

<!-- _pane: progress -->
### Hired against plan

- Engineering `98%`
- Sales `92%` `at-risk`

<!-- _pane: table -->
### By function

| Function | Plan | Hired | Open |
|---|---|---|---|
| Engineering | 120 | 118 | 2 |
| Sales | 60 | 55 | 5 |

> Sales is the one function still hiring into Q4.


---

<!-- _class: rows dark -->
<!-- _footer: "Composition: dark · rows dark" -->

## Hiring kept pace with the plan through Q3.

<!-- _pane: progress -->
### Hired against plan

- Engineering `98%`
- Sales `92%` `at-risk`

<!-- _pane: table -->
### By function

| Function | Plan | Hired |
|---|---|---|
| Engineering | 120 | 118 |
| Sales | 60 | 55 |


---

<!-- _class: rows compact -->
<!-- _footer: "Composition: compact · rows compact" -->

## Hiring kept pace with the plan through Q3.

<!-- _pane: progress -->
### Hired against plan

- Engineering `98%`
- Sales `92%` `at-risk`

<!-- _pane: table -->
### By function

| Function | Plan | Hired |
|---|---|---|
| Engineering | 120 | 118 |
| Sales | 60 | 55 |


---

<!-- _class: rows accent -->
<!-- _footer: "Composition: accent · rows accent" -->

## Hiring kept pace with the plan through Q3.

<!-- _pane: progress -->
### Hired against plan

- Engineering `98%`
- Sales `92%` `at-risk`

<!-- _pane: table -->
### By function

| Function | Plan | Hired |
|---|---|---|
| Engineering | 120 | 118 |
| Sales | 60 | 55 |


---

<!-- _class: cards-stack -->
<!-- _footer: "Anti-patterns · rows" -->

## When NOT to reach for rows.

- Two unrelated points
  - Two panes are one argument. If the halves say different things, make two slides.
- A tall component
  - A component that needs height (a `quote`, a `kpi` row, `radar`) does not read in a band; the engine re-orients or splits the slide, and `lint:deck` says so (`pane-arrange`).
- Three or more things
  - A pane layout holds two panes. Three parallel items are `cards-stack` or `list`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `columns` — the two components read better side by side
- `cards-stack` — three or more parallel items, stacked
- `split-panel` — one featured element beside supporting points
