---
origin: 2420
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2420
---

# the Read · Article view drops every slide's Key Insight and below-note

why now   — found fixing chart panes in the article view (PR #2420): a plain content slide ending in
            `> The key insight line.` projects to its heading and its list, and the insight is
            gone; a panes slide loses it the same way. `lib/core/coda.js` lifts the trailing
            key-insight panel and below-note into a `.cell-coda` cell BESIDE `.cell-stage`, and
            `projectDeckToProse` reads only the stage (`stageOf`). The speech projection had the
            same blind spot and was fixed for it (see "The CODA, spoken" in
            lib/transformers/prose-projection.mjs); the prose projection never was. 52 of 156
            committed decks carried a blockquote when that was measured.
where     — lib/transformers/prose-projection.mjs (`projectDeckToProse`, and the coda helper the
            speech side already has); the article hosts' CSS for a closing insight
            (lib/export/player-core.mjs, docs/src/components/studio/article-projection.ts).
done when — a slide's Key Insight and below-note appear in the article after its body, once, and
            a layout that claims its trailing block (`coda.claims`) is not printed twice.
evidence  — `--player`, Read · Article, on examples/panes.md and test/integration/baseline-decks/
            gallery.md slide 21 (key insight + below-note), before and after.
verify    — tier 0 gates plus the prose-projection tests, because it is one projection kernel.
