---
origin: 2816
priority: P2
recorded: 2026-10-20
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-19-universal-legend.md §18
source: https://github.com/Laticent/lattice/pull/2816
---

# Mermaid's legend rules paint every `.legend` group on a slide

```text
  P2 · Scope Mermaid's `.legend text` rules to Mermaid diagrams
       why now   — mermaid.styles.css paints `:is(section, figure)
                   .legend text` and `.legend tspan` with
                   `--cat-on-fill !important` (lines ~618 and ~797).
                   The legend plugin's lane is a `.legend` group, so
                   its words and marker digits took Mermaid's ink;
                   on #2816 a light-mode marker digit came out dark
                   on a deep fill (1.7:1) until legend.styles.css
                   answered with its own !important
       where     — lib/plugins/mermaid/mermaid.styles.css; the
                   legend plugin's lane group in legend-svg.js
       done when — the Mermaid rules match only Mermaid's own SVG,
                   and legend.styles.css drops its !important
       evidence  — computed fill of a lane digit and a lane word in
                   Chrome, before and after, light and dark
       verify    — a Mermaid journey and venn legend render
                   unchanged (golden-diff), and the legend demo deck
                   keeps its digit contrast
```
