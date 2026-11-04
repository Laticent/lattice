---
origin: 3021
priority: P11
recorded: 2026-11-03
area: infra
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — the stale baseline spans about a dozen components #3021 does not touch, and each needs its own verify-then-bless call
source: https://github.com/Laticent/lattice/pull/3021
---

# check:family-tiers runs again, and its recorded baseline is stale

why now   — the tool crashed before testing anything (its viewport render lacked --keep-html); #3021 fixed that one flag. Run to completion, it now reports 4 tier failures and overflow-oracle drift: new clips for compare-code, timeline-list, matrix-2x2, roadmap, verdict-grid and list-tabular; fixed clips for authority-chain, glossary, kpi and list; and a roster change (+contact, wifi, −state-chart). The same output comes from main at c0cbc52 with the same flag (diffed line for line), so it is baseline drift from the months the tool could not run, not #3021.
where     — tools/check-family-tiers.js and its recorded baseline; the components it names.
done when — each NEW CLIPS row is verified (`--verify-paginates` for the may-paginate rows, a layout fix for timeline-list's ring), the tier failures are explained or fixed, and `--bless` records the result with a reason per component.
evidence  — npm run check:family-tiers output on #3021's head and on main, identical.
verify    — npm run check:family-tiers exits 0.
