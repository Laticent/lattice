---
marp: true
theme: indaco
paginate: true
header: "Lattice · table"
---

<!-- _class: title silent -->

# table

`Comparison · Ledger · Prose`

The table component — a GFM pipe table with a row capacity, autosplit, and the portrait card reshape.

---

<!-- _class: table -->
<!-- _footer: "Default · table" -->

## The table compares rows on consistent columns.

| Row | Holds | Budget |
| --- | --- | --- |
| A label | One cell per column | Twelve words |
| Every row | The same column set | Twelve words |
| Six rows | The comfortable page | Twelve words |


---

<!-- _class: table -->
<!-- stress-slide -->
<!-- _footer: "Stress test · table — Eight rows — the hard ceiling." -->

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

<!-- _class: table dark -->
<!-- _footer: "Composition: dark · table dark" -->

## The table compares rows on consistent columns.

| Row | Holds | Budget |
| --- | --- | --- |
| A label | One cell per column | Twelve words |
| Every row | The same column set | Twelve words |
| Six rows | The comfortable page | Twelve words |


---

<!-- _class: table compact -->
<!-- _footer: "Composition: compact · table compact" -->

## The table compares rows on consistent columns.

| Row | Holds | Budget |
| --- | --- | --- |
| A label | One cell per column | Twelve words |
| Every row | The same column set | Twelve words |
| Six rows | The comfortable page | Twelve words |


---

<!-- _class: table accent -->
<!-- _footer: "Composition: accent · table accent" -->

## The table compares rows on consistent columns.

| Row | Holds | Budget |
| --- | --- | --- |
| A label | One cell per column | Twelve words |
| Every row | The same column set | Twelve words |
| Six rows | The comfortable page | Twelve words |


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · table" -->

## When NOT to reach for table.

- Cells full of prose
  - Long sentences in a cell wrap awkwardly and force the column wider. Move to `verdict-grid` for criteria with body text, or `cards-stack` for full prose rows.
- More than 6 rows
  - Past 6 rows the table crowds the slide. Split across two slides or summarize the rows that don't differentiate.
- A table that only supports the prose around it
  - Then it does not need this class at all — write the pipe table on a `content` or un-classed slide and the universal treatment styles it. The component is for a table that owns the slide.
- Reaching for it when a specialist fits better
  - Mostly pass/fail badges is `obligation-matrix` or `verdict-grid`; term/definition pairs are `glossary`; a dated plan is `roadmap`.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `compare-prose` — exactly two options with prose bodies
- `verdict-grid` — options scored against criteria with pass/partial/fail badges
- `obligation-matrix` — many regimes compared against shared obligations
- `cards-stack` — each row needs full-prose breathing room rather than a tabular cell
