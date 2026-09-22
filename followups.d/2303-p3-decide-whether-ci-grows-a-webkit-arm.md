---
origin: 2303
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2303#issuecomment-5776537591
backfill: true
---

# Decide whether CI grows a WebKit arm — MAINTAINER'S CALL, do not add one unilaterally

Backfilled verbatim from the continuation brief on #2303 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Decide whether CI grows a WebKit arm — MAINTAINER'S CALL, do not
       add one unilaterally
       why now   — nothing in the tree can catch a WebKit-only regression; #2303's
                   gate is source-level only, by construction.
       where     — docs/playwright.config.ts already declares @webkit-phone and
                   @webkit-tablet, so the capability exists and is simply not
                   exercised for chart rendering. The work is wiring, not build-out.
       done when — the maintainer has decided. If yes, one arm rendering the chart
                   gallery in WebKit and asserting the audit's tolerance.
       evidence  — measured added CI wall-time, not an estimate, presented with the
                   options.
       verify    — tier 0 for the measurement; the DECISION is not yours. CLAUDE.md's
                   second filter puts "adding a CI job or step" squarely with the
                   maintainer: every future PR pays the cost.
```
