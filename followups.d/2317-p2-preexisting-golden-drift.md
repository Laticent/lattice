---
origin: 2317
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/issues/2317
---

# 50 regression goldens already drift on `main` (found while blessing #2317)

`node tools/regression-gate.mjs` on `main` at `6110a1e` (reverted #2317 lib/ changes, same machine)
reports these goldens as DRIFT. #2317 did not bless them. Most are chart, state-chart,
social/portrait and token-contrast decks, which suggests a recent chart change (for example
#2312's axis grammar) landed without re-blessing, or an environment difference. Two goldens
blessed in #2317 (`compliance-audit-report`, `baseline-decks/gallery`) also carried a smaller
part of this drift, so that part is now baked into their new goldens.

done when — `node tools/regression-gate.mjs` on `main` reports no drift for every name below,
each either fixed at the source or re-blessed with the change that explains it.

- `examples/adaptive-sizing`
- `examples/adaptive-sweep`
- `examples/anima-chart`
- `examples/chart-detail-reveal`
- `examples/chart-explain-narration`
- `examples/chart-family-all-svg`
- `examples/chart-hue-collapse`
- `examples/chart-legends`
- `examples/claim`
- `examples/counter-baseline-alignment`
- `examples/global-south`
- `examples/kanban-chart-redesign`
- `examples/legend-below-portrait`
- `examples/light-dark-scheme-fixes`
- `examples/map`
- `examples/math-split-structure`
- `examples/pie-detail-notes`
- `examples/portrait-gantt-statechart`
- `examples/portrait-prose-deboost`
- `examples/portrait-roadmap`
- `examples/print-mode`
- `examples/read-across-carousel`
- `examples/social-mobile`
- `examples/social-portrait`
- `examples/social-square`
- `examples/social-story`
- `examples/split-decision`
- `examples/state-chart-branching`
- `examples/state-chart-stress`
- `examples/state-chart-tint`
- `examples/state-chart`
- `examples/state-marks`
- `examples/svg-native-pie-legend`
- `examples/table-outer-edge`
- `examples/token-contrast/ardesia`
- `examples/token-contrast/atelier`
- `examples/token-contrast/brina`
- `examples/token-contrast/burgundy`
- `examples/token-contrast/carbone`
- `examples/token-contrast/concrete`
- `examples/token-contrast/crepuscolo`
- `examples/token-contrast/cuoio`
- `examples/token-contrast/indaco`
- `examples/token-contrast/laguna`
- `examples/token-contrast/magnolia`
- `examples/token-contrast/mustard`
- `examples/token-contrast/onyx`
- `examples/universal-tokens-p6-chart-cat`
- `examples/word-cloud-portrait`
- `exemplars/academic/conference-talk`
