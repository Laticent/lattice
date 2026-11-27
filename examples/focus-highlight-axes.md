---
marp: true
theme: indaco
pagination: true
footer: "Laticent · focus highlight"
---
<!-- @meta{layout=title, class=silent} -->

# Highlight works on every axis.

`Feature · _focusStyle: highlight`

Cards, rows, columns, cells and code lines take a tint and an edge, a chart mark takes an edge, and a chart series gets a heavier line. Nothing else on the slide changes.

---

<!-- @meta{layout=table, class=state-cells, focus=row 4, focus-style=highlight} -->



## `_focus: row 4` — tint the deciding criterion.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [!]          | [x]       | [x]         |
| Auditability | [!]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [!]       | [x]         |
| Calibration  | [!]    | [!]          | [!]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- @meta{layout=table, class=state-cells, focus=col 5, focus-style=highlight} -->



## `_focus: col 5` — tint one option, top to bottom.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [!]          | [x]       | [x]         |
| Auditability | [!]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [!]       | [x]         |
| Calibration  | [!]    | [!]          | [!]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- @meta{layout=table, class=state-cells, focus="cell 4,5", focus-style=highlight} -->



## `_focus: cell 4,5` — tint the single decisive cell.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [!]          | [x]       | [x]         |
| Auditability | [!]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [!]       | [x]         |
| Calibration  | [!]    | [!]          | [!]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- @meta{layout=code, focus=line 8, focus-style=highlight} -->



## `_focus: line 8` — tint the line that matters.

```javascript
import { DecisionFramework } from "@company/signal-sdk";

const framework = new DecisionFramework({
  configFile: "./framework.config.json",
});

// Calibration depends on logging every decision
const entry = await framework.decisions.log(decision, { signals });
```

---

<!-- @meta{layout=bar, focus=mark 3, focus-style=highlight} -->



## EMEA is where the quarter was won.

- North America `$4.1M`
- LATAM `$1.2M`
- EMEA `$6.8M`
- APAC `$2.9M`

---

<!-- @meta{layout=line, focus=series 3, focus-style=highlight} -->



## Services grew into the gap enterprise left.

- Q1 2025
  - Enterprise `4.1`
  - Mid-market `2.6`
  - Services `1.2`
- Q2 2025
  - Enterprise `4.4`
  - Mid-market `2.9`
  - Services `1.6`
- Q3 2025
  - Enterprise `4.2`
  - Mid-market `3.4`
  - Services `2.3`
- Q4 2025
  - Enterprise `3.8`
  - Mid-market `3.9`
  - Services `3.1`
- Q1 2026
  - Enterprise `3.6`
  - Mid-market `4.3`
  - Services `4.0`

---

<!-- @meta{layout=cards-grid, focus="item 1, item 4", focus-style=highlight} -->



## `_focus: item 1, item 4` — two targets at once.

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and strategic relevance, reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted outcomes to actual outcomes.

---
<!-- @meta{layout=closing, class=silent} -->

# Name it once, see it everywhere.

`_focus: <axis> <ordinal>` · `_focusStyle:` picks how it shows. `highlight` tints and edges the target, and nothing dims.
