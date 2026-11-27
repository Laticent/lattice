---
marp: true
size: hd
theme: indaco
color-mode: dark
---

<!-- @meta{layout=diagram} -->

## A component class is not an opt-out of the deck's color mode.

```mermaid
flowchart LR
  subgraph g["Grouped"]
    A["A"] --> B["B"]
  end
  B --> C["C"]
```

---

<!-- @meta{layout=diagram, class=light} -->

## A slide's own `light` token does opt out.

```mermaid
flowchart LR
  subgraph g["Grouped"]
    D["D"] --> E["E"]
  end
  E --> F["F"]
```

---

<!-- @meta{layout=diagram, class=dark} -->

## A slide's own `dark` token agrees with the deck.

```mermaid
flowchart LR
  subgraph g["Grouped"]
    G["G"] --> H["H"]
  end
  H --> I["I"]
```
