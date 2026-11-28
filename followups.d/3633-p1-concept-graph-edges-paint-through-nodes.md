---
origin: 3633
priority: P1
recorded: 2026-11-28
area: website
severity: low
swimlane: engineering/visual-review.md
deferred: off-path — the 3D edge z-order in the concept graph, not the subtitle contrast #3633 fixed
source: https://github.com/Laticent/lattice/pull/3633
---

# Concept-graph edges paint through the node cards

```text
  P1 · [no ticket] keep the concept graph's edges behind its node cards
       why now   — on /model/concepts/ the .cg-gedge divs (3D-transformed, preserve-3d) paint
                   over the .cg-gnode cards at most orbit angles: visible through Function,
                   Form and Tile in #3633's screenshots at every width. axe reads the overlap as
                   `incomplete: bgOverlap`, so the axe-site sweep cannot grade most nodes'
                   contrast, which is how #3633's 4.40:1 subtitle stayed hidden.
       where     — docs/src/components/model/ConceptGraph.astro (edge and node build + render()).
       done when — no edge paints over a card at any orbit angle or drill value, and an axe run
                   on the stage returns no bgOverlap for .cg-gnode.
       evidence  — before/after screenshots at 1440, 820 and 390px in both modes, plus the axe
                   incomplete list.
       verify    — tier 1 checker.
```
