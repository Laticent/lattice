---
marp: true
theme: indaco
paginate: true
header: "Lattice · compare-table"
---

<!-- _class: title silent -->

# compare-table

`Comparison · Ledger · Prose`

Multi-row comparison table with consistent columns.

---

<!-- _class: compare-table -->
<!-- _footer: "Default · compare-table" -->

## The table compares rows on consistent columns.

| Row | Holds | Budget |
| --- | --- | --- |
| A label | One cell per column | Twelve words |
| Every row | The same column set | Twelve words |
| Six rows | The comfortable page | Twelve words |


---

<!-- _class: compare-table -->
<!-- stress-slide -->
<!-- _footer: "Stress test · compare-table — Eight rows — the hard ceiling." -->

## Eight rows is the table's hard ceiling.

| Row | Reads | At the ceiling |
| --- | --- | --- |
| One | First | Fresh attention |
| Two | Fast | Keep cells short |
| Three | Steady | Parallel phrasing |
| Four | Mid-page | The pivot row |
| Five | Slower | Trim adjectives |
| Six | The soft mark | Past comfort |
| Seven | Strained | Nearly done |
| Eight | Last | The hard stop |


---

<!-- _class: compare-table dark -->
<!-- _footer: "Composition: dark · compare-table dark" -->

## The table compares rows on consistent columns.

| Row | Holds | Budget |
| --- | --- | --- |
| A label | One cell per column | Twelve words |
| Every row | The same column set | Twelve words |
| Six rows | The comfortable page | Twelve words |


---

<!-- _class: compare-table compact -->
<!-- _footer: "Composition: compact · compare-table compact" -->

## The table compares rows on consistent columns.

| Row | Holds | Budget |
| --- | --- | --- |
| A label | One cell per column | Twelve words |
| Every row | The same column set | Twelve words |
| Six rows | The comfortable page | Twelve words |


---

<!-- _class: compare-table accent -->
<!-- _footer: "Composition: accent · compare-table accent" -->

## The table compares rows on consistent columns.

| Row | Holds | Budget |
| --- | --- | --- |
| A label | One cell per column | Twelve words |
| Every row | The same column set | Twelve words |
| Six rows | The comfortable page | Twelve words |


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · compare-table" -->

## When NOT to reach for compare-table.

- **Cells full of prose.** Long sentences in a table cell wrap awkwardly and force the column wider. Move to `verdict-grid` for criteria with body text, or `cards-stack` for full prose rows.
- **More than 6 rows.** Past 6 rows the table density crowds the slide. Split into two slides or summarize the rows that don't differentiate.
- **State-marker rows.** When most cells are pass/fail/partial badges, the right layout is `obligation-matrix` or `verdict-grid`. compare-table is for textual values.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `compare-prose` — exactly two options with prose bodies
- `verdict-grid` — options scored against criteria with pass/partial/fail badges
- `obligation-matrix` — many regimes compared against shared obligations
- `cards-stack` — each row needs full-prose breathing room rather than a tabular cell
