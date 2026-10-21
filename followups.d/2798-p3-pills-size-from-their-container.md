---
origin: 2798
priority: P3
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-19-universal-legend.md §15
source: https://github.com/Laticent/lattice/pull/2798
---

# Let an HTML pill size from its container, not only from the text around it

```text
  P3 · Container-responsive sizing for HTML pills
       why now   — the owner asked on #2798 for pills that respond to their
                   container. The heatmap's SVG callout markers now size from
                   their cell, but an HTML pill (lib/plugins/pills/pills.styles.css)
                   sizes only from its text: `min(0.85em, --lat-pill-base)`, or a
                   component's `--lat-pill-size`
       where     — pills.styles.css font-size rule; a container-query unit
                   (cqi) term behind the existing `--lat-pill-size` hook
       done when — a pill in a narrow container (a tile, a card) shrinks
                   with it, within a legible floor, and every deck that uses
                   pills in running text renders unchanged
       evidence  — golden diff across the pill galleries; tools/screenshot.js
                   at 1440, 820 and 390 widths
       verify    — owner review; this moves export bytes on every pill deck
```
