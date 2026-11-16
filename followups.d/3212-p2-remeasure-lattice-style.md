---
origin: 3212
priority: P2
recorded: 2026-11-15
area: website
severity: low
swimlane: engineering/decisions/2026-11-15-studio-map-load-cost.md §3
deferred: blocked — waits for #3212 to reach lattice.style
source: https://github.com/Laticent/lattice/pull/3212
---

# Re-measure lattice.style/studio/ for a returning reader with the map open

```text
  P2 · [no ticket] confirm #3212's win on the deployed site
       why now   — #3212 was measured in a cloud sandbox (Chromium at 4x CPU): returning
                   reader TBT 5.0 -> 2.7 s. The report that started it was a real
                   Lighthouse run on lattice.style (TBT 2,956 ms, SI 4.4 s). Nobody has
                   measured the deployed site since.
       where     — https://lattice.style/studio/ with the map open, a returning visit.
       done when — a Lighthouse desktop run on the deployed site, map open, second visit
                   (stills stored), with TBT/SI/TTI recorded in the decision note §3, plus
                   the nightly perf watch's /studio/ row for the same night.
       evidence  — the Lighthouse report JSON (or npm run perf:load with URL= the site,
                   MAP=1 RETURN=1) and the perf-nightly comment.
       verify    — tier 0: a measurement, not a code change.
```
