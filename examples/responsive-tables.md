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

A slide does not grow, and a card is taller than the row it replaces. So a table switches only where it genuinely breaks. A half pane on a 16:9 slide is wide enough, so nothing moves, and neither does a table on a full-width slide.

---

<!-- _class: columns ratio-30-70 -->
<!-- _footer: "Measure over time · the row labels repeat beside each run of columns" -->

## A quarterly table splits into runs of columns, labels repeated.

### Revenue

| Metric | Q1 | Q2 | Q3 | Q4 |
| --- | ---: | ---: | ---: | ---: |
| Revenue | 40 | 45 | 51 | 58 |
| Margin | 61% | 62% | 62% | 63% |

### What changed

Each row is a measure and each column a quarter, so the reader compares both ways. Cards would break that. Instead the quarters split into blocks of two, and each block repeats the row labels, so Q1 still sits beside Q2. A cross-tab (region by product) takes the same layout; at the narrowest, one column per block.

---

<!-- _class: columns ratio-30-70 -->
<!-- _footer: "Option comparison · one block per option" -->

## An option table becomes one block per option.

### Plans

| Criterion | Starter | Team | Scale |
| --- | --- | --- | --- |
| Per seat | $12 | $24 | $48 |
| Support | Email | Chat | Phone |

### What changed

Each column is an option, and the reader weighs one option at a time against the same criteria. So each option becomes a block, and every block lists the criteria beside its values.

---

<!-- _class: columns ratio-30-70 -->
<!-- _footer: "Ranked list · a two-line row keeps rank, name and figure together" -->

## A ranked list keeps rank, name and figure on one line.

### Top accounts

| Rank | Account | Sector | ARR |
| ---: | --- | --- | ---: |
| 1 | Northwind | Logistics | 1,240 |
| 2 | Contoso | Retail | 980 |
| 3 | Fabrikam | Industry | 860 |

### What changed

The reader scans a ranking down the rank, the name and the figure. Those three stay on the first line; the other columns move to a second line under the name, each with its label.

---

<!-- _class: columns ratio-30-70 -->
<!-- _footer: "Schedule · the date sits above its item" -->

## A schedule puts each date above its milestone.

### The migration

| Date | Milestone | Owner |
| --- | --- | --- |
| 12 Jan | Freeze the schema | Ada |
| 2 Feb | Dual-write | Tomás |
| 23 Feb | Backfill | Nia |

### What changed

A schedule reads as a sequence of dates. Each date becomes a small heading over its milestone, and the owner follows as a labeled line.

---

<!-- _class: columns ratio-30-70 table-lists -->
<!-- _footer: "Independent lists · table-lists turns each column into a list" -->

## Three lists in one table become three lists.

### The review

| Strengths | Gaps | Risks |
| --- | --- | --- |
| Strong API | Onboarding | Pricing |
| Loyal base | Mobile app | Key person |

### What changed

The columns share nothing but the row they happen to sit on, so each becomes its own list. Detection cannot tell this kind from a record list, so the author names it with `table-lists`.

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

`no-table-reflow` on the pane's marker keeps this table at every width, here a short one that fits as a table. On a slide without panes it goes in the slide's class. `table-cards`, `table-pairs` and `table-lists` force a layout instead.
