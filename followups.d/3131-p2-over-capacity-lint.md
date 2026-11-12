---
origin: 3131
priority: P2
recorded: 2026-11-12
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-10-chart-form.md
deferred: large — a new lint rule through lib/authoring/lint-core.js, which needs the phone render's over-capacity verdict at lint time, and lint is render-free today
source: https://github.com/Laticent/lattice/pull/3131
---

# Tell the author when a chart prints over capacity on a phone page

why now   — the trio's inversion on #3131 (2026-11-12): a chart no arrangement holds at 11pt is drawn whole on a larger
            box and the page scales it (`data-chart-form="over"`), 11% to 60% under the floor. Nothing reports it, so an
            author first learns it reading the deck on a phone. The CLI's TYPE FLOOR warning fires only under 5.4pt.
where     — lib/authoring/lint-core.js (HARD RULE #7), fed by the phone render's `data-chart-form`; or the CLI's
            render warnings, which already see the rendered page.
done when — `lint:deck` (warn only) or the CLI names each phone page whose chart is over capacity, with the kind and
            how far under 11pt it prints, and a fix (fewer entries, a shorter key, a bigger page).
