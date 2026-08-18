<!-- _class: divider -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Section break · divider" -->

`Section 01 · Foundations`

## The landscape has shifted. Here is what that means for us.

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

<!-- _class: roadmap -->
<!-- _footer: "New layout — roadmap · roadmap" -->

## What ships in each phase, by workstream.

| Workstream    | Phase 01            | Phase 02             | Phase 03              |
| ------------- | ------------------- | -------------------- | --------------------- |
| Signal Intake | Connector v1        | Multi-source dedupe  | Anomaly auto-routing  |
| Scoring       | Equal-weights model | Per-team calibration | Per-decision profiles |
| Decision Log  | Append-only schema  | Outcome auto-pairing | Examiner export       |
| Adoption      | One pilot team      |                      | Org-wide enablement   |

---

<!-- _class: list takeaway -->
<!-- _footer: "List variant — list takeaway · list takeaway numbered" -->

`Section 03 · Recap`

## What this section will tell you, in five lines.

- The framework buys calibrated prioritization with audit-grade decision custody. → slide 8
- Recalibration is a version-floor increment, not a coordinated freeze, not a war room. → slide 12
- Per-team weights make recalibration a single policy update. → slide 18
- Phase 1 ships the architecture, Phase 2 ships the operations, Phase 3 ships the apology. → slide 22
- Five questions stay open until Phase 1 is forced to close them on the record. → slide 27

---

<!-- _class: gantt -->
<!-- _footer: "Chart — gantt · gantt" -->

`2026 Q1 .. 2026 Q4`

## Four workstreams carry the rollout across the year

- Intake
  - Connector wiring `Q1..Q1` `done`
  - Source-system sweep `Q2..Q2` `done`
  - CSV retirement `Q3..Q4`
- Scoring
  - Policy v1 freeze `Q1..Q1` `done`
  - Calibrated weights `Q2..Q3` `live`
  - Policy v2 `Q4` `milestone`
- Decision Log
  - Pilot log `Q1..Q2` `done`
  - Org-wide log `Q3..Q4`
- Enablement
  - Team onboarding `Q2..Q3` `live`
  - Operating rhythm `Q3..Q4`

---

<!-- _class: kanban -->
<!-- _footer: "Chart — kanban · kanban" -->

`Board · Phase 2 rollout`

## The Phase 2 board is honest, for once

- Backlog
  - Exec dashboard, unrequested
  - Per-team weighting UI, descoped again
- In progress
  - Team onboarding, wave two `in-progress`
  - CRM connector `in-progress`
- Review
  - Scoring policy v2 draft `review`
- Done
  - Pilot retro pack `done`
  - Rhythm sign-off `done`

---

<!-- _class: piechart -->
<!-- _footer: "Chart — piechart · piechart" -->

`H1 2026 · 1,840 person-hours`

## Where the planning quarter actually went.

Nearly half went to producing decks; the deciding itself was the smallest slice.

- Deck production `46%`
  - 92 decks, averaging 18 slides each
- Meetings about meetings `22%`
- Realigning on priorities `18%`
- Stakeholder management `9%`
- Actually deciding `5%`

---

<!-- _class: checklist -->
<!-- _footer: "Ops — checklist · checklist" -->

## The go-live checklist is honest about the gaps.

- [x] Signal taxonomy ratified, in workshop four of three
- [x] Scoring weights agreed by the steering committee
- [x] Decision log live in staging
- [-] Pilot teams trained, two still "circling back"
- [-] Operating rhythm on the calendar, attendance optional in practice
- [ ] Exec sponsor confirmed for the launch comms
- [/] Per-team weighting UI, descoped to next half

---

<!-- _class: closing accent -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Modifier — accent · closing accent" -->

`Signal To Strategy · The End`

## The deck ends on one color, chosen on purpose.

Every other page wears the full spectrum on its top edge — the mark of belonging to a wider deck. The last page wears one color, because one thing got decided.

Slide 117, for the record: decision logged, retrospective booked, attendance aspirational.

<!-- Import Mermaid and the Lattice runtime theme for VS Code / web preview.
     The build script (lattice-emulator.js) pre-renders Mermaid to SVG at build time
     so these scripts are a no-op in the PDF/HTML output. -->
<!-- markdownlint-disable MD033 -->
<script src="../node_modules/mermaid/dist/mermaid.min.js"></script>
<script src="../dist/lattice-runtime.js"></script>
