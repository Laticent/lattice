---
origin: 2243
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2243#issuecomment-5757375213
backfill: true
---

# Generic data-series narrator for the SVG charts that narrate nothing

Backfilled verbatim from the continuation brief on #2243 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Generic data-series narrator for the SVG charts that narrate nothing
       why now   — the single largest narration gap: ~19 components narrate their heading
                   and stop (0.09-0.28 coverage) while HTML-substance ones reach 0.80-1.07.
                   Every deck with a chart is currently read as a title and silence.
       where     — lib/core/chart-narration.js (NARRATORS map is the registry; funnel,
                   radar, quadrant, state-chart, journey are the worked examples added in
                   #2243). Finding 1 in the audit doc governs. HEAD START, BUT RE-CHECK IT:
                   gantt's SVG emitted a usable `<desc>` summary and marks carrying
                   data-label / data-value / data-s, which a generic attribute-reading
                   narrator could cover many components with. #2250 (chart(gantt): pack
                   overlapping tasks into sub-rows) landed the same morning and reworked
                   that component, so re-read the current markup before relying on it.
       done when — `node tools/measure-narration-coverage.mjs` moves the SVG tier from
                   0.09-0.28 into the healthy band, and no component regresses.
       evidence  — the before/after coverage table from that script, plus the emitted
                   caption bytes for 3+ affected decks via
                   `node dist/lattice-emulator.js <deck>.md --captions`, read to confirm
                   the narration states only what the slide actually shows.
       verify    — tier 1 (independent checker), because it lands in the shared kernel
                   and #2243's own history is three separate rounds of real defects that
                   green gates did not see.
```
