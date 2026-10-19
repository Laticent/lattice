---
origin: 2782
priority: P3
recorded: 2026-10-19
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2782
---

# Build the rendered index and stamp source lines at splitForPreview.

```text
  why now   — a map needs unit-to-rendered-page mapping; it is derivable for all 281 decks today
              but only by re-deriving from the same splitForPreview(width,height).
  where     — docs/src/lib/playground-engine.ts:136 (the one splitForPreview call).
  done when — the index {unit, part, copy, page} is built once from that call and the Playground
              connector reads it; the engine is not changed.
  evidence  — a test over the example decks with zero unexplained units.
  verify    — tier 1 checker.
```
