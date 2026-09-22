---
origin: 2246
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2246#issuecomment-5753518960
backfill: true
---

# Bake the Studio Read view's diagrams

Backfilled verbatim from the continuation brief on #2246 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

~~~~text
  P1 · [no ticket] Bake the Studio Read view's diagrams
       why now   — the view just shipped and shows raw ```mermaid fence source where the
                   player shows a rendered diagram; the most visible rough edge in the feature
       where     — docs/src/components/studio/article-projection.ts (projectDeckArticle, right
                   after buildDeckRender). The helper already exists: ex.bakeDeckSections, used
                   at docs/src/components/studio/share-export.ts:450, whose own comment records
                   that an un-baked export left "a wall of it where Read·Article should have
                   shown the diagram". Keep its fallback: a bake that cannot run must yield the
                   static render, never a failed view.
       done when — a deck with a mermaid fence, opened via ⌘K "Read as an article", shows the
                   drawing; with the bake stubbed to fail it still shows the article.
       evidence  — tools/screenshot.js @1440/820/390 of the Read view on a mermaid deck
       verify    — tier 0 gates, because it is one call inside an already-sanitized path with a
                   documented fallback and no new sink
~~~~
