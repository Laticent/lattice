---
origin: 2264
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2264#issuecomment-5767264630
backfill: true
---

# The bake double-encodes UTF-8 — a function-plot's `x²` renders `XÂ²`

Backfilled verbatim from the continuation brief on #2264 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] The bake double-encodes UTF-8 — a function-plot's `x²` renders `XÂ²`
       why now   — it is visibly wrong on a shipped surface, and --read made it reachable by a
                   second audience; --player has carried the identical bytes all along
       where     — the capture/serialize path in lattice-emulator.js and
                   lib/components/chart/_chart-family/standalone-svg.js (foreignObject → text);
                   recorded in the swimlane note § "The bake's UTF-8 double-encoding"
       done when — `x²` survives a --read and a --player export byte-for-byte; the sibling case
                   (`R&D` reading `R&amp;D`) is decided one way or the other, not silently left
       evidence  — the two exported artifacts, grepped for the codepoint, before and after
       verify    — tier 1 checker, because the capture is shared by --player, --read and the
                   Studio export
```
