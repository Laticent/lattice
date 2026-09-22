---
origin: 2243
priority: P5
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2243#issuecomment-5757375213
backfill: true
---

# A state label carrying an authored line break reads "needs<br/>second review"

Backfilled verbatim from the continuation brief on #2243 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P5 · [no ticket] A state label carrying an authored line break reads "needs<br/>second review"
       why now   — lowest impact, and it was PRE-EXISTING and off the path of #2243, so it
                   was logged rather than pulled into that diff (#18).
       where     — lib/core/chart-narration.js state-chart label handling.
       done when — the label narrates as "needs second review".
       evidence  — the emitted caption bytes for the state-chart gallery deck.
       verify    — tier 0 gates.

  NOT A CODE ITEM, and the one thing that would have raised #2243 past `high`:
  somebody with ears needs to listen to one narrated deck end to end on the real Studio.
  No sandbox can do it. If you are a session with no human present, do not claim it.
```
