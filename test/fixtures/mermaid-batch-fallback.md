---
marp: true
theme: indaco
---

# Valid

```mermaid
flowchart LR
  A[One] --> B[Two]
```

---

# Malformed

<!--
DELIBERATELY BROKEN, and it must stay broken. This fence is what makes the deck a
test: mmdc cannot parse it, so the BATCHED render (one invocation for the whole
deck) fails as a unit, and the renderer has to fall back to one invocation per
diagram. The valid fence above then still has to come back as a real diagram.
Fixing this syntax would silently turn the test into a plain two-diagram render.
-->

```mermaid
flowchart LR
  A[One --> ((((broken
```
