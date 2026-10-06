---
origin: 2540
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2540
---

# Rebaseline the Studio's route budget after the lazy walkthrough engine

why now   — #2540 made the Studio's eager JS 17.4 KB gzip smaller than main (Vetrina's engine and the
            tour scripts load on first start). The soft target still reflects the larger bundle, so
            the saving can be spent silently by the next PR.
where     — `npm run route-budget:rebaseline -- --reason "…"` in docs/; commits route-budget.json and
            route-budget.history.md in a PR of their own (the script's rule).
done when — studio eagerJsGz soft target lowered to the measured figure on main after #2540 merges.
evidence  — the rebaseline output and the history row.
verify    — the route-budget gate on that PR.
