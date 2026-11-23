---
origin: 3470
priority: P2
recorded: 2026-11-23
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: large — a new chart-family feature (an author marks the one mark that matters) and a palette-wide retune of categorical lightness; neither is a preset setting
source: https://github.com/Laticent/lattice/pull/3470
---

# Charts: emphasis on purpose, never by accident

why now   — the owner, 2026-11-23: a red slice "draws the eyes and makes it seem like the slice seem more significant than it is" (false emphasis; preattentive salience). Under `marks: pigment`, slot 1 is the palette's accent, so the FIRST series always shouts, whatever the story: on Annual Report (burgundy) Germany is red because it is first. `marks: tone` avoids that (one hue, no accidental pop) but its pale steps fade on dark slides. No chart kind but map and roadmap has a way to emphasize one mark.
where     — the chart family (`lib/plugins/chart-family/`, `tools/build-marks-css.js`, each kind's manifest), the palette contract (`lib/theme/derive.js`, the `--chart-cat-N-*` tokens), `engineering/chart-styling.md`.
done when — (1) an author can mark the one series, bar or slice that carries the point, and every other mark recedes to a neutral ("gray first, then color where it matters"), on every categorical chart kind, in light and dark, at 3:1; (2) categorical slots carry roughly equal visual weight (similar lightness and chroma), so no slot pops by position alone, measured per built-in palette; (3) the decision is recorded under `engineering/decisions/`.
