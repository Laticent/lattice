---
marp: true
theme: indaco
size: hd
pagination: true
header: "Lattice · universal token system"
footer: "Phase 2 — diagram-structural"
---

<!-- @meta{layout=title, header="", footer=""} -->



# Borders and lines, named for the job.

`Universal token system · Phase 2`

*The diagram-structural foregrounds move off the `--c-` junk drawer onto the `--diagram-` group — same pixels, clearer names.*

---

<!-- @meta{layout=cards-grid} -->

## Three structural foregrounds.

- diagram-stroke
  - The border around any categorical band fill (was `--c-stroke`).
- diagram-line
  - Edges, arrows, and connectors between nodes (was `--c-line`).
- diagram-accent-warm
  - A secondary warm accent — radar's second curve (was `--c-accent-warm`).

---

<!-- @meta{layout=diagram} -->

`01 · Flowchart`

## Node borders read stroke; edges read line.

```mermaid
flowchart LR
  A{{"Intake"}} --> B(["Score"])
  B -->|"signal"| C["Decision log"]
  B -.->|"recalibrate"| C
  C --> D[("Outcome store")]
```

> Every box border is `--diagram-stroke`; every arrow and label connector is `--diagram-line` — both painted via the upgraded offline bridge.

---

<!-- @meta{layout=diagram} -->

`02 · Sequence`

## Actor frames and signal lines, same two tokens.

```mermaid
sequenceDiagram
  participant U as User
  participant S as Service
  participant D as Datastore
  U->>S: request
  S->>D: query
  D-->>S: rows
  S-->>U: response
```

> Actor boxes and the activation bars border on `--diagram-stroke`; the lifelines and signals draw on `--diagram-line`.

---

<!-- @meta{layout=diagram} -->

`03 · Class`

## Boxes, dividers, and relations.

```mermaid
classDiagram
  class Deck {
    +theme
    +render()
  }
  class Palette {
    +tokens
  }
  Deck --> Palette : resolves
```

> Class-box borders and member dividers are `--diagram-stroke`; the relation arrow is `--diagram-line`.

---

<!-- @meta{layout=closing, header="", footer=""} -->



## Structural foregrounds, off the junk drawer.

`Phase 2 of 7 · see engineering/decisions/2026-06-11-universal-token-system.md`
