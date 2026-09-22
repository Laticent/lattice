---
origin: 2264
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2264#issuecomment-5767264630
backfill: true
---

# measureOverflow carries the id-selector hole #2268 just closed

Backfilled verbatim from the continuation brief on #2264 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] measureOverflow carries the id-selector hole #2268 just closed
       why now   — it is the last place in the tree teaching the broken form; a reader can cite
                   it as precedent, and it mis-measures the same pasted-scaffold deck
       where     — lattice-emulator.js:3498 (`const measureOverflow = …`), ~950 lines above the
                   slide queries #2268 fixed; the fix shape is there to copy
       done when — a deck pasting `<main id="deck"><section data-lattice-slide=…>` measures the
                   real slides only; a new arm in test/integration/invariants/ pins it
       evidence  — the new arm, plus the mutation: revert the scope and watch that arm alone go
                   red
       verify    — tier 1 checker, because measureOverflow drives autosplit and the Fit Ladder
```
