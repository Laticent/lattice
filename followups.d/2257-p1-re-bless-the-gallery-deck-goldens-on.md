---
origin: 2257
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2257#issuecomment-5765669132
backfill: true
---

# Re-bless the gallery + deck goldens on claude/dark-sovereign-canvas

Backfilled verbatim from the continuation brief on #2257 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Re-bless the gallery + deck goldens on claude/dark-sovereign-canvas
       why now   — it is the only thing between this branch and a mergeable PR
       where     — tools/regression-gate.mjs; `npm run bless`, then
                   `node tools/regression-gate.mjs --scope decks --bless`
       done when — `npm run regress` is green on the branch head
       evidence  — the refreshed dark gallery PDFs, rasterized and looked at via
                   tools/rasterize-for-review.sh + SendUserFile; not the exit code alone
       verify    — tier 0 gates, because the diff is regenerated artifacts under a gate
                   that pixel-diffs them
```
