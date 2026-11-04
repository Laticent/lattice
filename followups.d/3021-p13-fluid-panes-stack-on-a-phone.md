---
origin: 3021
priority: P13
recorded: 2026-11-04
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — the fluid view's pane arrangement predates this PR and no change here causes or worsens it; the fix is a layout decision for the fluid view (stack panes, or split them into screens as the mobile canvas does)
source: https://github.com/Laticent/lattice/pull/3021
---

# The fluid view keeps panes side by side on a phone

why now   — a `columns ratio-30-70` slide in the fluid view at 390 × 844 gives its narrow pane about 92px (5em). Any component there is starved: a record table clips in table form (held by the fit check since this PR) and showed one letter per line before it. The mobile canvas splits a panes slide into one slide per pane (lib/core/panes.js `installPaneSplit`); the fluid view re-derives orientation from the box but keeps the side-by-side pane geometry.
where     — lib/base/base.fluid-view.css (its `lat-pane-host` rule) and lib/core/pane-css.js; possibly the fluid controller in lib/runtime/index.js.
done when — at phone width the fluid view stacks a panes slide's panes (or pages them), and a 30% pane's content reads at full width.
evidence  — the fluid render of examples/responsive-tables.md and examples/panes.md at 390 × 844, before and after.
verify    — `node dist/lattice.js examples/panes.md out.html --fluid`, open at 390 × 844, look at every panes slide.
