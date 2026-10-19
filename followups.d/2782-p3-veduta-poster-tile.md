---
origin: 2782
priority: P3
recorded: 2026-10-19
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2782
---

# Add posters as a tile kind: capture, cache and pin.

```text
  why now   — posters were ruled last (audit §11f). They only pay past the pool cap, and the
              examples corpus median is 8 slides, so measure real deck sizes first.
  where     — a connector, not the core: the core's poster rung defaults to a budget of 0.
  done when — a connector captures, caches (content-addressed, LRU, pinned windows) and serves
              posters, with the WebKit capture hitch measured.
  evidence  — Safari measurements on a real device; until then UNVERIFIED.
  verify    — tier 1 checker.
```
