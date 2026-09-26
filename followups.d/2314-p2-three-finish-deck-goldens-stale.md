---
origin: 2314
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2314
---

# Three committed deck PDFs already differ from a fresh render

Found by the regression gate while the portable-packages continuation checked every committed
deck that uses a finish. For each deck below, a render with the CSS from before that change and
a render with the CSS after it are pixel-identical, so the drift came from an earlier merge, not
from generating the finishes. The continuation left the PDFs as committed so its diff carries only
its own changes.

```text
  P2 · Rebuild three stale deck goldens
       why now   — the golden a reviewer compares against no longer shows what the engine
                   renders, so a real regression on these pages is harder to see.
       where     — examples/dark-canvas-ownership.pdf (6 pages, worst 12.47%),
                   examples/spectrum-canvas-ownership.pdf (4 pages, worst 14.34%),
                   examples/marp-export-fidelity.pdf (1 page, worst 1.05%).
       done when — each drift is traced to the merge that caused it, judged intended, and the
                   PDF re-blessed (`node tools/regression-gate.mjs --scope decks --bless --only
                   examples/<name>`), or the regression it shows is fixed.
       evidence  — the regression gate green on the three decks.
```
