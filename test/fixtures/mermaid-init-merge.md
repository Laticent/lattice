---
marp: true
theme: indaco
size: hd
pagination: false
---

<!-- @meta{layout=diagram} -->

## Control

```mermaid
flowchart TB
  subgraph g["Group"]
    A["A"] --> B["B"]
  end
  B --> C["C"]
```

---

<!-- @meta{layout=diagram} -->

## Color-neutral init directive

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TB
  subgraph g["Group"]
    A["A"] --> B["B"]
  end
  B --> C["C"]
```

---

<!-- @meta{layout=diagram} -->

## Author-pinned Mermaid theme

```mermaid
%%{init: {'theme':'forest'}}%%
flowchart TB
  subgraph g["Group"]
    A["A"] --> B["B"]
  end
  B --> C["C"]
```
