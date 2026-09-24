---
origin: 2309
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2309#issuecomment-5779466187
---

# Put the WebKit CI arm to the human as a decision, with measured cost — do NOT add it on your own judgment.

Backfilled verbatim from the continuation brief on #2309 (merged 2026-09-22).
Triaged 2026-09-24 against `main` at 6110a1e: still open. Also carries #2303 P3, the same decision (deleted as a duplicate). It is still the maintainer's call. Carried over from #2303 P3's done-when: if the answer is yes, the item is done only when one arm renders the chart gallery in WebKit and asserts the audit's tolerance.

```text
  P3 · [no ticket] Put the WebKit CI arm to the human as a decision, with measured
       cost — do NOT add it on your own judgment.
       why now   — #2297's fix merged (#2303), but the gap it named is still open:
                   no WebKit render exists in `npm test`, the integration tier or CI,
                   so nothing in the tree can catch a WebKit-only regression. It is
                   the one gap that would raise this swimlane's confidence above
                   `high`, and P1/P2 both touch CSS that ships to WebKit surfaces.
       where     — docs/playwright.config.* already defines `@webkit-phone` /
                   `@webkit-tablet` projects, so the capability exists and is simply
                   not exercised for chart or slide rendering. WebKit needs
                   `npx playwright install webkit && npx playwright install-deps webkit`
                   in this sandbox — neither is present by default.
       done when — one AskUserQuestion round carrying options with MEASURED wall-clock
                   and a recommendation. This is a CI-contract change: CLAUDE.md's
                   second filter, row 2, makes it the human's call, not yours.
       evidence  — the measured per-PR wall-clock a webkit project adds, timed here,
                   not estimated.
       verify    — tier 0 gates, because the deliverable is a decision round, not code.
```
