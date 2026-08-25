---
marp: true
theme: indaco
size: hd
paginate: false
---

<!-- _class: title -->

# Mermaid smoke test

A single trivial flowchart used by the Mermaid integration test. Kept
small so the test stays fast (one diagram ≈ 3-5 s through mmdc).

---

<!-- _class: diagram -->

## A to B

```mermaid
flowchart LR
  A[Start] --> B[End]
```
