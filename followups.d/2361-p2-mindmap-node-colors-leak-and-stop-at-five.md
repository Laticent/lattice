---
origin: 2361
priority: P2
recorded: 2026-09-25
---

# Mindmap nodes lose their branch color with rect shapes or a sixth branch

why now   — two gaps in `lib/integrations/mermaid/mermaid.css` scramble a mindmap's colors.
            (1) The sankey rule `g.nodes > g.node:nth-of-type(N) > rect` also matches mindmap
            nodes drawn as `rect` (the `[square]` and `(rounded)` shapes). It is more specific
            than the mindmap `.mindmap-node[class*="section-N"] rect` rule, so those nodes are
            colored by position and not by branch. (2) The mindmap rules stop at `section-4`,
            so a sixth branch's leaves fall back to `--cat-1-fill`. Found while building the
            big-picture slide of the agentic-practices deck, which works around both (hexagon
            leaves, five branches).
where     — `lib/integrations/mermaid/mermaid.css` §SANKEY and §MINDMAP.
done when — the sankey cycle is scoped to sankey SVGs only, and the mindmap rules cover
            `section-5` through `section-11`, as the band cycle already does.
evidence  — a diagram gallery mindmap with `[square]` and `(rounded)` leaves and six branches,
            rendered light and dark, each leaf matching its branch.
verify    — render `lib/components/diagram/diagram/diagram.gallery.md` and look at the page.
