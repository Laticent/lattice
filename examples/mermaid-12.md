---
marp: true
theme: indaco
pagination: true
header: "Lattice · Mermaid 12"
---

<!-- @meta{layout=title, class=silent} -->

# Mermaid 12 draws the diagrams you already have

`Diagram · vendored Mermaid 11.17 to 12.3`

The vendored Mermaid moved up a major, which brings its label sanitizer to DOMPurify 3.4.17. Mermaid 12 changed its own defaults; the deck keeps the drawing you designed against.

---

<!-- @meta{layout=diagram} -->

## A flowchart keeps its square edges and plain nodes.

```mermaid
flowchart LR
  A{{"Signal intake"}} --> B(["Scoring model"])
  B -- scored --> C["Decision log"]
  C --> D[("Outcome store")]
```

---

<!-- @meta{layout=diagram} -->

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

<!-- @meta{layout=diagram} -->

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

<!-- @meta{layout=diagram, class=sketch} -->

## A sketch slide now draws block diagrams by hand.

```mermaid
block-beta
  columns 3
  Frontend["Frontend"] Backend["Backend"] Orders[("Orders DB")]
  space:3
  Cache(("Cache")) Queue(("Queue")) Storage[("Object storage")]
```

---

<!-- @meta{layout=diagram, class=dark} -->

## A dark slide keeps the palette.

```mermaid
flowchart LR
  A["Forms"] --> B{"Complete?"}
  B -- yes --> C["Panel"]
  B -- no --> A
  C --> D["Decision"]
```

---

<!-- @meta{layout=closing, class=silent} -->

# Same diagrams, newer sanitizer

`Mermaid 12.3 · Lattice theme`
