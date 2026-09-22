---
origin: 2302
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2302#issuecomment-5775735942
backfill: true
---

# Assert RUNTIME_SCRIPT_SRCS ⊆ STATIC_ASSETS.map(a => a.to)

Backfilled verbatim from the continuation brief on #2302 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Assert RUNTIME_SCRIPT_SRCS ⊆ STATIC_ASSETS.map(a => a.to)
       why now   — nothing checks the two agree, so a fourth engine can ship a
                   deck referencing a file no producer copies: a 404 under
                   file://, which is the same failure class the dagre split
                   already caused once. Pre-existing; logged off-path on #2302.
       where     — lib/core/marp-bundle.js (STATIC_ASSETS ~:48, RUNTIME_SCRIPT_SRCS
                   ~:182); the assertion belongs in test/unit/core/marp-bundle.test.js,
                   which currently hardcodes three names and never mentions
                   lattice-dagre.min.js.
       done when — a test fails when a name is added to one list and not the other.
       evidence  — the new arm shown failing on that exact mutation, then passing.
       verify    — tier 0 gates, because it is additive test coverage on a list
                   whose contents do not change.
```
