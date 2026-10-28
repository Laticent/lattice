---
origin: 2956
priority: P3
recorded: 2026-10-28
area: website
severity: low
swimlane: engineering/decisions/2026-10-28-home-positioning-audit.md §10
source: https://github.com/Laticent/lattice/pull/2956
---

# The comparison page says our PowerPoint export is not text-editable

```text
  P3 · [no ticket] make the PPTX claims agree across the site
       why now   — the home page's new "pitch" room tells sales teams any deck exports to
                   PowerPoint. A sales lead who clicks through to /comparison reads that our
                   PPTX is "not text-editable" (comparison.astro ~213), and pipeline.md ~827
                   says an editable-text variant "isn't implemented", but `--editable` (Calco)
                   ships (pipeline.md ~242). Found by the red-team round on PR 2956; it predates it.
       done when — comparison.astro and pipeline.md describe the editable export as it ships,
                   and the pitch card may then say "editable PowerPoint".
```
