---
origin: 3335
priority: P10
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §7
deferred: large — a new hook in the bar and finish layering, used by every patterned preset
source: https://github.com/Laticent/lattice/pull/3335
---

# L1: a deck backdrop hook the dark-mode bar reset leaves alone

why now   — base.variants.css:349 clears any deck background on a dark slide with the bar off, so Keynote, Blueprint, Riso, Field Notes and Strategy's cover only work through an always-true specificity selector.
where     — lib/base/base.variants.css:349 and :356; the section background layering.
done when — a preset sets `--deck-backdrop` and it paints in light and dark, bar on or off; the prototypes' `section[data-lattice-slide]:is(.dark, :not(.dark))…` selector is no longer needed; a test pins both modes.
