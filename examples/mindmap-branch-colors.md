---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · mindmap branch colors"
footer: "Feature deck"
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _paginate: false -->

# One branch, one color

`Diagram · Mindmap · Categorical`

Every node in a mindmap branch now takes that branch's color, whatever its shape and however many branches the map has. Each branch line matches its boxes, and the root has a color of its own.

---

<!-- _class: diagram -->

`01 · The repro, light`

## Six branches, six colors, and a root that stands apart.

```mermaid
mindmap
  root)Reality matches the claim(
    You direct
      [AI raises the floor]
      (You raise the ceiling)
    Context
      [An index, not a manual]
      (Route before work)
    Autonomy
      [Can it be undone?]
      (Who else does it affect?)
    Verification
      [Proof from the real thing]
      (Tests that can fail)
    Learning
      [Mistake to rule to retired]
      (Write down why)
    Orchestration
      [One job per agent]
      (Budget it like money)
```

---

<!-- _class: diagram dark -->

`02 · The repro, dark`

## On a dark slide each line lightens, and keeps its branch's hue.

```mermaid
mindmap
  root)Reality matches the claim(
    You direct
      [AI raises the floor]
      (You raise the ceiling)
    Context
      [An index, not a manual]
      (Route before work)
    Autonomy
      [Can it be undone?]
      (Who else does it affect?)
    Verification
      [Proof from the real thing]
      (Tests that can fail)
    Learning
      [Mistake to rule to retired]
      (Write down why)
    Orchestration
      [One job per agent]
      (Budget it like money)
```

---

<!-- _class: diagram -->

`03 · Every node shape, light`

## Square, rounded, circle, bang, cloud, hexagon and plain all follow the branch.

```mermaid
mindmap
  root((Node shapes))
    Square
      [Square leaf]
      [Second square]
    Rounded
      (Rounded leaf)
      (Second rounded)
    Circle
      ((Circle))
      ((Again))
    Bang
      ))Bang leaf((
    Cloud
      )Cloud leaf(
    Hexagon
      {{Hexagon leaf}}
    Plain
      Plain leaf
```

---

<!-- _class: diagram dark -->

`04 · Every node shape, dark`

## The same seven shapes on a dark canvas.

```mermaid
mindmap
  root((Node shapes))
    Square
      [Square leaf]
      [Second square]
    Rounded
      (Rounded leaf)
      (Second rounded)
    Circle
      ((Circle))
      ((Again))
    Bang
      ))Bang leaf((
    Cloud
      )Cloud leaf(
    Hexagon
      {{Hexagon leaf}}
    Plain
      Plain leaf
```

---

<!-- _class: diagram -->

`05 · Eight branches, light`

## Past five branches the colors keep going instead of falling back to blue.

```mermaid
mindmap
  root((Launch plan))
    Research
      [Interviews]
      (Survey)
    Design
      [Prototype]
      (Review)
    Build
      [Core engine]
      (Integrations)
    Test
      [Unit tier]
      (Field trial)
    Launch
      [Press]
      (Partners)
    Support
      [Docs]
      (Help desk)
    Measure
      [Adoption]
      (Retention)
    Iterate
      [Backlog]
      (Roadmap)
```

---

<!-- _class: diagram dark -->

`06 · Eight branches, dark`

## Branches seven and eight get colors of their own in dark mode too.

```mermaid
mindmap
  root((Launch plan))
    Research
      [Interviews]
      (Survey)
    Design
      [Prototype]
      (Review)
    Build
      [Core engine]
      (Integrations)
    Test
      [Unit tier]
      (Field trial)
    Launch
      [Press]
      (Partners)
    Support
      [Docs]
      (Help desk)
    Measure
      [Adoption]
      (Retention)
    Iterate
      [Backlog]
      (Roadmap)
```

---

<!-- _class: diagram sketch -->

`07 · Hand-drawn look`

## Under the sketch look, each branch hatches in its own color.

```mermaid
mindmap
  root((Node shapes))
    Square
      [Square leaf]
    Rounded
      (Rounded leaf)
    Bang
      ))Bang leaf((
    Cloud
      )Cloud leaf(
    Hexagon
      {{Hexagon leaf}}
    Plain
      Plain leaf
```

---

<!-- _class: diagram -->

`08 · Sankey, unchanged`

## Sankey nodes still cycle by position, exactly as before.

```mermaid
sankey-beta
Wages,Housing,300
Wages,Food,150
Wages,Savings,100
Freelance,Housing,50
Freelance,Savings,120
Savings,Index fund,160
Savings,Cash,60
```

---

<!-- _class: cards-grid four -->

`09 · What changed`

## Four fixes, all in one Mermaid stylesheet.

- Position
  - The order-based node cycle skips mindmap, so leaves stop taking a color from their place in the markup.
- Range
  - Node fills follow every branch Mermaid numbers, for every shape.
- Lines
  - Each line takes its branch's fill: darker on light, lighter on dark.
- Root
  - The root takes the deck accent, apart from the first branch.
