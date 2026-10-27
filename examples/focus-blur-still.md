---
marp: true
theme: indaco
paginate: true
footer: "Laticent · blur holds still"
---

<!-- _class: title silent -->

# Blur softens the rest and moves nothing.

`Fix · _focusStyle: blur`

`blur` used to scale its target and cast a hard shadow, which shifted the cards and clipped the outer ones at the stage edge. Now it only defocuses the rest.

---

<!-- _class: cards-grid -->
<!-- _focus: item 4 -->
<!-- _focusStyle: blur -->

## The corner card stays inside the stage.

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves. Normalized into a common schema before scoring.
- Scoring Model
  - Each signal scored on three dimensions: confidence, recency, and strategic relevance. Weights are team-configurable — configured once, then defended forever.
- Decision Log
  - Every decision recorded with the signals that informed it, the options considered, and the criteria applied. Feeds the calibration loop.
- Calibration Loop
  - Monthly retrospective that compares predicted outcomes to actual outcomes and adjusts scoring weights accordingly.

---

<!-- _class: cards-stack -->
<!-- _focus: item 2 -->
<!-- _focusStyle: blur -->

## The lower card stays full width.

- False signal amplification
  - One loud voice dominating the decision. The model caps any source at 30% — a ceiling one enterprise customer tests monthly.
- Signal hoarding
  - Signals collected, decisions unlogged — the loop learns nothing. Above P2, the log is required. No log, no change.

---

<!-- _class: checklist -->
<!-- _focus: item 6 -->
<!-- _focusStyle: blur -->

## A lower row never nudges the rows above.

- [x] Signal taxonomy ratified, in workshop four of three
- [x] Scoring weights agreed by the steering committee
- [x] Decision log live in staging
- [-] Pilot teams trained, two still "circling back"
- [-] Operating rhythm on the calendar, attendance optional in practice
- [ ] Exec sponsor confirmed for the launch comms
- [/] Per-team weighting UI, descoped to next half

---

<!-- _class: verdict-grid -->
<!-- _focus: item 2 -->
<!-- _focusStyle: blur -->

## The right-hand verdict keeps its edge.

- Path A · The spreadsheet
  - [x] Speed
  - [!] Auditability
  - [x] Adoption
  - [!] Calibration
  - Open everywhere, version unknown. No trace — in fairness, the appeal.
- Path B · Vendor North
  - [x] Speed
  - [x] Auditability
  - [!] Adoption
  - [!] Calibration
  - Clean intake, real audit trail. The weights stay on their side of the contract.
- Path C · Vendor West
  - [x] Speed
  - [x] Auditability
  - [x] Adoption
  - [!] Calibration
  - The better demo, by some distance. The weights are theirs; so is §9.2.
- Path D · Build in-house
  - [x] Speed
  - [x] Auditability
  - [x] Adoption
  - [x] Calibration
  - All four criteria, inside the budget, weights ours. Recommended.

---

<!-- _class: pricing -->
<!-- _focus: item 3 -->
<!-- _focusStyle: blur -->

## Every pricing tier sits where it rests.

- Vendor North `$38 / seat / mo`
  - [x] Signal-intake connectors
  - [/] Calibration weights exposed
  - [/] Exit without repricing
  - For teams that enjoy renewals.
- Vendor West `$52 / seat / mo` *Most popular*
  - [x] Signal-intake connectors
  - [/] Calibration weights exposed
  - [/] Exit without repricing
  - For teams that enjoy nicer renewals.
- Build in-house `4 engineers`
  - [x] Signal-intake connectors
  - [x] Calibration weights exposed
  - [x] Exit without repricing
  - For us, apparently, again.

---

<!-- _class: list-steps -->
<!-- _focus: item 4 -->
<!-- _focusStyle: blur -->

## Step four ends flush with the stage.

1. Pick one team and one decision type
   - A team with an existing rhythm, one decision category, thirty days.
2. Log everything, decide nothing differently
   - Month one changes nothing but the record. Decide as you always did; write it down.
3. Run your first retrospective
   - Day 30: score decisions against outcomes. The model's first calibration pass.
4. Expand to a second team
   - One retrospective in hand, onboard team two with data, not promises.

---

<!-- _class: closing silent -->

# Focus without the shove.

`_focusStyle: blur` keeps every card at its resting size and position, so `_focusSteps` walks a slide without anything jumping.
