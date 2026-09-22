---
origin: 2226
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2226#issuecomment-5673609887
backfill: true
---

# Drive the one claim #2226 could not

Backfilled verbatim from the continuation brief on #2226 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Drive the one claim #2226 could not
       why now   — it is the single load-bearing claim still resting on source reading,
                   and it is what makes the failure permanent rather than transient.
       where     — docs/src/lib/theme-fetch.ts:70-76 (the deliberate negative 404 cache).
       done when — the live Playground is switched to a palette whose CSS 404s, twice,
                   and the second switch is shown to make no second network request.
       evidence  — a devtools/CDP network trace from the real Playground, not a harness.
       verify    — tier 0. It confirms an existing claim; it changes no code.
```
