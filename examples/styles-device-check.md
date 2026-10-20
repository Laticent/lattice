---
marp: true
theme: indaco
paginate: true
---

## Style-loader device check

Open this deck on the phone, then open the same text again with `?styles=modules` after `/playground/`. Every slide below must look identical in both. Slides 2 to 7 are gallery slides; slide 8 overflows on purpose (it should show a red ring and an overflow tab in both); slide 9 is a blocked web image (a hatched placeholder in both).

---

<!-- _class: funnel -->
<!-- _footer: "Chart — funnel · funnel" -->

## Most signals die long before they change a decision.

- Signals logged `12,000`
  - Two-thirds arrive from the same three teams
- Triaged `4,800`
- Scored `2,160`
- Surfaced to a decision `864`
- Logged, with the decision `18`
  - The other 846 were, in fairness, acknowledged

---

<!-- _class: big-number -->
<!-- _footer: "Hero stat · big-number" -->

`Calibration Result · 6-Month Pilot`

- 14x
  - Return on signal investment — measured as decisions that reached the right outcome on the first attempt, versus the baseline rate before the framework was adopted. The number survived two rounds of being asked to.

---

<!-- _class: code -->
<!-- _footer: "Single code block · code" -->

`Implementation · Decision Pipeline`

## Wiring a signal into the framework is three lines of code; the onboarding is three months.

`JavaScript · DecisionFramework SDK v2 interface`

```javascript
import { DecisionFramework } from "@company/signal-sdk";

const framework = new DecisionFramework({ configFile: "./framework.config.json" });

// Score a signal at intake
const score = await framework.score(signal, { dimensions: ["confidence", "recency", "relevance"] });

// Log every decision — calibration depends on it (nobody calls this in prod)
const entry = await framework.decisions.log(decision, { signals: [signal.id], rationale });
```

---

<!-- _class: state-chart lr -->
<!-- _footer: "Chart — state-chart · state-chart lr" -->

`Decision lifecycle`

## How a call moves through the log.

- Logged `start`
  - -score-> Scored
- Scored `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Decided
  - -reject-> Logged
  - -revise-> In Review
- Decided `decision`
  - -calibrate-> Calibrated
- Calibrated `end`

*Rejected entries return to intake; revisions stay in review.*

---

<!-- _class: math -->
<!-- _footer: "Math — closed form · math" -->

`Scoring model · OLS`

## The scoring model fits on one line.

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- $\hat\beta$ — the signal-weight vector the vendors would not sell
- $X$ — design matrix of scored signals, $n \times p$
- $y$ — observed outcomes, length $n$
- $X^\top X$ — Gram matrix, $p \times p$, must be invertible

---

<!-- _class: quote -->
<!-- _footer: "Pull quote · quote" -->

> The signal was always there. We just didn't have a system that forced us to look at it before we'd already decided.

— Head of Product, Pilot Team 3

---

## This slide overflows on purpose

- Bullet 0: a line long enough to wrap across the slide a little
- Bullet 1: a line long enough to wrap across the slide a little
- Bullet 2: a line long enough to wrap across the slide a little
- Bullet 3: a line long enough to wrap across the slide a little
- Bullet 4: a line long enough to wrap across the slide a little
- Bullet 5: a line long enough to wrap across the slide a little
- Bullet 6: a line long enough to wrap across the slide a little
- Bullet 7: a line long enough to wrap across the slide a little
- Bullet 8: a line long enough to wrap across the slide a little
- Bullet 9: a line long enough to wrap across the slide a little
- Bullet 10: a line long enough to wrap across the slide a little
- Bullet 11: a line long enough to wrap across the slide a little
- Bullet 12: a line long enough to wrap across the slide a little
- Bullet 13: a line long enough to wrap across the slide a little
- Bullet 14: a line long enough to wrap across the slide a little
- Bullet 15: a line long enough to wrap across the slide a little
- Bullet 16: a line long enough to wrap across the slide a little
- Bullet 17: a line long enough to wrap across the slide a little
- Bullet 18: a line long enough to wrap across the slide a little
- Bullet 19: a line long enough to wrap across the slide a little
- Bullet 20: a line long enough to wrap across the slide a little
- Bullet 21: a line long enough to wrap across the slide a little
- Bullet 22: a line long enough to wrap across the slide a little
- Bullet 23: a line long enough to wrap across the slide a little
- Bullet 24: a line long enough to wrap across the slide a little
- Bullet 25: a line long enough to wrap across the slide a little
- Bullet 26: a line long enough to wrap across the slide a little
- Bullet 27: a line long enough to wrap across the slide a little
- Bullet 28: a line long enough to wrap across the slide a little
- Bullet 29: a line long enough to wrap across the slide a little
- Bullet 30: a line long enough to wrap across the slide a little
- Bullet 31: a line long enough to wrap across the slide a little
- Bullet 32: a line long enough to wrap across the slide a little
- Bullet 33: a line long enough to wrap across the slide a little
- Bullet 34: a line long enough to wrap across the slide a little
- Bullet 35: a line long enough to wrap across the slide a little
- Bullet 36: a line long enough to wrap across the slide a little
- Bullet 37: a line long enough to wrap across the slide a little
- Bullet 38: a line long enough to wrap across the slide a little
- Bullet 39: a line long enough to wrap across the slide a little

---

<!-- _class: image -->

## A blocked web image

![A remote picture](https://example.com/does-not-load.jpg)
