---
origin: 3389
priority: P6
recorded: 2026-11-21
area: theming
severity: low
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
source: https://github.com/Laticent/lattice/pull/3389
deferred: off-path — a type-set decision for the shipped presets; #3389 adds the corpus that found it
---

# Old-style figures make a hero number read low

On the preset corpus's kpi slide (slide 14), the display serif sets "14.2%" in old-style figures,
so the "1" and "4" sit lower than the "%" and the number reads as a typo at board distance. Judge
A of the second §8 round named it the worst flip-row slide of Classic and Minimal.

done when — hero numbers (big-number, kpi, stats) render with lining figures in classic and
minimal, or the owner decides old-style figures stay.
