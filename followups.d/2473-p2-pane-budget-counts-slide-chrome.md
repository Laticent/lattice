---
origin: 2473
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2473
---

# `lint:deck`'s pane budget misses a stacked table that the slide's chrome clips

why now   — a `rows` slide with a slide eyebrow and a Key Insight clipped the last row of its
            two-row `table` pane (`rows` stress slide, PR 2473, before the eyebrow was dropped),
            and `lint:deck` called it clean. The pane budget (lib/core/pane-spec.js
            `headedBudget`) takes a pane title out of the pane but not the slide's own chrome
            (eyebrow, subtitle, Key Insight, note), which the engine does subtract
            (lib/engine/index.js `stageBox`).
where     — lib/core/pane-spec.js `headedBudget`, lib/authoring/lint-core.js `findPaneIssues`.
tried     — subtracting the chrome bands from the pane in proportion (the engine's measured
            figures, eyebrow .0297 · subtitle .0352 · Key Insight .0789 · note .0531 of the
            width). It still passed the clipping table, and it newly flagged three panes that
            render with room to spare (`examples/pane-layouts.md` slide 3's two text panes; the
            `columns` stress table at 60%). The budgets are conservative COUNTS, so scaling them
            by height over-corrects the loose ones and never reaches a table, whose header row
            and cell padding are the real cost. Reverted.
done when — the pane budget flags the clipping case above and none of the three, measured by
            rendering each at 1280 and reading the overflow probe.
evidence  — the four renders, before and after, with the probe's verdict for each.
verify    — `npm run lint:deck` on the four slides against their rendered overflow result.
