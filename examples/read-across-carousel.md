---
size: portrait
theme: indaco
paginate: true
form: standard
header: "Lattice · Read-across carousel"
footer: "Read-across carousel"
---

<!-- _class: title -->

# The read-across carousel

`Fit Ladder · split what can't paginate`

A comparison can't be cut down the middle — so when it won't fit, it becomes a sequence.

---

<!-- _class: content -->

## What the carousel solves

- A list overflows? Split it between items — that is **auto-split**
- A **comparison** reads *across* its two sides — slice it and the meaning is gone
- So the engine **re-authors** it as a sequence: a cover, one page per side, a verdict
- Each frame stands alone, reads in order — no setting, no shrinking

---

<!-- _class: compare-prose -->

## Scoring model: before and after the calibration loop

- Before Calibration
  - Equal weights — confidence, recency, relevance at 33% each. Honest about the guessing. Unchanged in eighteen months.
- After Calibration
  - Weights reflect each team's accuracy — but the team keeps changing, and the history is one atypical quarter.


---

<!-- _class: compare-prose -->

## The evaluation came down to a question the vendors could not answer

- Buy a vendor framework
  - Three evaluated. None expose calibration weights — the criterion that eliminated all three, added after the team chose to build.
- Build the framework in-house
  - Owns the policy, the loop, the timeline. The window closes in eighteen months; a cutover eats nine.

The conclusion came first; the evaluation was built to hold it. Everyone in the room knew it.

---

<!-- _class: compare-prose transition -->

## Decisions used to require a quarterly re-litigation

- Before
  - Decisions lived in the room they were made in. Six months on, nobody could say why a project was killed.
- After
  - Every decision is logged with its signals, options, and bet. Teams still relitigate, but the argument is shorter.

---

<!-- _class: split-panel watermark -->

`Section 01 · Deep dive`

## Scoring Model Deep Dive

The most configurable component. Six dimensions:

- Confidence
  - Corroborating sources, 1–5. Enterprise counts as 1.
- Recency
  - Time-decay, configurable half-life. Set to two weeks.
- Strategic Relevance
  - Owner-scored, 1–5. A 5 tracks whoever presents the roadmap.
- Source Diversity
  - Rewards breadth — in practice, newsletter volume.
- Volatility
  - Penalizes swing — including the signal that caught the last surprise.
- Owner Bias
  - The correction nobody applies, scored by the owner it is meant to correct.

---

<!-- _class: list-tabular -->

## The six signal dimensions, what they measure, and how they score

- Confidence
  - Independent corroborating sources
  - 1–5, enterprise counts as one
- Recency
  - Time-decay on a configurable half-life
  - Two-week default surprises everyone
- Strategic Relevance
  - Owner-scored against the roadmap
  - 1–5, and a 5 is whoever presents
- Source Diversity
  - Rewards breadth of corroboration
  - Counts newsletters as sources
- Volatility
  - Penalizes signals that swing
  - Also penalizes the early-warning ones
- Owner Bias
  - The correction nobody applies
  - Scored by the owner it corrects

---

<!-- _class: decision -->

`Decision · 2026 Q1`

## We are building, not buying

- Build
  - Owns the scoring policy, the calibration loop, and the timeline — plus the maintenance, the on-call, and every future explanation of why the framework scored the wrong thing.
- Why not buy
  - Three vendors, none exposing calibration weights. The weights are the product; you cannot buy the product without them. That was the finding.
- Why not delay
  - The window closes in eighteen months — a sentence that has been in this deck, unchanged, since Q1 2025.

---

<!-- _class: compare-code -->

`Before & After · Scoring Mechanics`

## Spreadsheet-driven scoring versus a framework that is basically also a spreadsheet

`Before · The Honest Spreadsheet`

```python
import pandas as pd

signals = pd.read_csv("signals.csv")
signals["score"] = signals.apply(
    lambda r: 0.33 * r.confidence + 0.33 * r.recency + 0.33 * r.relevance,
    axis=1,
)
signals.to_csv("scored.csv")
```

`After · The Framework`

```python
from decision_framework import Calibrator

cal = Calibrator.load("weights.json")
signals["score"] = cal.score(signals)
cal.decisions.log_if_changed(signals)
```

---

<!-- _class: content -->

## One finish, more slides

- **compare-prose / split-panel / list-tabular** → a cover, then the content flows on
- **decision** → the verdict is the cover; its reasons flow on
- **compare-code** → a cover, then one code block per page
- Every split wears the *same* cover finish — the deck, just more of it (`autosplit: on`)

---

<!-- _class: closing -->

# More slides, never a clipped comparison

`One cover finish across the family — nothing shrinks`
