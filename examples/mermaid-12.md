---
marp: true
theme: indaco
paginate: true
header: "Lattice · Mermaid 12"
---

<!-- _class: title silent -->

# Mermaid 12 draws the diagrams you already have

`Diagram · vendored Mermaid 11.17 to 12.3`

The vendored Mermaid moved up a major, which brings its label sanitizer to DOMPurify 3.4.17. Mermaid 12 changed its own defaults; the deck keeps the drawing you designed against.

---

<!-- _class: diagram -->

## A flowchart keeps its square edges and plain nodes.

```mermaid
flowchart LR
  A{{"Signal intake"}} --> B(["Scoring model"])
  B -- scored --> C["Decision log"]
  C --> D[("Outcome store")]
```

---

<!-- _class: diagram -->

## Short labels keep their snug boxes.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Draft
  Draft --> Review
  Review --> Live
  Review --> Draft
  Live --> [*]
```

---

<!-- _class: diagram -->

## A mind map still fans out from its center.

```mermaid
mindmap
  root((Launch plan))
    Pricing
      Tiers
      Trials
    Channels
      Partners
      Direct
    Support
      Docs
      Onboarding
```

---

<!-- _class: diagram sketch -->

## A sketch slide now draws block diagrams by hand.

```mermaid
block-beta
  columns 3
  Frontend["Frontend"] Backend["Backend"] Orders[("Orders DB")]
  space:3
  Cache(("Cache")) Queue(("Queue")) Storage[("Object storage")]
```

---

<!-- _class: diagram dark -->

## A dark slide keeps the palette.

```mermaid
flowchart LR
  A["Forms"] --> B{"Complete?"}
  B -- yes --> C["Panel"]
  B -- no --> A
  C --> D["Decision"]
```

---

<!-- _class: closing silent -->

# Same diagrams, newer sanitizer

`Mermaid 12.3 · Lattice theme`
