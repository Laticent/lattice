---
origin: 2742
priority: P3
recorded: 2026-10-16
area: diagram
severity: low
swimlane: engineering/decisions/2026-10-15-bridges-and-two-hosts.md
source: https://github.com/Laticent/lattice/pull/2742
---

# A Mermaid pie draws small, with legend text too small to read

```text
  P3 · On examples/a11y.md slide 5, Mermaid's own pie fills about a third of the content area
       and its legend labels render at roughly 6px on a 1280px slide, well under the type floor.
       why now   — first noticed on the Export-to-Marp render, then compared: Lattice's own
                   render (examples/a11y.pdf, page 5) is identical, so it is not a bridge loss
                   but how Lattice sizes a Mermaid pie. It surfaces in every export of a deck
                   that uses one.
       where     — lib/plugins/mermaid (the pie's sizing and legend font); compare the
                   chart-family pie on slide 4, which holds the floor.
       done when — the pie fills its slot like the chart pie beside it, and its legend text is
                   at or above the deck's type floor, in Lattice's render and the Marp bundle.
       evidence  — rendered PDFs of examples/a11y.md, before and after, via SendUserFile;
                   tools/pixel-check.js on slide 5.
       verify    — tier 1 checker, because it changes a shared Mermaid sizing path every pie
                   deck renders through.
```
