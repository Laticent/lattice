---
origin: 3232
priority: P4
recorded: 2026-11-19
area: theming
severity: medium
swimlane: engineering/decisions/2026-11-16-status-triplets.md §7
deferred: large — re-solving achromatopsia's light status ramp recolors every status mark on that palette, not just the risk matrix
source: https://github.com/Laticent/lattice/pull/3232
---

# Achromatopsia's light risk bands do not climb in order

```text
  P4 · [no ticket] the risk matrix on a11y-achromatopsia's light face reads out of order
       why now   — Found while building examples/risk-matrix-a11y-critical.md. Measured luminance
                   on the light face: medium 0.098, low 0.039, high 0.011, critical 0.006. Medium
                   is lighter than low, and high and critical sit 1.09:1 apart, so on a palette
                   that shows severity only by lightness the four bands do not read as a ramp.
                   It is on main before #3232 (the light arm of the critical step is unchanged).
       where     — themes/a11y-achromatopsia/a11y-achromatopsia.css --pass-mark / --warn-mark /
                   --fail-mark light arms; the critical step in tools/build-marks-css.js.
       done when — low < medium < high < critical in darkness on the light face, each step at
                   least 1.3:1, and every status mark on the palette still meets its contrast
                   contract (theme-surface-aa, the cvd trio floor).
       verify    — node --test test/unit/components/marks-css.test.js, with a light-face arm
                   added beside the dark-face one.
```
