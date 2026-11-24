---
origin: 3496
priority: P2
recorded: 2026-11-23
area: diagram
severity: medium
swimlane: engineering/mermaid.md
deferred: blocked — both halves need something a stylesheet cannot see. The ink: the right one depends on a color the author chose (a lint rule's job). The sketch fill: Mermaid hands an author's classDef to rough.js as plain attributes and marks the node only with the author's class name, which CSS cannot tell from Mermaid's own, so the bake must tag author-styled nodes. Both are pre-existing, and #3496 leaves both no worse than main (measured below)
source: https://github.com/Laticent/lattice/pull/3496
---

# A flowchart classDef that sets a fill but no color has unreadable text in dark

```text
  P2 · [no ticket] steer authors to pair a node fill with its ink
       why now   — the #3496 maker-checker rendered `classDef pale fill:#fff7d6` on cuoio dark:
                   the label takes the canvas ink, rgb(250,247,242), on the author's pale
                   fill, about 1.05:1. Same on main. The sketch look also paints over an
                   author's classDef fill: rendered on cuoio, `classDef risk fill:#fde2e1`,
                   main paints the node lavender (the category cycle) and #3496 paints the
                   accent tint; both keep the author's ink. Same override, no worse.
       where     — lib/authoring/lint-core.js (a warn rule for a Mermaid classDef/style with
                   `fill:` and no `color:`); lib/plugins/mermaid/mermaid.bake.js (tag a node
                   whose classDef/style sets paint, e.g. data-author-paint) and then the
                   rough-node rules in mermaid.styles.css skip a tagged node
       done when — lint:deck warns on a fill-without-color classDef with the fix; a sketch
                   flowchart keeps an author fill
       evidence  — the warning on a fixture deck; renders of both cases in light and dark
       verify    — a lint-core unit test with a failing arm; a render test on cuoio dark
```
