---
origin: 3453
priority: P2
recorded: 2026-11-23
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-22-lighthouse-13-measurement-shift.md
deferred: blocked — needs about a week of perf-nightly runs measured on Lighthouse 13, and the bands are the owner's numbers
---

# perf-nightly's bands were tuned on Lighthouse 12

`scripts/perf-regression.mjs` flags TBT more than 20% and 100 ms worse, and a score crossing the 0.5 floor. Lighthouse 13
(lhci 0.16, on `main` since #3201) reports TBT 30–110% higher on `/playground/`, `/studio/` and mobile `/`, so the 100 ms
floor filters out relatively less noise. Mobile `/playground/` moved from 0.48 to 0.55, just over the floor, where a noisy
night can cross it.

done when — the owner has seen the false-alarm rate of a week of Lighthouse 13 nights and either kept the bands or
            approved new ones.
evidence  — the nightly runs from 2026-11-23 on: how many filed, and on which rows; the per-run LHRs in each run's artifact.
verify    — tier 1: maker-checker on any band change, with options put to the owner first (CLAUDE.md, "a number I gave you").
