---
marp: true
theme: indaco
paginate: true
header: "Lattice · responsive tables"
---

<!-- _class: title silent -->

# Responsive tables

`Feature · Table reflow`

A table that runs out of width changes shape instead of squeezing.

---

<!-- _class: columns ratio-30-70 -->
<!-- _footer: "Records · a narrow pane turns each row into a card" -->

## A record list in a narrow pane becomes one card per row.

### The team

| Name | Role | City |
| --- | --- | --- |
| Ada Okafor | Engineering lead | Lagos |
| Priya Raman | Design director | Bengaluru |
| Tomás Ruiz | Product manager | Madrid |

### What changed

Each row is one person, so each becomes a card. The first cell is the card's title; every other cell is a label and its value. Nothing in the source changed: the engine read the table as a record list and the pane's width did the rest.

---

<!-- _class: columns ratio-30-70 -->
<!-- _footer: "Key-value · a narrow pane puts each label above its value" -->

## A two-column table puts each label above its value.

### The appliance

| Spec | Value |
| --- | --- |
| Throughput | 40 Gb/s sustained |
| Power draw | 180 W typical |
| Footprint | 1U, 43 cm deep |
| Warranty | Five years |

### What changed

A spec sheet reads in pairs. Side by side, the value column would be a few characters wide; stacked, each value gets the pane's full width.

---

<!-- _class: columns -->
<!-- _footer: "Half pane · wide enough, so the table stays a table" -->

## In a half pane the same table stays a table.

### The team

| Name | Role | City |
| --- | --- | --- |
| Ada Okafor | Engineering lead | Lagos |
| Priya Raman | Design director | Bengaluru |
| Tomás Ruiz | Product manager | Madrid |

### Why it did not switch

A slide does not grow, and a card is taller than the row it replaces. So a table switches only where it genuinely breaks. A half pane on a 16:9 slide is wide enough, so nothing moves.

---

<!-- _class: columns ratio-30-70 -->
<!-- _footer: "Measure over time · read both ways, so it keeps its grid" -->

## A quarterly table keeps its grid, even in a narrow pane.

### Revenue

| Metric | Q1 | Q2 | Q3 |
| --- | ---: | ---: | ---: |
| Revenue | 40 | 45 | 51 |
| Margin | 61% | 62% | 62% |

### Why it kept its grid

Each row is a measure and each column a quarter, so the reader compares in both directions. Cards would break that, so this kind keeps its table until it has a layout of its own.

---

<!-- _class: columns ratio-30-70 -->
<!-- _footer: "Override · no-table-reflow on the pane marker keeps the table" -->

## An author can keep the table with one word.

<!-- _pane: content no-table-reflow -->
### The team

| Name | Team | Since |
| --- | --- | --- |
| Ada | Core | 2019 |
| Priya | Design | 2021 |
| Tomás | Product | 2020 |

### The override

`no-table-reflow` on the pane's marker keeps this table at every width, here a short one that fits as a table. On a slide without panes it goes in the slide's class. `table-cards` and `table-pairs` force a layout instead.

---

<!-- _footer: "Full width · a 16:9 slide never switches" -->

## A table on a full-width slide renders exactly as before.

| Name | Role | City | Since |
| --- | --- | --- | --- |
| Ada Okafor | Engineering lead | Lagos | 2019 |
| Priya Raman | Design director | Bengaluru | 2021 |
| Tomás Ruiz | Product manager | Madrid | 2020 |

The change only adds a column label to each cell and a layout name to the table. Neither shows until the table's box gets narrow.

---

<!-- _class: closing silent -->

# Tables that fit their box

`Records · Key-value · more kinds to follow`
