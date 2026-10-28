---
origin: 2941
priority: P6
recorded: 2026-10-28
area: chart
severity: low
swimlane: engineering/decisions/2026-10-26-playground-anti-pattern-slide.md
---

# Gallery variant footers paste the manifest's whole summary and clip

```text
  P6 · [no ticket] cap the caption `build-component-docs.js` injects into a gallery footer
       why now   — fixing the waterfall stress slide (2941-p2) showed the footer on its `zoom` and
                   `lower-is-better` slides prints "<name> — <whole summary>" and ends in an
                   ellipsis: the export reports CONTENT CLIPPED on pages 3 and 4. Read from
                   tools/build-component-docs.js lines ~603 and ~616; other components with long
                   variant summaries are likely the same (not counted).
       where     — tools/build-component-docs.js, the `footer` built from `vd.summary` / `stress.summary`.
       done when — a footer prints whole or is cut at a sentence on purpose, for every component;
                   the waterfall gallery reports no CONTENT CLIPPED.
       evidence  — `node dist/lattice.js <gallery>.md out.pdf` on waterfall before and after.
       verify    — render every gallery and compare the CONTENT CLIPPED count with main.
```
