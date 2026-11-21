---
origin: 3335
priority: P9
recorded: 2026-11-20
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §2
deferred: off-path — the marks register's etch fill; PR 3335 touches no chart code
source: https://github.com/Laticent/lattice/pull/3335
---

# marks: etch bar fill fails 3:1 on dark slides

why now   — the preset study measured etch bar fill at 1.51 to 1.75:1 against dark backgrounds (indaco, laguna and carbone dark); only the outline carries the bar.
where     — the marks-etch fill tokens.
done when — etch bar fill (or fill plus outline) reaches 3:1 on every built-in dark theme, measured, with a test that fails if it drops.
