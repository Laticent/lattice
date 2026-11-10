---
origin: 2466
priority: P3
recorded: 2026-11-10
area: engine
severity: medium
swimlane: engineering/mermaid.md
deferred: off-path — pre-existing on main at 3603bc7 (Mermaid 11.17.2); the Mermaid 12 bump draws it identically
---

# An edge between two nodes inside one subgraph does not show

```text
  P3 · [no ticket] an edge inside a subgraph is drawn and then hidden
       why now   — found while building examples/mermaid-12.md: in `flowchart LR` with
                   `subgraph Intake  A --> B  end`, the A→B arrow is in the SVG (`L_A_B_0`, a
                   real `d=`) but not visible on a dark slide (light not yet checked). The edge between the
                   two subgraphs does show. Rendered the same deck on main and on the Mermaid 12
                   branch: identical, so the bump did not cause it.
       where     — likely paint order: the cluster's filled rect painted over the edges of the
                   nodes inside it, either Mermaid's nested `g.root` order or a fill in
                   lib/plugins/mermaid/mermaid.styles.css / mermaid-theme-map.js.
       done when — the A→B arrow inside a subgraph shows on light and dark slides, with a test
                   that reads the drawn order (or the computed fill) rather than a picture.
       evidence  — the two-subgraph flowchart above, before and after, light and dark.
       verify    — tier 0 gates; look at the diagram gallery's subgraph slides.
```
