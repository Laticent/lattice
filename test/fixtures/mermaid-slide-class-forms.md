---
marp: true
size: hd
theme: indaco
split: headings
---

<!-- _class: diagram -->

## The deck default reaches a slide that names no color token.

```mermaid
flowchart LR
  subgraph g1["One"]
    A["A"] --> B["B"]
  end
  B --> C["C"]
```

---

<!-- class: diagram dark -->

## A GLOBAL class directive applies from its own slide.

```mermaid
flowchart LR
  subgraph g2["Two"]
    D["D"] --> E["E"]
  end
  E --> F["F"]
```

---

## And it carries forward to a slide that declares nothing.

```mermaid
flowchart LR
  subgraph g3["Three"]
    G["G"] --> H["H"]
  end
  H --> I["I"]
```

---

<!-- _class: diagram dark -->

## A directive quoted as prose is prose.

- `<!-- _class: kpi -->` is how the docs name a layout, not a layout change.

```mermaid
flowchart LR
  subgraph g4["Four"]
    J["J"] --> K["K"]
  end
  K --> L["L"]
```

---

<!-- _class: diagram dark -->

## An equation is opaque, and does not start a slide.

$$
A
=
LU
$$

```mermaid
flowchart LR
  subgraph g5["Five"]
    M["M"] --> N["N"]
  end
  N --> O["O"]
```
