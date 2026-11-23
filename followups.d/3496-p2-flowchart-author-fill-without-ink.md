---
origin: 3496
priority: P2
recorded: 2026-11-23
area: diagram
severity: medium
swimlane: engineering/mermaid.md
deferred: off-path — pre-existing on main (measured by deleting #3496's rules in the browser); the right ink depends on a color the author chose, which a stylesheet cannot read, so the fix is a lint rule, not this PR's CSS
source: https://github.com/Laticent/lattice/pull/3496
---

# A flowchart classDef that sets a fill but no color has unreadable text in dark

```text
  P2 · [no ticket] steer authors to pair a node fill with its ink
       why now   — the #3496 maker-checker rendered `classDef pale fill:#fff7d6` on cuoio dark:
                   the label takes the canvas ink, rgb(250,247,242), on the author's pale
                   fill, about 1.05:1. Same on main. The sketch look also paints over an
                   author's classDef fill (main painted the category cycle over it; #3496
                   paints the accent tint), leaving the author's dark ink on a dark field.
       where     — lib/authoring/lint-core.js (a warn rule for a Mermaid classDef/style with
                   `fill:` and no `color:`); lib/plugins/mermaid/mermaid.styles.css (the
                   rough-node rules, to skip a node whose shape carries an author fill)
       done when — lint:deck warns on a fill-without-color classDef with the fix; a sketch
                   flowchart keeps an author fill
       evidence  — the warning on a fixture deck; renders of both cases in light and dark
       verify    — a lint-core unit test with a failing arm; a render test on cuoio dark
```
