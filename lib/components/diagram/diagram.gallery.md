<!-- galleryAuthored: curated Mermaid tour with chart-synergy handoff; tools/build-bucket-galleries.js reads this .md verbatim and will not overwrite it -->
<!-- _class: title silent -->

# Diagrams

`Graph substance · fourteen Mermaid types`

When the relationship between things is the message — flow, structure, hierarchy, cause. These are the shapes only a graph renderer draws; anything quantitative has a native chart, and this deck says which.

---

<!-- _class: split-panel -->
<!-- _footer: "orientation · diagram survey" -->

`How to read this deck`

## Relationships, not quantities.

One product told two ways: the chart family plots its data, this deck maps its structure — the same Decision Framework, seen as a graph.

- Reach for a diagram when the edges carry meaning
  - A flowchart's arrows, an ER diagram's cardinality — the connections are the content, not decoration.
- Let the diagram own at least half the slide
  - If the heading dominates and the graph is a sidebar, it is a prose slide with a picture.
- The palette drives every stroke automatically
  - Mermaid pre-renders to SVG with theme tokens injected — dark and accent variants come free.
- Quantitative shapes defer to charts
  - Plans, proportions, positions, boards, and state machines each have a native chart — the last slide maps them.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: '' -->

`Group 01 · Flow & sequence`

## How work moves through the system.

---

<!-- _class: diagram -->
<!-- _footer: "flowchart · diagram survey" -->

`Flow & sequence · Flowchart`

## How a raw signal becomes a logged decision.

```mermaid
flowchart LR
  A{{"Raw signals"}} --> B["Classify"]
  B --> C(["Score & weight"])
  C --> D["Decision log"]
  D --> E["Calibration"]
  E -.->|"tune weights"| C
```

---

<!-- _class: diagram -->
<!-- _footer: "sequence · diagram survey" -->

`Flow & sequence · Sequence`

## The score-and-decide handshake, actor by actor.

```mermaid
sequenceDiagram
  participant App
  participant SDK
  participant Weights
  participant Log
  App->>SDK: score(signal)
  SDK->>Weights: load team weights
  Weights-->>SDK: calibrated weights
  SDK-->>App: score
  App->>Log: decide & record
  Note over Log: append-only, audit-safe
```

---

<!-- _class: diagram -->
<!-- _footer: "sankey · diagram survey" -->

`Flow & sequence · Sankey`

## Where a thousand signals actually end up.

```mermaid
sankey-beta
Raw signals,Classified,1000
Classified,Scored,820
Classified,Discarded,180
Scored,Auto-decided,540
Scored,Escalated,280
Auto-decided,Decision log,540
Escalated,Decision log,280
```

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: '' -->

`Group 02 · Structure & schema`

## The shape of the data and the code.

---

<!-- _class: diagram -->
<!-- _footer: "class · diagram survey" -->

`Structure & schema · Class`

## The scoring engine as an object model.

```mermaid
classDiagram
  class ScoringEngine {
    -TeamWeights weights
    -Calibrator calibrator
    +score(Signal) Score
    +decide(Score, Policy) Outcome
  }
  class TeamWeights {
    +String teamId
    +int version
    +recalibrate() void
  }
  class Calibrator {
    +tune(Outcome[]) TeamWeights
  }
  ScoringEngine *-- TeamWeights
  ScoringEngine o-- Calibrator
```

---

<!-- _class: diagram -->
<!-- _footer: "entity-relationship · diagram survey" -->

`Structure & schema · Entity relationship`

## The decision log, table by table.

```mermaid
erDiagram
  TEAM ||--o{ SIGNAL : "emits"
  SIGNAL ||--|| SCORE : "scored as"
  SCORE ||--o{ DECISION : "resolves to"
  TEAM {
    string teamId PK
    string name
  }
  SIGNAL {
    string signalId PK
    string teamId FK
    timestamp seenAt
  }
  SCORE {
    string signalId FK
    float value
    int weightVersion
  }
  DECISION {
    string decisionId PK
    string signalId FK
    string outcome
  }
```

---

<!-- _class: diagram -->
<!-- _footer: "requirement · diagram survey" -->

`Structure & schema · Requirement`

## What the audit demands, traced to what satisfies it.

```mermaid
requirementDiagram
  requirement traceable_decision {
    id: 1
    text: "Every decision traces to its scored signals"
    risk: high
    verifymethod: inspection
  }
  requirement append_only_log {
    id: 2
    text: "Scores are written to an append-only log"
    risk: high
    verifymethod: test
  }
  element decision_log {
    type: service
  }
  decision_log - satisfies -> traceable_decision
  decision_log - satisfies -> append_only_log
```

---

<!-- _class: diagram -->
<!-- _footer: "packet · diagram survey" -->

`Structure & schema · Packet`

## One decision-log record, field by bit.

```mermaid
packet-beta
title Decision-log record
0-15: "Team ID"
16-31: "Signal ID"
32-39: "Weight version"
40-47: "Outcome"
48-63: "Reserved"
64-95: "Timestamp"
```

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: '' -->

`Group 03 · Hierarchy & systems`

## Wholes broken into parts, and parts wired together.

---

<!-- _class: diagram -->
<!-- _footer: "mindmap · diagram survey" -->

`Hierarchy & systems · Mindmap`

## The whole framework, decomposed on one canvas.

```mermaid
mindmap
  root((Decision Framework))
    Scoring
      Signal taxonomy
      Team weights
      Calibration loop
    Decisions
      Auto-decide
      Escalate
      Append-only log
    Adoption
      Pilot teams
      Org-wide rollout
      Auditor exports
```

---

<!-- _class: diagram -->
<!-- _footer: "tree · diagram survey" -->

`Hierarchy & systems · Tree`

## The SDK repository, folder by folder.

```mermaid
treeView-beta
    "sdk/"
        "score.ts"
        "weights/"
            "load.ts"
            "calibrate.ts"
        "decide.ts"
    "package.json"
```

---

<!-- _class: diagram -->
<!-- _footer: "architecture · diagram survey" -->

`Hierarchy & systems · Architecture`

## The same system, as deployed services.

```mermaid
architecture-beta
  group platform(cloud)[Decision Framework]
  service intake(internet)[Signal intake] in platform
  service engine(server)[Scoring engine] in platform
  service log(database)[Decision log] in platform
  service weights(disk)[Weight store] in platform
  intake:R -- L:engine
  engine:R -- L:log
  engine:B -- T:weights
```

---

<!-- _class: diagram -->
<!-- _footer: "c4 context · diagram survey" -->

`Hierarchy & systems · C4 context`

## Who touches the framework, and how.

```mermaid
C4Context
  Person(pm, "Product team", "Emits signals, reads decisions")
  Person(auditor, "Auditor", "Reviews the decision log")
  System(framework, "Decision Framework", "Scores signals, records decisions")
  System_Ext(warehouse, "Data warehouse", "Source of raw signals")
  Rel(pm, framework, "Sends signals to")
  Rel(framework, warehouse, "Pulls signals from")
  Rel(auditor, framework, "Audits")
```

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: '' -->

`Group 04 · Cause, set & history`

## Why something happened, what overlaps, and what shipped.

---

<!-- _class: diagram -->
<!-- _footer: "ishikawa · diagram survey" -->

`Cause, set & history · Ishikawa`

## Why per-team weighting stalled — the fishbone.

```mermaid
ishikawa-beta
    Per-team weighting contested
    People:
        Two teams disagree on priors
        Thin calibration review
    Process:
        Manual recalibration
        No agreed cutover gate
    Data:
        Sparse history for new teams
        Taxonomy still shifting
    Tooling:
        Weight rollback unaudited
```

---

<!-- _class: diagram -->
<!-- _footer: "venn · diagram survey" -->

`Cause, set & history · Venn`

## Where the pilot audiences overlap.

```mermaid
venn-beta
  set A["Pilot teams"]
  set B["Eligible PMs"]
  set C["Signal sources"]
  union A, B
  union A, C
```

---

<!-- _class: diagram -->
<!-- _footer: "gitgraph · diagram survey" -->

`Cause, set & history · Git graph`

## How the scoring model reached v2.1.

```mermaid
gitGraph
  commit id: "v1 scoring"
  branch scoring-v2
  commit id: "reweight"
  commit id: "calibration loop"
  checkout main
  merge scoring-v2 tag: "v2.0"
  branch per-team
  commit id: "team priors"
  checkout main
  merge per-team tag: "v2.1"
```

---

<!-- _class: compare-table -->
<!-- _footer: "synergy · prefer the native component" -->

`The chart handoff`

## When the shape is quantitative, use a native chart.

These shapes exist as both a Mermaid diagram and a native SVG-kernel component. Prefer the native one — it is themeable through tokens, lighter (no external renderer), and export-clean.

| When you have… | Mermaid would draw | Prefer this native component |
| --- | --- | --- |
| A dated plan or sequence of moments | gantt, timeline, journey | `gantt` · `timeline-list` · `roadmap` · `journey` |
| A proportion or a position on axes | pie, quadrant, radar | `piechart` · `quadrant` · `radar` |
| A board or a state machine | kanban, stateDiagram | `kanban` · `state-chart` |

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _footer: '' -->

`Diagrams · graph substance`

## Reach for a diagram when the graph is the slide.

*Fourteen relational shapes, one palette, one product. For plotted data — proportions, positions, dated plans, boards — the native chart family renders it lighter and fully themeable.*
