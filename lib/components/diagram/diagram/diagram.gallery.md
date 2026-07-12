---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · diagram"
footer: "Mermaid 11.14 · rendered through the diagram component"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _footer: '' -->
<!-- _header: '' -->

# Every Mermaid diagram, one slide each.

`Mermaid 11.14 · Lattice Theme`

*A reference gallery of the 26 diagram types Mermaid supports, rendered with the Lattice palette so you can see what each one looks like in production.*

---

<!-- _class: split-panel watermark -->

## How this gallery is organised.

`Orientation · How to use this deck`

### Three groups, twenty-six diagrams

Stable diagrams render with full theme control. Experimental ones marked 🔥 may evolve in syntax and have limited theming surfaces.

- **15**
  - **Stable**
  - Flowchart, sequence, class, state, ER, journey, gantt, pie, quadrant, requirement, gitgraph, c4, mindmap, timeline, zenuml.
- **11**
  - **Experimental 🔥**
  - Sankey, xy chart, block, packet, kanban, architecture, radar, treemap, venn, ishikawa, treeView.
- **6**
  - **Themeable**
  - Flowchart, sequence, pie, state, class, journey have named themeVariables. Everything else inherits from the core six.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: '' -->

`Group 01 · Stable diagrams`

## The fifteen well-supported types.

---

<!-- _class: diagram -->

`01 · Flowchart`

## Boxes and arrows. The most-used diagram type.

```mermaid
---
title: Signal pipeline
---
flowchart LR
  A{{"Signal Intake"}} --> B(["Scoring Model"])
  B -->|"scored signal"| C["Decision Log"]
  C -->|"decide / close"| D[("Outcome Store")]
  B -.->|"recalibration"| C
```

> Full theme support — node fills, borders, edge colors, cluster fills, edge labels all controllable via themeVariables.

---

<!-- _class: diagram -->

`02 · Sequence Diagram`

## Actors and signals over time.

```mermaid
---
title: Score-and-decide sequence
---
sequenceDiagram
  participant App
  participant SDK
  participant Store
  App->>SDK: score(signal)
  SDK->>SDK: apply weights
  SDK->>Store: load team weights
  Store-->>SDK: calibrated weights
  SDK-->>App: a score
  Note over SDK: decision logged on close
```

> Full theme support — actor backgrounds, signal colors, activation bars, note styling all themeable.

---

<!-- _class: diagram -->

`03 · Class Diagram`

## UML classes with attributes, methods, and inheritance.

```mermaid
---
title: Decision framework class model
---
classDiagram
  class DecisionFramework {
    -ScoringPolicy policy
    -TeamWeights weights
    +score(field, signal) Score
    +decide(field, score, criteria) Outcome
  }
  class ScoringPolicy {
    +String teamId
    +int version
    +verify() boolean
  }
  class TeamWeights {
    -float[] weights
    +recalibrate() void
  }
  DecisionFramework *-- ScoringPolicy
  DecisionFramework *-- TeamWeights
```

> Themeable — `classText` controls label color; node fills inherit from `primaryColor`.

---

<!-- _class: diagram -->

`04 · State Diagram`

## A finite state machine.

```mermaid
---
title: Approval state machine
---
stateDiagram-v2
  [*] --> Draft
  Draft --> Submitted: submit
  Submitted --> Approved: approve
  Submitted --> Rejected: reject
  Approved --> [*]
  Rejected --> Draft: revise
  Rejected --> [*]: withdraw
```

> Themeable — `labelColor` and `altBackground` for composite states. State fills inherit from primary.

---

<!-- _class: diagram -->

`05 · Entity Relationship Diagram`

## Database tables and their relationships.

```mermaid
---
title: Team scoring-policy schema
---
erDiagram
  TEAM ||--o{ SCORING_POLICY : "issues"
  SCORING_POLICY ||--|{ WEIGHT_VERSION : "carries"
  SCORING_POLICY ||--o{ DECISION_ENTRY : "emits"
  TEAM {
    string teamId PK
    string name
    timestamp createdAt
  }
  SCORING_POLICY {
    string policyId PK
    string teamId FK
    int version
  }
  WEIGHT_VERSION {
    int version PK
    bytes calibratedWeights
    timestamp expiresAt
  }
```

> No named themeVariables — inherits border / text / fill from core variables.

---

<!-- _class: diagram -->

`06 · User Journey`

## Steps and the emotional state at each one.

```mermaid
journey
  title Decision Framework Adoption
  section Discovery
    Read framework doc: 4: Product, Operator
    Talk to framework operator: 5: Product, Operator
  section Integration
    Add signal-sdk dependency: 4: Product
    Wire intake connectors: 2: Product
    First scored signal: 5: Product
  section Production
    Pass audit review: 3: Product, Auditor
    Run weekly cadence: 5: Product
```

> Themeable — eight `fillType0..7` variables for the section coloring.

---

<!-- _class: diagram -->

`07 · Gantt`

## Tasks across a timeline, with dependencies.

```mermaid
gantt
  title Decision Framework Phase 01
  dateFormat YYYY-MM-DD
  section Foundation
    Decision Log schema   :done,   reg,   2025-01-06, 14d
    Scoring model MVP     :active, cp,    after reg, 21d
    SDK skeleton          :        sdk,   after reg, 21d
  section Integration
    First team onboarding :        int1,  after cp, 14d
    Intake pipeline       :        audit, after int1, 10d
  section Cutover
    Production cadence    :crit,   roll,  after audit, 7d
```

> Lots of dedicated themeVariables — task bar, active task, done task, critical, today line all separately controllable.

---

<!-- _class: diagram -->

`08 · Pie Chart`

## Proportions of a whole.

```mermaid
pie showData
  title Decision-log events by source
  "Signal scored" : 12500
  "Decisions logged" : 4200
  "Recalibrations" : 180
  "Weight changes" : 95
  "Outcome paired" : 60
```

> Most theme-rich diagram — twelve `pie1..12` slot colors plus title, section, legend, stroke variables.

---

<!-- _class: diagram -->

`09 · Quadrant Chart`

## Two-axis priority scatter.

```mermaid
quadrantChart
  title Reach vs effort
  x-axis Low Effort --> High Effort
  y-axis Low Reach --> High Reach
  quadrant-1 Strategic Bets
  quadrant-2 Quick Wins
  quadrant-3 Defer
  quadrant-4 Time Sinks
  Signal dedupe: [0.3, 0.7]
  Per-team calibration: [0.7, 0.85]
  Per-decision profiles: [0.8, 0.4]
  Anomaly routing: [0.4, 0.55]
  Manual recalibration: [0.2, 0.2]
```

> Themeable — four quadrant fills and text colors, axis labels, point fill all controllable.

---

<!-- _class: diagram -->

`10 · Requirement Diagram`

## SysML-style requirements with traceability.

```mermaid
---
title: Decision custody requirements
---
requirementDiagram
  requirement traceable_decision {
    id: 1
    text: "Every decision must trace to its scored signals"
    risk: high
    verifymethod: inspection
  }
  requirement audit_trail {
    id: 2
    text: "Every score logged in the append-only Decision Log"
    risk: high
    verifymethod: test
  }
  element decision_log {
    type: hardware
  }
  element calibration_loop {
    type: service
  }
  decision_log - satisfies -> traceable_decision
  decision_log - satisfies -> audit_trail
  calibration_loop - traces -> audit_trail
```

> Inherits from core variables. No diagram-specific theme keys.

---

<!-- _class: diagram -->

`11 · GitGraph`

## Branching, merging, tags.

```mermaid
---
title: Release branch history
---
gitGraph
  commit id: "inita"
  commit id: "add SDK"
  branch feature/per-team
  checkout feature/per-team
  commit id: "weights model"
  commit id: "weights tests"
  checkout main
  merge feature/per-team tag: "v1.1"
  branch hotfix/decision-log
  commit id: "log fix"
  checkout main
  merge hotfix/decision-log tag: "v1.1.1"
  commit id: "phase 2"
```

---

<!-- _class: diagram -->

`12 · C4 Diagram`

## Software architecture at four zoom levels.

```mermaid
C4Context
  Person(eng, "Engineer", "Builds SDK")
  Person(ops, "Framework operator", "Owns policy")
  System(platform, "Framework", "SDK + calibration loop")
  System_Ext(reg, "Decision Log", "Holds logged decisions")
  System_Ext(app, "Product team", "Calls SDK")
  Rel(eng, app, "Builds")
  Rel(app, platform, "Scores")
  Rel(ops, platform, "Manages")
  Rel(platform, reg, "Logs decisions")
```

> Marked 🦺⚠️ in the docs — supported but the team flags it as work-in-progress. Theme support partial.

---

<!-- _class: diagram -->

`13 · Mindmap`

## Hierarchical brainstorm.

```mermaid
mindmap
  root((Decision Framework))
    Scoring
      Scoring policy
        Decision Log
        Append-only
      Team weights
        Calibrated
        Per-team
    Operations
      Score
      Decide
      Recalibrate
    Audit
      Decision Log stream
      Calibration loop
      SDK local
    Adoption
      Pilot team
      Org-wide
      Eligible PMs
```

> Inherits from core. Multiple shape syntaxes: `((round))`, `[square]`, `(rounded)`, `))cloud((`, `)hex(`.

---

<!-- _class: diagram -->

`14 · Timeline`

## Events on a horizontal axis.

```mermaid
timeline
  title Decision Framework Roadmap
  section Phase 01 · Core
    Q1 : Scoring-policy model
       : Weight versioning
       : Decision-Log-anchored policy
    Q2 : Signed distribution
       : Version-floor recalibration
  section Phase 02 · Scale
    Q3 : Per-team calibration
       : Per-decision-class profiles
       : Intake pipeline
    Q4 : Historical migration
       : Automated recalibration
  section Phase 03 · Adoption
    Q1+1 : Org-wide enablement
         : Auditor exports
```

> Inherits from core. The section coloring uses the `cScale` palette.

---

<!-- _class: diagram -->

`15 · ZenUML`

## A simpler sequence-diagram dialect.

ZenUML is a Mermaid diagram type that emits HTML+SVG with Tailwind CSS classes for styling. The Mermaid CLI can produce the markup, but it does not bundle the @zenuml/core stylesheet — so static SVG export renders the structure without the visual styling. ZenUML works in browser contexts where the Tailwind utilities resolve.

For static-PDF pipelines like this one, prefer the standard `sequenceDiagram` (slide 5) — same conceptual model, fully supported by the Mermaid CLI, themable through `themeVariables`.

```text
zenuml
  title Order
  Customer->Order.create() {
    Order->Inventory.check() {
      return available
    }
    return confirmed
  }
```

> ZenUML uses HTML/Tailwind rendering rather than pure SVG. Use sequenceDiagram for static export contexts.

---

<!-- _class: divider -->
<!-- _paginate: false -->
<!-- _footer: '' -->

`Group 02 · Experimental diagrams`

## The eleven new types marked 🔥.

---

<!-- _class: diagram -->

`16 · Sankey 🔥`

## Flow volumes between nodes.

```mermaid
sankey-beta
Wages,Disposable income,750
Disposable income,Savings,150
Disposable income,Spending,600
Spending,Housing,250
Spending,Food,200
Spending,Other,150
```

> CSV-style input. Theme inheritance only — link colors are computed from node colors via the `linkColor` config.

---

<!-- _class: diagram -->

`17 · XY Chart 🔥`

## Bar and line chart on a numeric axis.

```mermaid
xychart-beta
    title "Quarterly signals scored (thousands)"
    x-axis [Q1, Q2, Q3, Q4]
    y-axis "Signals" 0 --> 100
    bar [42, 58, 67, 81]
    line [40, 55, 65, 80]
```

> Inherits from core. The plot color palette can be overridden but per-series control is limited.

---

<!-- _class: diagram -->

`18 · Block Diagram 🔥`

## Tile layout for system blocks.

```mermaid
block-beta
  columns 3
  Frontend["Frontend"] Backend["Backend"] Database[("DB")]
  space:3
  Cache(("Cache")) Queue(("Queue")) Storage[("Storage")]
```

> Inherits from core. Spacing controlled by the `space:N` directive.

---

<!-- _class: diagram -->

`19 · Packet 🔥`

## Bit-level packet layout.

```mermaid
packet-beta
title TLS Record header
0-7: "Content Type"
8-15: "Major Version"
16-23: "Minor Version"
24-39: "Length"
40-47: "Reserved"
```

> Inherits from core. Width-fixed at 32 bits per row by default; `0-N` ranges define each field.

---

<!-- _class: diagram -->

`20 · Kanban 🔥`

## A board with swim-lane columns.

```mermaid
kanban
  Backlog
    [Per-team calibration]
    [Weight rollback audit]
  In Progress
    [Outcome reconciler]
    [SDK Java port]
  Review
    [Scoring profile spec]
  Done
    [Phase 01 launch]
    [Decision Log schema]
```

> Inherits from core. Per-card `[Title]@{ assigned: ..., priority: ... }` metadata supported but optional.

---

<!-- _class: diagram -->

`21 · Architecture 🔥`

## Cloud-architecture style with services and groups.

```mermaid
architecture-beta
  group platform(cloud)[Decision Framework]
  service reg(database)[Decision Log] in platform
  service cp(server)[Calibration Loop] in platform
  service sdk(internet)[SDK Fleet] in platform
  service store(disk)[Weight Store] in platform
  reg:R -- L:cp
  cp:R -- L:sdk
  cp:B -- T:store
```

> Inherits from core. Icons drawn from a registered set; default set is limited — register more via `mermaid.registerIconPacks`.

---

<!-- _class: diagram -->

`22 · Radar 🔥`

## Multi-axis polar chart.

```mermaid
radar-beta
  title Architecture review · scoring
  axis Speed, Resilience, Auditability, Cost, Simplicity
  curve Edge["Calibrated framework"]{85, 90, 95, 70, 60}
  curve Gateway["Quarterly review"]{60, 70, 80, 50, 80}
```

> Inherits from core. Multiple `curve` lines plot on the same axes.

---

<!-- _class: diagram -->

`23 · Treemap 🔥`

## Nested rectangles sized by value.

```mermaid
treemap-beta
"Decision Framework"
  "SDK"
    "Java": 4200
    "Python": 1800
    "Go": 800
  "Calibration Loop"
    "API": 2400
    "Signing": 1200
    "Audit": 900
  "Weight Store"
    "Postgres": 600
    "Backup": 200
```

> Inherits from core. Sized values cascade from leaves up; intermediate nodes don't take a value.

---

<!-- _class: diagram -->

`24 · Venn 🔥`

## Set overlap.

```mermaid
venn-beta
  set A["Pilot teams"]
  set B["Eligible PMs"]
  set V["Eval tools"]
  union A, B
  union B, V
```

> Inherits from core. `union A, B` overlaps two sets; `set X["Label"]` gives a display name distinct from the identifier. Intersection labels (`union A, B["…"]`) are supported but crowd a three-set diagram, so this example leaves the regions unlabeled.

---

<!-- _class: diagram -->

`25 · Ishikawa 🔥`

## Fishbone cause-and-effect.

```mermaid
ishikawa-beta
    Outcome reconciliation drift
    People:
        Skill gap on signal scoring
        On-call rotation thin
    Process:
        Manual recalibration
        No retrospective cadence
    Tooling:
        Log schema versioning
        Dashboard coverage gaps
    Environment:
        Multi-team replication
```

> Inherits from core. Branches default to four (people, process, tooling, environment) but any heading is allowed.

---

<!-- _class: diagram -->

`26 · TreeView 🔥`

## Indented file-tree style hierarchy.

```mermaid
treeView-beta
    "src/"
        "main.js"
        "lib/"
            "score.js"
            "verify.js"
    "package.json"
```

> Three named theme variables: `labelFontSize`, `labelColor`, `lineColor`. Indentation alone determines the tree.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _footer: '' -->
<!-- _header: '' -->

`Mermaid 11.14 · Lattice Theme`

## Twenty-six diagrams, one theme.

*Stable diagrams have rich theme control. Experimental diagrams marked 🔥 inherit from the core six variables and may evolve in syntax. Use this gallery as a reference for which diagram fits a given problem.*


<!-- Import Mermaid and the Lattice runtime theme for VS Code / web preview.
     The build script (lattice-emulator.js) pre-renders Mermaid to SVG at build time
     so these scripts are a no-op in the PDF/HTML output. -->
<!-- markdownlint-disable MD033 -->
<script src="../mermaid-v11.min.js"></script>
<script src="../dist/lattice-runtime.js"></script>
