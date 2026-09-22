---
origin: 2246
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2246#issuecomment-5753518960
backfill: true
---

# Second independent checker pass over #2246 as landed

Backfilled verbatim from the continuation brief on #2246 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P4 · [no ticket] Second independent checker pass over #2246 as landed
       why now   — ONE checker pass found THREE confirmed defects in code already called
                   verified (--read --captions wrote zero .vtt; a deck writing </main> kept and
                   duplicated a slide; read: true was a documented no-op). All are fixed with
                   regression tests, but that yield is itself the argument for a second look,
                   and no second pass ran.
       where     — git show 01a0e99
       done when — a checker reports on the merged diff; anything CONFIRMED gets its own fix PR
       evidence  — the checker's findings, each with file:line and a failure scenario
       verify    — tier 1 checker — it IS the tier
```
