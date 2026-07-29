---
marp: true
size: 4K
theme: crepuscolo
paginate: true
header: "Lattice · Decision Framework Gallery"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _footer: "Title slide · title" -->

# From Signal to Strategy

`Decision Framework · Q3 2025`

A 59-slide answer to the question "have you considered writing things down"

---

<!-- _class: agenda progress-2 -->
<!-- _footer: "Agenda near top, section 2 pre-highlighted · agenda progress-2" -->

## What this deck covers, in order

1. Why This Exists — slide 3
2. The Framework — slide 7
3. The Evaluation — slide 23
4. The Build — slide 33
5. The Results — slide 48

---

<!-- _class: content -->
<!-- _footer: "Single-idea prose · content" -->

`Context · Competitive Dynamics`

## The window for differentiation is narrowing

Commoditized infrastructure, compressed release cycles, and rising switching costs have cut the average durable advantage from 36 months to under 14. This slide will appear in every deck for the next two years regardless of whether that stays true.

---

<!-- _class: quote -->
<!-- _footer: "Pull quote · quote" -->

> The signal was always there. We just didn't have a system that forced us to look at it before we'd already decided.

— Head of Product, Pilot Team 3, in a retrospective where we then decided what we'd already decided

---

<!-- _class: stats -->
<!-- _footer: "KPI numbers · stats" -->

`Impact · Pilot Results`

## Six months of results across four product teams

`Same teams, same conditions, same spreadsheet.`

1. 73%
   - faster decision close
2. 4.2×
   - signal recall
3. 18
   - decisions logged
4. 91%
   - team alignment

---

<!-- _class: big-number -->
<!-- _footer: "Hero stat · big-number" -->

`Calibration Result · 6-Month Pilot`

- 14x
  - Return on signal investment — on a baseline the framework team defined. Verified by nobody.

---

<!-- _class: divider numbered -->
<!-- _paginate: false -->
<!-- _footer: "Section opener · divider numbered" -->

`Section 01 · The Framework`

## We built a four-component scoring system. Two of the four are used regularly

---

<!-- _class: divider light -->
<!-- _footer: "Centered orientation · divider light" -->

`Signal Definition · Workshop 04`

## Before we score signals, we need to agree on what a signal is

Three workshops in. The definition gets socialized in a fifth before anyone can use it.

---

<!-- _class: diagram -->
<!-- _footer: "Component diagram · diagram" -->

`Architecture · Signal Pipeline`

## How signals move from input to decision

`Four-stage pipeline — 11 weeks in, still in pilot`

```mermaid
---
title: processing pipeline — weekly cadence
---
flowchart LR
  A["Raw Signals"] --> B["Classify"]
  B --> C["Score & Weight"]
  C --> D["Decision Log"]
  D -.->|"nobody reads this part"| B
```

---

<!-- _class: cards-grid -->
<!-- _footer: "2×2 card grid · cards-grid" -->

## The framework has four components

- Signal Intake
  - Weekly structured collection across customer conversations, market data, and competitive moves. Everyone agrees it's a good idea. Nobody does it the week of the retrospective.
- Scoring Model
  - Confidence, recency, and strategic relevance, each weighted. The weights are team-configurable — which means the head of product reconfigures them until the output agrees with the roadmap.
- Decision Log
  - Every decision recorded with its signals and criteria. A required artifact. It holds 18 entries, against roughly 340 decisions actually made.
- Calibration Loop
  - A monthly retrospective comparing predicted outcomes to real ones. The meeting reliably exists. The predictions, reliably, do not.

---

<!-- _class: cards-grid -->
<!-- _footer: "2 top + 1 bottom · cards-grid" -->

## Signal Intake produces three outputs

1. Weekly Signal Brief
   - Last week's top 10 signals, ranked, with confidence scores and sources. Sent to product leads every Monday — where it sits unread in a folder called "Framework Stuff."
2. Anomaly Alerts
   - Real-time flags when a signal crosses the 2σ threshold, routed to the accountable PM on a 4-hour SLA. The PM usually replies inside the 4 hours — to ask what 2σ means.
3. Monthly Signal Index
   - The source of truth for the calibration loop, and required reading before every retrospective. Nobody has read it. It is comprehensive.

---

<!-- _class: cards-grid three -->
<!-- _footer: "Three-column grid · cards-grid three" -->

## The three things the framework connects

- Signal
  - The observed input — a verbatim, a metric move, a competitor's announcement. The unit of intake. Frequently confused with "things the VP heard at a conference," which enter the pipeline already scored.
- Decision
  - A signal plus a deadline, logged with its rationale. Every decision is meant to trace to a signal. In practice the signal is "we discussed it at the offsite," reconstructed for the log the following week.
- Outcome
  - The result, measured against the prediction at retrospective. The unit of calibration. 18 have been logged. Roughly 340 have occurred; the other 322 are filed under "context."

---

<!-- _class: cards-stack -->
<!-- _footer: "Vertical card stack · cards-stack" -->

## Two failure modes the framework is designed to prevent

- False signal amplification.
  - A single loud voice — one enterprise customer, one analyst report, one VP with a feeling — dominates the decision without ever being weighed against the full signal set. The model caps any one source at 30% of total weight. Unless that source is the CEO, in which case the cap is a guideline.
- Signal hoarding.
  - Teams collect signals but never log decisions, so the calibration loop has nothing to learn from. The rule — no log, no change above P2 — was printed on a poster and hung in the meeting room. The poster has since been replaced by a free-pizza flyer.

---

<!-- _class: split-panel watermark -->
<!-- _footer: "Dark panel + content · split-panel watermark" -->

## Scoring Model Deep Dive

`Section 01 · Continued`

### What the scoring model actually does

The most configurable component — a feature or a warning sign, depending on your team. Three dimensions:

1. Confidence
   - Independent corroborating sources, 1–5. Enterprise customers count as 1, regardless of volume.
1. Recency
   - Time-decay, configurable half-life. Set to two weeks, then surprised only recent news scores.
1. Strategic Relevance
   - Owner-scored, 1–5. A 5 correlates with whoever is presenting the roadmap this quarter.

---

<!-- _class: list-tabular -->
<!-- _footer: "Tabular list · list-tabular" -->

## The six signal dimensions

1. Confidence
   - Independent sources corroborating it
   - _1–5 · Auto · Enterprise always gets a 4_
2. Recency
   - Time-decay from signal date
   - _0.0–1.0 · Auto · "Short" after a bad Q_
3. Relevance
   - Alignment to current bets, owner-scored
   - _1–5 · Manual · What the PM already planned_
4. Reach
   - Customers or segments affected
   - _1–5 · Auto · 5 if the enterprise asked_
5. Effort
   - Engineering and design cost to act
   - _1–5 · Manual · Engineering's eyebrows go up_
6. Confidence delta
   - Change since the last scoring cycle
   - _−5 to +5 · Auto · Did anyone ask a customer_

---

<!-- _class: compare-prose -->
<!-- _footer: "Two options + connector · compare-prose" -->

## Scoring model: before and after the calibration loop

- Before Calibration
  - Equal weights — confidence, recency, and relevance each contribute 33%. Simple, and at least honest that we are basically guessing. In eighteen months no team has changed them from 33.
- After Calibration
  - Weights reflect your team's historical accuracy — except the team keeps changing, and the history is three months of data from a quarter everyone agrees was atypical. So most teams keep the 33s and call them calibrated.

The shift from equal to calibrated weights takes two retrospective cycles — 60 days from adoption, or 14 months, depending on who you ask.

---

<!-- _class: cards-grid -->
<!-- _footer: "Side-by-side cards · cards-grid" -->

## Two intake modes for different signal types

- Structured Intake
  - Clear-schema signals — NPS verbatims, support tickets, win/loss notes. Ingested and scored automatically, with zero manual handling. Produces 94% of the data and 12% of the roadmap decisions — the part of the pipeline that works, which is why no one discusses it.
- Unstructured Intake
  - No-schema signals — field notes, conference hallway talk, a board member who had thoughts at a dinner. Routed to the owner for manual classification. Produces 6% of the data and 88% of the roadmap decisions, every one of them urgent.

---

<!-- _class: list-steps timeline -->
<!-- _footer: "Horizontal timeline · timeline" -->

## How a decision moves through the framework

1. Signal Logged
   - _Owner submits to the queue, if they remember_
2. Scored
   - _Current weights — last updated in February_
3. Brief Published
   - _Lands in the weekly brief, lands in spam_
4. Decision Logged
   - _Rationale + predicted outcome. Optional in practice._
5. Retrospective
   - _Scored against a prediction that rarely exists. We improvise._

---

<!-- _class: list -->
<!-- _footer: "Card list stack · list" -->

## What the framework does not do

- Doesn't make decisions — it formalizes the one you'd have made anyway.
- Doesn't replace discovery — it routes whatever surfaces before the roadmap locks.
- Doesn't work without the Decision Log. 18 entries; ~340 decisions made.
- Doesn't guarantee alignment — the same argument, just earlier in the quarter.
- Doesn't scale below P2 — the daily 90% still lives in Slack threads from 2022.

---

<!-- _class: list -->
<!-- _footer: "Numbered list · list" -->

## Four things that must be true before you begin

1. A monthly prioritization cadence. "Whenever someone escalates loudly" doesn't count — it just gets louder.
2. Someone who owns signal collection. Which means defining a signal first. See slide 8.
3. Leadership logging rationale, not just outcomes. This slide exists because that part is hard.
4. 90 minutes a week. Budget four.

---

<!-- _class: funnel -->
<!-- _footer: "Pipeline drop-off · funnel" -->

## How a week of signals narrows to one logged decision

- Signals collected `1,840`
- Passed classification `1,180`
- Scored above threshold `420`
- Surfaced in the weekly brief `90`
- Logged as a decision `18`

---

<!-- _class: closing numbered -->
<!-- _paginate: false -->
<!-- _footer: "Section close · closing numbered" -->

`Section 01 of 05 complete`

## The framework is specified — the real question is build or buy

`Section 02 weighs four tools against four criteria — defined by the team that built one. Disclosed in a footnote.`

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: "Section opener · divider" -->

`Section 02 · The Evaluation`

## We evaluated four tools. One of them was built by the evaluation team

---

<!-- _class: list-criteria -->
<!-- _footer: "Numbered criteria · list-criteria" -->

## Four requirements every decision system must meet

- **Speed**
  - Decisions close inside their window. Six months to calibrate isn't fast. We won't dwell on that here.
- **Auditability**
  - Every decision above the threshold carries a traceable rationale — for after the launch goes badly.
- **Adoption**
  - Weekly use, or calibration never runs. We budgeted 90 minutes per PM. Actual: 11.
- **Calibration**
  - It has to improve. A static model is a spreadsheet with a dashboard nobody checks.

---

<!-- _class: verdict-grid -->
<!-- _footer: "2×2 verdict grid · verdict-grid" -->

## We evaluated four intake tools against the criteria

- Tool A · Chorus
  - [x] Speed
  - [-] Auditability
  - [x] Adoption
  - [ ] Calibration
  - Great call recording, no logging, no calibration. The sales team already uses it.
- Tool B · Productboard
  - [ ] Speed
  - [x] Auditability
  - [x] Adoption
  - [ ] Calibration
  - Solid intake, no calibration. Setup was "3–4 weeks." It took 11.
- Tool C · Notion
  - [x] Speed
  - [x] Auditability
  - [-] Adoption
  - [ ] Calibration
  - Build anything. Teams built seven, then debated the canon for two quarters.
- Tool D · Sprig + Decision Log
  - [x] Speed
  - [x] Auditability
  - [x] Adoption
  - [x] Calibration
  - Built by this evaluation's authors. Meets all four — as they defined them.

---

<!-- _class: compare-table -->
<!-- _footer: "Comparison table · compare-table" -->

## The four tools side by side

| Criterion    | Chorus | Productboard | Notion    | Sprig + Log |
| ------------ | ------ | ------------ | --------- | ----------- |
| Speed        | ✓      | ✗            | ✓         | ✓           |
| Auditability | ✗      | ✓            | ✓         | ✓           |
| Adoption     | ✓      | ✓            | ✗         | ✓           |
| Calibration  | ✗      | ✗            | ✗         | ✓           |
| Setup time   | 1 day  | 3–4 weeks    | 40+ hours | Same day    |

_Criteria defined by the team building Sprig + Log. We're transparent about it. It's in the footnote._

---

<!-- _class: radar -->
<!-- _footer: "Spider comparison · radar" -->

`Scale · 0–10, on the criteria we wrote`

## The four tools, scored across the criteria we wrote

- Chorus
  - Speed `9`
  - Auditability `2`
  - Adoption `8`
  - Calibration `1`
  - Exposes weights `1`
- Notion
  - Speed `7`
  - Auditability `8`
  - Adoption `3`
  - Calibration `2`
  - Exposes weights `2`
- Sprig + Log
  - Speed `9`
  - Auditability `9`
  - Adoption `8`
  - Calibration `9`
  - Exposes weights `10`

---

<!-- _class: matrix-2x2 -->
<!-- _footer: "Two-axis vendor sort · matrix-2x2" -->

## How we sort the four tools against our two axes

`Coverage · Cost`

- High coverage / Low cost
  - Sprig + Log — best coverage, lowest TCO. Built by the evaluation team.
  - Productboard — narrower, here to show we looked.
- High coverage / High cost
  - Notion — full coverage in theory. We tried it: seven versions, a quarterly canon debate.
- Low coverage / Low cost
  - Chorus — cheap, three criteria short. The sales team likes it.
- Low coverage / High cost
  - _None — either the signal or a gap. We're treating it as a signal._

---

<!-- _class: compare-prose decision -->
<!-- _footer: "Build vs buy, DECISION chrome · compare-prose decision" -->

## The evaluation came down to one question the vendors could not answer

- Buy a vendor framework
  - Three vendors evaluated. None expose calibration weights to the customer — the criterion that eliminated all three. It was added to the rubric after the team decided to build.
- Build the framework in-house
  - Owns the scoring policy, the calibration loop, and the timeline. The window closes in 18 months; a vendor cutover would eat nine of them — which is how we knew building was faster before the evaluation began.

The left card is struck through; the DECISION connector is bold. The conclusion came first — the slide was built to hold it.

---

<!-- _class: decision -->
<!-- _footer: "Committed decision · decision" -->

## We are building, not buying

`Decision · 2026 Q1`

- Build
  - Owns the scoring policy, the calibration loop, and the timeline — plus the maintenance, the on-call rotation, and every future explanation of why the framework scored the wrong thing.
- Why not buy
  - Three vendors, none exposing calibration weights. The weights are the product; you cannot buy the product without them. That was the finding.
- Why not delay
  - The window closes in 18 months — a sentence that has been in this deck, unchanged, since Q1 2025. Each quarter we update the deck, not the window.

---

<!-- _class: list principles -->
<!-- _footer: "Declarative principles · principles" -->

## How we make calls when the spec is silent

1. Default to the choice that's cheaper to reverse — unless reversing it needs a meeting.
2. Name the actor, never the system. The system can't be held accountable. The actor can be reorganized.
3. Write the bet on the slide with the choice. Not always where it gets reviewed.

---

<!-- _class: split-panel watermark mirror -->
<!-- _footer: "Section opener, panel right · split-panel watermark mirror" -->

## Three phases ship the architecture, the operations, and the scale — and Phase 01 has shipped

`Section 03 · The Build`

### What the build covers

Three phases, four workstreams. We own the policy, the loop, the timeline — and whatever Phase 2 becomes.

1. Phase 01 — Architecture
   - Scoring policy live, the Decision Log accepting entries, one pilot team in weekly cadence.
1. Phase 02 — Operations
   - Multi-team calibration, automated weight updates, and before-after data you could defend in a board update.
1. Phase 03 — Scale
   - Org-wide enablement. In the roadmap since 2024. We remain committed.

---

<!-- _class: roadmap -->
<!-- _footer: "Workstream × phase grid · roadmap" -->

## What ships in each phase

| Workstream    | Phase 01            | Phase 02              | Phase 03              |
| ------------- | ------------------- | --------------------- | --------------------- |
| Signal Intake | Connector v1        | Multi-source dedupe   | Anomaly auto-routing  |
| Scoring       | Equal-weights model | Per-team calibration  | Per-decision profiles |
| Decision Log  | Append-only schema  | Outcome auto-pairing  | Examiner export       |
| Adoption      | One pilot team      |                       | Org-wide enablement   |

---

<!-- _class: gantt -->
<!-- _footer: "Schedule by workstream · gantt" -->

`2026 Q1 .. 2026 Q4`

## The build schedule — Phase 3 is the big red bar, as it was last year

- Signal Intake
  - Connector v1 `Q1..Q2` `done`
  - Multi-source dedupe `Q2..Q4` `at-risk`
- Scoring
  - Equal-weights model `Q1..Q2` `done`
  - Per-team calibration `Q2..Q4` `at-risk`
- Decision Log
  - Append-only schema `Q1..Q2` `done`
  - Outcome auto-pairing `Q3..Q4` `blocked`
- Adoption
  - One pilot team `Q1..Q2` `done`
  - Org-wide enablement `Q3..Q4` `blocked`

---

<!-- _class: kanban -->
<!-- _footer: "Status board · kanban" -->

`Workstream board · today`

## The build board, mostly one column

- Backlog
  - Examiner export `M`
    - decision-log `blocked`
- In progress
  - Per-team calibration `L`
    - scoring `at-risk`
  - Outcome auto-pairing `M`
    - decision-log
  - Org-wide enablement `XL`
    - adoption `blocked`
- Shipped
  - Scoring policy v1 `M`
    - scoring

---

<!-- _class: actors -->
<!-- _footer: "Ownership roles · actors" -->

## Who owns each part of the framework lifecycle

- Signal custody `Signal owner`
  - Manages intake quality. Tunes weights only by choosing what to surface.
- Policy `Framework operator`
  - Owns scoring, cadence, rollback. One person. Noted in the risk register.
- Consumption `Product team`
  - Runs intake and logging. Mostly asks the operator to change the weights.
- Oversight `Auditor`
  - Reads the audit trail. Read it once, found 18 entries, asked if that was expected.

---

<!-- _class: list-steps phase -->
<!-- _footer: "Three-phase plan · list-steps phase" -->

## Three phases get us from decision to org-wide adoption

1. Architecture
   - Scopes what we build, what we buy, and what we defer. The output is an architecture decision record — which will itself need an architecture phase before it can be approved, and a workshop to define "decision."
2. Pilot
   - One team, one decision type, one quarter. The phase ends at production cadence — meaning the retrospective happened at least once, and someone screenshotted it for the board.
3. Rollout
   - Five teams in two months, ending above 90% adoption. Planned for Q2 — as it has been for three consecutive years. Q2 is load-bearing.

---

<!-- _class: list-steps milestone lettered -->
<!-- _footer: "Lettered milestones · list-steps milestone lettered" -->

## Three milestones mark Phase 01 complete

1. Scoring policy in production
   - The signed policy runs end-to-end and the first calibrated brief lands in leadership's inbox. Their first reply asks whether the weights can be adjusted. They can — and did, that afternoon.
2. Per-team weights
   - One framework carries distinct weights per team without forks; recalibration is a single update. Each team will still want its own, and three will fork it anyway.
3. Per-decision-class profiles
   - Authoring a profile for one decision class takes minutes. Agreeing what counts as a decision class takes a workshop series. See slide 8, which has not moved.

---

<!-- _class: checklist -->
<!-- _footer: "Phase acceptance checklist · checklist" -->

## Phase 01 acceptance — what shipped, what slipped, what stayed open

- [x] Scoring policy live across all pilot teams
- [x] Decision Log audit trail readable by Auditor role `shipped 2026-Q1`
- [x] One reference team running weekly cadence `one team`
- [-] Examiner pack auto-generation `was Phase 01 · now Phase 1b`
- [ ] Adoption above 90% `Phase 03`
- [ ] Culture change `not in roadmap`

---

<!-- _class: compare-prose transition -->
<!-- _footer: "State change over time · compare-prose transition" -->

## Decisions used to require a quarterly re-litigation

`Before and after the framework`

- Before
  - First principles every time. Close: 4 hours, p99 an offsite. Outcome: what the senior person wanted, called consensus.
- After
  - Resolved against logged weights. Close: 18 minutes. Outcome: what the model says — once the weights match the senior person.

The architecture change is the calibration loop. The culture change is still in Phase 02.

---

<!-- _class: list-steps -->
<!-- _footer: "Horizontal rollout steps · list-steps" -->

## How to roll this out across your organization

1. Pick one team and one decision type
   - Start with a team that has a real rhythm. No rhythm, no framework.
2. Log everything, decide nothing differently
   - Just log, for a month. "Low-effort." Highest dropout rate.
3. Run your first retrospective
   - Day 30, score against outcomes. No outcomes? Score the room, call it "qualitative."
4. Expand to a second team
   - Your evidence: one team ran one retrospective. Use it confidently.

---

<!-- _class: list-steps vertical compact -->
<!-- _footer: "Vertical process steps · list-steps vertical compact" -->

## The weekly practice in three moves

1. Sense
   - Observed inputs, never invented. Skipped about 70% of the time.
2. Score
   - A signal is data once it carries a number. Calibrating it takes 14 months.
3. Decide
   - A signal plus a deadline. The loop closes if anyone logged a prediction.

---

<!-- _class: cards-stack horizontal -->
<!-- _footer: "Horizontal evidence stack · cards-stack horizontal" -->

## The case for the framework in three moves

- Claim
  - Calibrated prioritization with audit-grade decision custody. We stop paying the re-litigation cost on every quarterly review.
- Evidence
  - Six months across four product teams. Close-time dropped; calibration ran once. The four teams have since been reorganized into three. None of them count in the "before" baseline.
- Implication
  - The framework works. The deck says so. The deck was written by the framework team. We trust the framework team — the framework told us to.

---

<!-- _class: code -->
<!-- _footer: "Single code block · code" -->

`Implementation · Decision Pipeline`

## Wiring a signal into the framework is three lines of application code

`JavaScript · DecisionFramework SDK v2 · 847 transitive dependencies`

```javascript
import { DecisionFramework } from "@company/signal-sdk";

const framework = new DecisionFramework({ configFile: "./framework.config.json" });

// Score a signal at intake
const score = await framework.score(signal, { dimensions: ["confidence", "recency", "relevance"] });

// Log every decision — calibration depends on it
// (nobody calls this line in production, but it is here)
const entry = await framework.decisions.log(decision, { signals: [signal.id], rationale });
```

---

<!-- _class: compare-code -->
<!-- _footer: "Two code blocks · compare-code" -->

`Before & After · Scoring Mechanics`

## Spreadsheet-driven scoring versus framework-driven scoring that is basically also a spreadsheet

`Before · The Honest Spreadsheet`

```python
# Manual scoring. Auditable in the
# sense that you can see who last
# edited the file
import pandas as pd

signals = pd.read_csv('./signals.csv')
signals['score'] = signals.apply(
    lambda r: 0.33*r.confidence + 0.33*r.recency + 0.33*r.relevance,
    axis=1,
)
signals.to_csv('./scored.csv')
```

`After · The Framework`

```python
# Calibrated weights, signed policy,
# every score is audit-logged,
# same math as the spreadsheet
from decision_framework import Calibrator

calibrator = Calibrator.load('./policy.json')
for signal in calibrator.intake.unscored():
    calibrator.score(signal)
    calibrator.decisions.log_if_relevant(signal)
```

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _footer: "Section close · closing" -->

`Section 03 of 05 complete`

## The framework is built. Twelve percent of eligible PMs use it

`Section 04 presents six months of production data. The denominator is carefully chosen.`

---

<!-- _class: divider dark -->
<!-- _paginate: false -->
<!-- _footer: "Section opener, dark canvas · divider dark" -->

`Section 04 · The Results`

## Six months of data. Eighteen logged decisions. One calibration cycle

The pilot team measured what the pilot team built.

---

<!-- _class: list takeaway numbered -->
<!-- _footer: "Section recap before the data · list takeaway numbered" -->

`Recap · Sections 01 through 03`

## Before the results, what you should have learned in the first 47 slides

- Four components. Two used regularly. → Section 01
- The evaluation team recommended the tool the evaluation team built. → Section 02
- Phase 01 shipped. Phase 03 in the roadmap since 2024. → Section 03
- Adoption is 12%. Target 90%. The gap is "cultural." → this section
- The calibration loop has run once. We call it "calibrated." → this section

---

<!-- _class: kpi target -->
<!-- _footer: "KPIs against targets · kpi target" -->

## Where we are against quarter targets

1. 94%
   - Signal-classification success
   - target 99%, gap is "known issue"
2. 18 min
   - p99 decision close
   - target 20 min, beating target
3. 18
   - Decisions logged
   - target 340, gap is "cultural"
4. 1
   - Calibration cycles run
   - target 6, gap is "structural"

---

<!-- _class: progress -->
<!-- _footer: "Horizontal bars with status pills · progress" -->

`H1 2026 · Phase 01 readiness`

## Phase 01 readiness, by workstream

The status pills reflect the most optimistic reading of the data.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Decision Log `81%` `on-track`
- Calibration cadence `34%` `deferred`
- Adoption `12%` `blocked`

Source: Linear · "blocked" means blocked, we are working on the wording

---

<!-- _class: piechart donut -->
<!-- _footer: "SVG donut with legend · piechart donut" -->

`H1 2026 · 1,840 person-hours`

## Where the engineering quarter went

The "Toil and on-call" wedge is the one nobody put in the roadmap.

- Signal Intake build `46%`
- Scoring policy work `22%`
- Decision Log integration `18%`
- Explaining the framework to stakeholders `9%`
- Toil and on-call `5%`

Last updated 2026-05-07 · the 9% is probably higher

---

<!-- _class: timeline-list -->
<!-- _footer: "Horizontal timeline spine · timeline-list" -->

`Framework arc`

## How the framework reached production

Four stages over eighteen months. The connective tissue is called "momentum."

1. `2024 Q3` Pre-framework prioritization
   - Decisions in meetings. Close: 4 hours. No trail. We called it "being agile."
2. `2025 Q1` Framework proposal `decision`
   - Architecture review approves the build — and is the build team.
3. `2025 Q3` Pilot `pilot`
   - One team, one quarter. 18 logged, 340 made.
4. `2026 Q1` Production `live`
   - Policy live. 12% adoption. Phase 02 planned for Q2.

---

<!-- _class: cards-grid -->
<!-- _footer: "Finding + key insight · cards-grid" -->

`Finding 01 · Structured Intake`

## Structured intake performed above expectations — volume and latency were not the problems we thought

- What worked
  - API connectors handled 94% of structured signals with no manual touch, at 4-minute average latency. This is the part of the demo we show everyone.
- What required tuning
  - NPS verbatim classification ran an 18% error rate for the first two weeks. It's mentioned in the appendix, not in the headline numbers.

> Viable as designed. The headline numbers are accurate. The denominator is carefully chosen.

---

<!-- _class: cards-stack compact -->
<!-- _footer: "3 full-width cards · cards-stack compact" -->

## Three scoring failure modes found in the pilot

1. Recency dominance
   - Recency set above 50% — last week felt more real than six months of NPS. Capped at 40%, until a VP overrides it.
2. Source concentration
   - One customer was 34% of intake. Also 31% of revenue, so the diversity floor waited for renewal.
3. Outcome misclassification
   - "Improve retention" won't score. "Make customers happier" was submitted twelve times, scored 5 each.

---

<!-- _class: quadrant -->
<!-- _footer: "Two-axis scatter · quadrant" -->

`Confidence 0–10 → Impact 0–10`

## Where the 18 logged decisions landed

- After the fact
  - Reprioritized the roadmap `2, 7`
  - Picked the vendor `1, 6`
  - Killed the connector rewrite `4, 8`
- Predicted
  - Cut the onboarding step `7, 7`
  - Renamed the tier labels `8, 8`
- Calibrated
  - Adjusted recency weight `3, 2`

---

<!-- _class: word-cloud -->
<!-- _footer: "Weighted terms · word-cloud" -->

## The reasons logged for not adopting the framework

- cultural `18`
- bandwidth `11`
- "next quarter" `9`
- didn't know `7`
- training `5`
- the poster `3`

---

<!-- _class: journey -->
<!-- _footer: "Emotional journey · journey" -->

## A product manager's first month with the framework

- Week 1
  - Onboarding `@pm` `:4`
  - First weekly brief `@pm` `:3`
- Week 2
  - Logging a decision `@pm` `:2`
- Week 3
  - The 2σ alert `@pm` `:1`
- Week 4
  - Retrospective `@team` `:2`

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _footer: "Final ask · closing" -->

`What Would Help Us Move Forward`

## Next step is a working session, not a debate

`Walk these questions with me in 60–90 minutes. The output is a design we can execute — or agreement that we need another session to design it.`

<!-- Import Mermaid and the Lattice runtime theme for VS Code / web preview.
     The build script (lattice-emulator.js) pre-renders Mermaid to SVG at build time
     so these scripts are a no-op in the PDF/HTML output. -->
<!-- markdownlint-disable MD033 -->
<script src="../mermaid-v11.min.js"></script>
<script src="../dist/lattice-runtime.js"></script>
