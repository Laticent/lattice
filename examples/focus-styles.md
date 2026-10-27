---
marp: true
theme: indaco
paginate: true
footer: "Laticent · focus styles"
---

<!-- _class: title silent -->

# Five ways to point at one card.

`Feature · _focusStyle: highlight`

`_focus:` picks the target and `_focusStyle:` picks how it is shown. Two styles dim or blur the rest, and two tint or outline the target. `highlight` is new: it tints the target and edges it in the accent, leaves every other target untouched, and works on every axis `_focus:` can address.

---

<!-- _class: cards-grid -->
<!-- _focus: item 3 -->
<!-- _focusStyle: spotlight -->

## `spotlight` — dim the rest (the default on cards).

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and strategic relevance, reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted outcomes to actual outcomes.

---

<!-- _class: cards-grid -->
<!-- _focus: item 3 -->
<!-- _focusStyle: blur -->

## `blur` — defocus the rest, the camera way.

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and strategic relevance, reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted outcomes to actual outcomes.

---

<!-- _class: cards-grid -->
<!-- _focus: item 3 -->
<!-- _focusStyle: ring -->

## `ring` — outline the target, nothing dims.

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and strategic relevance, reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted outcomes to actual outcomes.

---

<!-- _class: cards-grid -->
<!-- _focus: item 3 -->
<!-- _focusStyle: list-fill -->

## `list-fill` — tint the target, nothing dims.

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and strategic relevance, reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted outcomes to actual outcomes.

---

<!-- _class: cards-grid -->
<!-- _focus: item 3 -->
<!-- _focusStyle: highlight -->

## `highlight` — tint and edge the target, nothing dims.

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and strategic relevance, reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted outcomes to actual outcomes.

---

<!-- _class: divider -->

## `highlight` works on every axis.

Rows, columns, cells, code lines, chart marks and chart series take the same tint and edge. Nothing else on the slide changes.

---

<!-- _class: table state-cells -->
<!-- _focus: row 4 -->
<!-- _focusStyle: highlight -->

## `_focus: row 4` — tint the deciding criterion.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [!]          | [x]       | [x]         |
| Auditability | [!]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [!]       | [x]         |
| Calibration  | [!]    | [!]          | [!]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- _class: table state-cells -->
<!-- _focus: col 5 -->
<!-- _focusStyle: highlight -->

## `_focus: col 5` — tint one option, top to bottom.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [!]          | [x]       | [x]         |
| Auditability | [!]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [!]       | [x]         |
| Calibration  | [!]    | [!]          | [!]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- _class: table state-cells -->
<!-- _focus: cell 4,5 -->
<!-- _focusStyle: highlight -->

## `_focus: cell 4,5` — tint the single decisive cell.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [!]          | [x]       | [x]         |
| Auditability | [!]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [!]       | [x]         |
| Calibration  | [!]    | [!]          | [!]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- _class: code -->
<!-- _focus: line 8 -->
<!-- _focusStyle: highlight -->

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

<!-- _class: bar -->
<!-- _focus: mark 3 -->
<!-- _focusStyle: highlight -->

## EMEA is where the quarter was won.

- North America `$4.1M`
- LATAM `$1.2M`
- EMEA `$6.8M`
- APAC `$2.9M`

---

<!-- _class: line -->
<!-- _focus: series 3 -->
<!-- _focusStyle: highlight -->

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

<!-- _class: cards-grid -->
<!-- _focus: item 1, item 4 -->
<!-- _focusStyle: highlight -->

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

<!-- _class: closing silent -->

# Pick the look, keep the target.

`_focus: <axis> <ordinal>` · `_focusStyle: highlight` — tint and edge, nothing dims.
