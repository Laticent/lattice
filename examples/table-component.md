---
marp: true
theme: indaco
paginate: true
header: "Lattice · table"
meta: "table · the component"
---

<!-- _class: title silent -->

`Comparison · ledger`

# table

The table component. A markdown pipe table that owns its slide — with a row capacity, autosplit, the portrait card reshape, focus axes, and every switch the universal table layer offers.

---

<!-- _class: table -->

`The default`

## It hugs its rows and centers the block.

A three-row table reads as three rows, not three rows stretched over a screen. The table spans the stage horizontally; the vertical size comes from the content.

| Criterion | Chorus | Productboard | Notion |
| --- | --- | --- | --- |
| Speed | Same day | 3–4 weeks | 40+ hours |
| Auditability | Full log | Partial | None |
| Calibration | Built in | Add-on | Manual |

---

<!-- _class: table table-fill -->

`table-fill`

## `table-fill` takes the leftover height.

The rows spread to use the stage, and each cell centers in its band — the pairing the old stretch geometry always lacked.

| Criterion | Chorus | Productboard | Notion |
| --- | --- | --- | --- |
| Speed | Same day | 3–4 weeks | 40+ hours |
| Auditability | Full log | Partial | None |
| Calibration | Built in | Add-on | Manual |

---

<!-- _class: table table-plain -->

`table-plain`

## `table-plain` drops the zebra.

The hairlines carry the rhythm alone. Independent of `table-fill` — the two combine.

| Criterion | Chorus | Productboard | Notion |
| --- | --- | --- | --- |
| Speed | Same day | 3–4 weeks | 40+ hours |
| Auditability | Full log | Partial | None |
| Calibration | Built in | Add-on | Manual |

---

<!-- _class: table -->

`Row labels · measured`

## The first column reads as a label, when it is one.

Nothing was declared here. The rule looks at the column and turns the emphasis on because these are names, not data.

| Stage | Owner | Due |
| --- | --- | --- |
| Discovery | Research | Week 2 |
| Prototype | Design | Week 5 |
| Pilot | Platform | Week 9 |

---

<!-- _class: table -->

`Row labels · declined`

## A year column is not a set of labels.

The same rule, the same slide class, the opposite answer — an all-numeric first column is data, so it keeps the body weight and your own `**bold**` still shows.

| Year | Revenue | Growth |
| --- | --- | --- |
| 2024 | $4.2M | +21% |
| 2025 | $5.1M | +19% |
| 2026 | $6.4M | +25% |

---

<!-- _class: table row-label -->

`row-label`

## `row-label` overrules the measurement.

Same data as the slide before. You always have the last word — and `no-row-label` turns it off over a column the rule would have emphasized.

| Year | Revenue | Growth |
| --- | --- | --- |
| 2024 | $4.2M | +21% |
| 2025 | $5.1M | +19% |
| 2026 | $6.4M | +25% |

---

<!-- _class: table no-row-label -->

`no-row-label`

## `no-row-label` hands the column back.

The rule would emphasize these names. Turning it off returns the first column to
body weight — and to your own `**bold**`, which the emphasis would otherwise
swallow, since it sets the same weight and ink.

| Stage | Owner | Due |
| --- | --- | --- |
| **Discovery** | Research | Week 2 |
| Prototype | Design | Week 5 |
| Pilot | Platform | Week 9 |

---

<!-- _class: table state-cells -->

`state-cells`

## `state-cells` changes what a cell *means*.

`[x]` `[-]` `[ ]` become the drawn status disc — distinct by shape, not only hue, so it survives grayscale and a color-blind reader. Never a typed check.

| Criterion | Chorus | Productboard | Notion | Sprig |
| --- | :---: | :---: | :---: | :---: |
| Speed | [x] | [ ] | [x] | [x] |
| Auditability | [ ] | [x] | [x] | [x] |
| Calibration | [ ] | [-] | [ ] | [x] |

---

<!-- _class: table state-cells -->
<!-- _focus: row 4 -->

`_focus: row 4`

## Ring the deciding criterion.

The data does not get simpler. The eye gets directed.

| Criterion | Chorus | Productboard | Notion | Sprig |
| --- | :---: | :---: | :---: | :---: |
| Speed | [x] | [ ] | [x] | [x] |
| Auditability | [ ] | [x] | [x] | [x] |
| Calibration | [ ] | [-] | [ ] | [x] |
| Setup time | [x] | [ ] | [ ] | [x] |

---

<!-- _class: table state-cells -->
<!-- _focus: col 5 -->

`_focus: col 5`

## Read one option, top to bottom.

| Criterion | Chorus | Productboard | Notion | Sprig |
| --- | :---: | :---: | :---: | :---: |
| Speed | [x] | [ ] | [x] | [x] |
| Auditability | [ ] | [x] | [x] | [x] |
| Calibration | [ ] | [-] | [ ] | [x] |
| Setup time | [x] | [ ] | [ ] | [x] |

---

<!-- _class: table state-cells -->
<!-- _focus: cell 4,5 -->

`_focus: cell 4,5`

## Or the single decisive cell.

| Criterion | Chorus | Productboard | Notion | Sprig |
| --- | :---: | :---: | :---: | :---: |
| Speed | [x] | [ ] | [x] | [x] |
| Auditability | [ ] | [x] | [x] | [x] |
| Calibration | [ ] | [-] | [ ] | [x] |
| Setup time | [x] | [ ] | [ ] | [x] |

---

<!-- _class: table -->

`Raw HTML`

## A table written as HTML still gets the treatment.

Markdown hands raw HTML through untouched, so the rule never sees these rows. The slide falls back to emphasizing the first column.

<table>
<thead><tr><th>Region</th><th>Q3</th><th>Q4</th></tr></thead>
<tbody>
<tr><td>North America</td><td>$4.2M</td><td>$5.1M</td></tr>
<tr><td>EMEA</td><td>$3.8M</td><td>$3.9M</td></tr>
<tr><td>APAC</td><td>$1.9M</td><td>$2.6M</td></tr>
</tbody>
</table>

---

<!-- _class: table sketch -->

`mode: sketch`

## The same table in the drawn hand.

Frame and row rules become seeded rough.js strokes; the type becomes handwriting. Nothing about the markdown changes.

| Stage | Owner | Due |
| --- | --- | --- |
| Discovery | Research | Week 2 |
| Prototype | Design | Week 5 |
| Pilot | Platform | Week 9 |

---

<!-- _class: table dark -->

`dark`

## Palette-blind, so dark is a token swap.

Zebra, hairlines and row-label ink all resolve from the theme. No rule in this component names a color.

| Stage | Owner | Due |
| --- | --- | --- |
| Discovery | Research | Week 2 |
| Prototype | Design | Week 5 |
| Pilot | Platform | Week 9 |

---

<!-- _class: table compact -->

`compact`

## Six rows, tightened.

Capacity is about four rows and crowds past six. `compact` buys some of that back; past six, split the table across slides.

| Stage | Owner | Due | Status |
| --- | --- | --- | --- |
| Discovery | Research | Week 2 | Shipped |
| Prototype | Design | Week 5 | Shipped |
| Pilot | Platform | Week 9 | In flight |
| Rollout | Platform | Week 14 | Planned |
| Review | Ops | Week 16 | Planned |
| Handover | Ops | Week 18 | Planned |

---

<!-- _class: closing -->

## One class, every switch.

`table-fill` · `table-plain` · `state-cells` · `row-label` · `no-row-label` · `_focus: row/col/cell` · every universal variant. The component declares the contract; the shared table layer draws it.
