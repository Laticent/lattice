---
origin: 2344
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2344
---

# The Studio's in-app Reading view renders every chart black or unstyled

why now   — the same symptom as #2344 on the Studio's own Read · Article view (⌘K → "Read as an
            article"), and a user who hits one will hit the other.
where     — docs/src/components/studio/ReadArticle.tsx + article-projection.ts. The view renders
            in the app's TOP-LEVEL document on purpose (reader-mode extraction), and its own
            READ_ARTICLE_CSS is all it ships. No deck stylesheet, so every chart rule and token
            is missing. It also lacks the player's structural `.lp-chart` / `.lp-spatial`
            container rules. The #2264 fix baked Mermaid only (`freezeTokens`), and only when a
            deck has Mermaid or function-plot.
done when — every chart family in lib/components/chart/chart.gallery.md paints in color in the
            Reading view in light and dark, verified by screenshot at 1440 / 820 / 390.
evidence  — measured 2026-09-24: radar, bar, heatmap and quadrant are solid black; kanban,
            progress and roadmap are unstyled text.
verify    — a design fork, so it goes to the owner first. Options measured so far:
            (a) bake in the capture frame: `flattenSvgStyles` covers the 13 SVG families, but
                the HTML flow charts (roadmap alone has 34 pseudo-element rules) cannot be
                inlined; (b) inject `flatCss` scoped to the article (for example `@scope`,
                with tokens on the figures, not the prose). This covers all families, but it is
                a new style sink in the top-level document (HARD RULE #22) and ~0.9 MB of CSS in
                the app; (c) Shadow DOM per figure hides the chart text from reader mode.
