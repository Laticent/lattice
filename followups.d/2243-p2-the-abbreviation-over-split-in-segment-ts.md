---
origin: 2243
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2243#issuecomment-5757375213
backfill: true
---

# The abbreviation over-split in segment.ts

Backfilled verbatim from the continuation brief on #2243 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] The abbreviation over-split in segment.ts
       why now   — a raw passthrough is also a TIMING error (track.ts prices a word from
                   its spoken string), so this desyncs the caption cursor, not just the words.
       where     — docs/src/lib/cadenza/segment.ts; Finding 3 in the audit doc has the
                   measured under/over-timing numbers (Inc. and (API) under-timed by 80%).
       done when — the named abbreviations no longer split a sentence, with unit coverage
                   for both the split and the mirror under-split case.
       evidence  — the cue timings before/after for a deck containing them, read out of
                   the emitted .vtt.
       verify    — tier 0 gates, because it is contained to one pure function with tests.
```
