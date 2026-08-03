---
marp: true
size: hd
theme: indaco
color-mode: dark
---

<!-- _class: diagram -->

## A component class is not an opt-out of the deck's color mode.

```mermaid
flowchart LR
  subgraph g["Grouped"]
    A["A"] --> B["B"]
  end
  B --> C["C"]
```

---

<!-- _class: diagram light -->

## A slide's own `light` token does opt out.

```mermaid
flowchart LR
  subgraph g["Grouped"]
    D["D"] --> E["E"]
  end
  E --> F["F"]
```

---

<!-- _class: diagram dark -->

## A slide's own `dark` token agrees with the deck.

```mermaid
flowchart LR
  subgraph g["Grouped"]
    G["G"] --> H["H"]
  end
  H --> I["I"]
```
