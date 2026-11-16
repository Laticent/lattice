---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · status triplets"
footer: "Each theme curates its status fill, ink and edge"
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Every theme now owns its status colors.

`Status triplets · 2026-11-16`

*Deep on the light face, glowing on the dark one, so a status still reads from the back row of a lit hall.*

---

<!-- _class: progress -->

`H1 2026 · Phase 1 readiness`

## Phase 1 readiness varies by workstream.

- Signal Intake `92%` `on-track`
- Scoring policy `68%` `at-risk`
- Adoption `12%` `blocked`
- Pilot cohort `40%` `pilot`
- Calibration cadence `34%` `deferred`

---

<!-- _class: checklist -->

## The go-live checklist is honest about the gaps.

- [x] Signal taxonomy ratified
- [x] Decision log live in staging
- [-] Pilot teams trained, two still circling back
- [!] Exec sponsor declined the launch comms
- [ ] Per-team weighting UI scoped

---

<!-- _class: kpi ops -->

## Two services slip; two hold their targets.

1. 99.2%
   - API uptime
   - SLO 99.9% `{At risk}`
2. 180ms
   - p95 latency
   - SLO 250ms `{On plan}`
3. 4.1%
   - Error rate
   - SLO 1% `{Slipping}`
4. 12min
   - Mean recovery
   - SLO 30min `{On plan}`

---

<!-- _class: gantt -->

`[{Timeline, 2026 Q1 .. 2026 Q4}]`

## Four workstreams carry the rollout across the year.

- Intake
  - Connector wiring `Q1..Q1` `done`
  - CSV retirement `Q3..Q4` `at-risk`
- Scoring
  - Calibrated weights `Q2..Q3` `on-track`
  - Policy v2 `Q4` `milestone`
- Decision Log
  - Pilot log `Q1..Q2` `done`
  - Org-wide log `Q3..Q4` `blocked`
- Enablement
  - Team onboarding `Q2..Q3` `pilot`

---

<!-- _class: roadmap -->

## What ships in each phase, by workstream.

| Workstream    | Phase 01                | Phase 02                 | Phase 03                  |
| ------------- | ----------------------- | ------------------------ | ------------------------- |
| Signal Intake | [x] Connector v1        | [x] Multi-source dedupe  | [-] Anomaly auto-routing  |
| Scoring       | [x] Equal-weights model | [-] Per-team calibration | [ ] Per-decision profiles |
| Decision Log  | [x] Append-only schema  | [!] Outcome auto-pairing | [ ] Examiner export       |

---

<!-- _class: risk-matrix -->

`Enterprise risk register · Q4 2026`

## Cyber and hurricane risk sit in the red; both have a plan.

- Cyber outage `{4, 5}` `{2, 4}`
- Hurricane season `{3, 5}` `{3, 3}`
- Reserve shortfall `{3, 4}`
- FX swing `{4, 2}`
- Key person loss `{2, 3}`
- Pandemic `{1, 5}`

---

<!-- _class: state-chart lr -->

`Decision lifecycle`

## How a call moves through the log.

- Logged `start`
  - -score-> Scored
- Scored `on-track`
  - -review-> In Review
- In Review `at-risk`
  - -approve-> Decided
  - -reject-> Logged
- Decided `decision`
  - -calibrate-> Calibrated
- Calibrated `end`

---

<!-- _class: policy-recommendation amend -->

## Amend SB 88 to require bias audits before deployment, not after.

- Pre-deployment testing is the only preventive control
  - Audits after launch cannot un-reject filtered candidates `{EEOC 2025}`.
- The change is narrow and drafted
  - It moves one clause from § 4(b) to § 3; no new agency `{Leg. counsel memo}`.
- Vendors can meet it today
  - Three of five ATS vendors ship pre-deployment reports `{vendor survey}`.

> Move the § 4(b) audit trigger to § 3 in the committee substitute before markup.

---

<!-- _class: kanban -->

`Board · Phase 2 rollout`

## Six cards, six statuses: each pill stands off its own card.

- Backlog
  - Vendor review `S`
    - legal `blocked`
  - Pricing page `M`
    - growth `deferred`
- In progress
  - Signal intake `M`
    - platform `at-risk`
  - Scoring model `L`
    - data `on-track`
- Review
  - Decision log `S`
    - platform `pilot`
- Done
  - Calibration `S`
    - data `done`
