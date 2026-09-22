---
origin: 2279
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2279#issuecomment-5764143460
backfill: true
---

# Drive the real STUDIO route against the three shapes #2279 fixed

Backfilled verbatim from the continuation brief on #2279 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P4 · [no ticket] Drive the real STUDIO route against the three shapes #2279 fixed
       why now   — it is the one reachable surface #2279 did not exercise, and it is what held
                   that PR's pre-merge card at `high` on the evidence axis. Cheap to close now.
       where     — docs/e2e, seeding via `lattice-docs-pg-source` the way
                   docs/e2e/badge-transform-escape.spec.ts does; #2279 drove /playground, not
                   /studio. studio-smoke covers Studio in CI and passed, so this is
                   confirmation rather than suspicion.
       done when — a Studio deck carrying a comment that quotes a section tag, a `>` inside a
                   quoted attribute, and an apostrophe in an unquoted attribute all stamp
                   every slide.
       evidence  — screenshots at 1440/820/390 via tools/screenshot.js.
       verify    — tier 0. It is a verification task, not a change.
```
