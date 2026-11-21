---
origin: 3335
priority: P13
recorded: 2026-11-20
area: engine
severity: low
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: large — a keep-out hook on the finish layer plus three new finishes
source: https://github.com/Laticent/lattice/pull/3335
---

# WP-clear and N2: extend backdrop clear; grid, halftone, ruled and glow recipes

why now   — Blueprint, Riso and Field Notes hand-place background plates; a true halftone needs dot size to follow tone; ruled paper needs to snap to the body line-height.
where     — base.finish.css (the clear-mask region), resolve-backdrop.js, lib/finishes/ recipes and finish-generate.js.
done when — `backdrop: clear` also clears the footer box and hero stack; the four recipes render as vector in light and dark; the presets that use them clear the judging gate (§8).
