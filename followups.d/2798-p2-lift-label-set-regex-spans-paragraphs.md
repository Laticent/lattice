---
origin: 2798
priority: P2
recorded: 2026-10-19
area: chart
severity: low
swimlane: engineering/decisions/2026-09-20-heatmap-table-authoring-label-sets.md
source: https://github.com/Laticent/lattice/pull/2798
---

# liftLabelSet's paragraph regex can span paragraphs and match <pre>

```text
  P2 · liftLabelSet's regex can run across paragraphs and open on <pre>
       why now   — the checker on #2798 found it in liftLegends, which copied the
                   regex; liftLegends was fixed in that PR. liftLabelSet keeps the
                   old form: `<p[^>]*>` matches `<pre>`, and the lazy body runs
                   from a paragraph that starts with code to a later set's
                   closing tags, so a set after such a paragraph is not lifted.
       where     — lib/core/lift-label-set.js `liftLabelSet` (reuse the regex
                   liftLegends uses)
       done when — a label set after `x` is a variable, or after a fence, is lifted
       evidence  — a unit arm for each shape; galleries byte-identical
       verify    — tier 1 checker
```
