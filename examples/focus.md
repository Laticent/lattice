---
marp: true
theme: indaco
paginate: true
footer: "SlideWright · focus & highlighting"
---

<!-- _class: title silent -->

# Focus one thing.

`Feature · focus & highlighting`

A dense slide is a reading slide. When you present it live, you focus the room on one thing at a time — a row, a column, a card, a line of code. `_focus:` makes that a one-line directive, and it survives PDF and PPTX.

---

<!-- _class: divider -->

## The slide stays dense. The attention does not.

You don't simplify the data — you direct the eye. One ordinal grammar addresses any surface: `row`, `col`, `cell`, `item`, `line`. The look is content-aware by default, and palette-blind.

---

<!-- _class: compare-table state-cells -->
<!-- _focus: row 4 -->

## `_focus: row 4` — ring the deciding criterion.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [ ]          | [x]       | [x]         |
| Auditability | [ ]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [ ]       | [x]         |
| Calibration  | [ ]    | [ ]          | [ ]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- _class: compare-table state-cells -->
<!-- _focus: col 5 -->

## `_focus: col 5` — read one option, top to bottom.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [ ]          | [x]       | [x]         |
| Auditability | [ ]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [ ]       | [x]         |
| Calibration  | [ ]    | [ ]          | [ ]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- _class: compare-table state-cells -->
<!-- _focus: cell 4,5 -->

## `_focus: cell 4,5` — the single decisive cell.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [ ]          | [x]       | [x]         |
| Auditability | [ ]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [ ]       | [x]         |
| Calibration  | [ ]    | [ ]          | [ ]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- _class: cards-grid -->
<!-- _focus: item 3 -->

## `_focus: item 3` — spotlight the card that matters.

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and strategic relevance, reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted outcomes to actual outcomes.

---

<!-- _class: code -->
<!-- _focus: line 8-9 -->

## `_focus: line 8-9` — the line that matters.

```javascript
import { DecisionFramework } from "@company/signal-sdk";

const framework = new DecisionFramework({
  configFile: "./framework.config.json",
});

// Calibration depends on logging every decision
const entry = await framework.decisions.log(decision, { signals });
```

---

<!-- _class: cards-grid -->
<!-- _focus: item 3 -->
<!-- _focusStyle: blur -->

## `_focusStyle: blur` — defocus the rest, the camera way.

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves.
- Scoring Model
  - Each signal scored on confidence, recency, and strategic relevance, reviewed quarterly.
- Decision Log
  - Every decision recorded with the signals that informed it and the criteria applied.
- Calibration Loop
  - Monthly retrospective comparing predicted outcomes to actual outcomes.

---

<!-- _class: compare-table state-cells -->
<!-- _focus: row 4 -->
<!-- _focusStyle: pop -->

## `_focusStyle: pop` — lift the row; every cell stays readable.

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | [x]    | [ ]          | [x]       | [x]         |
| Auditability | [ ]    | [x]          | [x]       | [x]         |
| Adoption     | [x]    | [x]          | [ ]       | [x]         |
| Calibration  | [ ]    | [ ]          | [ ]       | [x]         |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

---

<!-- _class: cards-grid -->
<!-- _focusSteps: item 1 | item 2 | item 3 | item 4 -->

## `_focusSteps` — walk the slide, one card at a time.

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

# Direct the eye.

`_focus: <axis> <ordinal>` · default ring on tables, spotlight on lists — override with `_focusStyle`. One directive; every format.
