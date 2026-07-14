---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · diagram narration"
footer: "read-aloud narrates the flowchart topology"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _footer: '' -->
<!-- _header: '' -->

# Read-aloud that reads the graph.

`Mermaid flowchart narration`

*A `diagram` slide's flowchart used to narrate its heading and go silent. Now read-aloud (and the exported captions) describe it as a flow — following the path from the entry points, grouping each fan-out, and closing at the terminal nodes.*

---

<!-- _class: diagram -->

`01 · Labeled flow`

## How a signal becomes a decision.

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

> Read as a flow, not an edge dump: the pipeline coalesces into one chain — "Signal Intake leads to Scoring Model … then Decision Log … then Outcome Store. The flow ends at Outcome Store." — with edge labels folded in as clauses and the two arrows into the Decision Log merged.

---

<!-- _class: diagram -->

`02 · Decision branch`

## A gate that splits the path.

```mermaid
flowchart TD
  Start["New request"] --> Check{"Within policy?"}
  Check -->|"yes"| Approve["Auto-approve"]
  Check -->|"no"| Review["Send to review"]
  Review --> Approve
```

> Each branch binds to its condition unambiguously: "From Within policy?: on yes, leads to Auto-approve; on no, leads to Send to review" — a verb-bound clause per branch, not a flat comma list a listener can't parse.

---

<!-- _class: diagram -->

`03 · Chained + feedback`

## A pipeline with a loop back.

```mermaid
flowchart LR
  A[Raw signals] --> B[Classify] --> C[Score and weight]
  C --> D[Decision log] --> E[Calibration]
  E -.adjust weights.-> C
```

> The feedback edge is detected and read as a loop, not misordered into the flow: "Raw signals leads to Classify, then Score and weight, then Decision log, then Calibration. Calibration, adjust weights, loops back to Score and weight."

---

<!-- _class: diagram -->

`04 · Grouped stages`

## Subgraphs still narrate their edges.

```mermaid
flowchart LR
  subgraph Ingest
    A["Collect"] --> B["Normalize"]
  end
  subgraph Decide
    C["Score"] --> D["Log"]
  end
  B --> C
```

> A linear path that crosses two subgraph boundaries coalesces into one sentence — "Collect leads to Normalize, then Score, then Log. The flow ends at Log." — and the group boxes are never spoken as nodes.

---

<!-- _class: diagram -->

`05 · Honest fallback`

## A non-flowchart type reads its heading.

```mermaid
sequenceDiagram
  participant App
  participant SDK
  App->>SDK: score(signal)
  SDK-->>App: a score
```

> Sequence, class, state, ER, and gantt diagrams are not yet narrated — they fall back to the heading and this caption, exactly as before. No confidently-wrong reading of a graph the narrator can't yet parse.

---

<!-- _class: closing -->
<!-- _footer: '' -->

# The arrows are spoken now.

`flowchart topology · read-aloud + exported captions`
