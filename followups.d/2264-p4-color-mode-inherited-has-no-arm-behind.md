---
origin: 2264
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2264#issuecomment-5767264630
---

# `color-mode: inherited` has no arm behind it

Backfilled verbatim from the continuation brief on #2264 (merged 2026-09-21).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P4 · [no ticket] `color-mode: inherited` has no arm behind it
       why now   — it is the one register row whose correct behavior is "write nothing", which
                   is the easiest kind to break silently: a wrong write looks deliberate
       where     — lattice-emulator.js:5690 (`SCHEME_BY_COLOR_MODE`), and the register arms in
                   test/integration/invariants/read-export.test.js
       done when — an arm asserts an `inherited` deck's <html> carries no color-scheme, and it
                   fails if the map ever gains that key
       evidence  — the arm plus its mutation
       verify    — tier 0 gates; it is one map entry and one assertion
```
