- `mode: sketch` (and the legacy deck-wide `class: sketch`) now carries into Mermaid
  diagrams. Flowchart, state, class and ER nodes are drawn with Mermaid's native
  hand-drawn renderer, so a sketch deck no longer wraps a hand-drawn slide around a
  crisply machine-drawn diagram. Per-slide `_class: sketch` opts one diagram in on a
  plain deck; `_class: boardroom` opts one out of a sketch deck.
- The categorical palette survives the hand look: rough nodes cycle `--cat-N-fill`
  the same way classic nodes do. It goes on as a `stroke`, because a rough node has
  no fill — its "fill" is a bundle of stroked hachure lines.
- **Themes that carry categories by texture keep crisp shapes.** On `a11y-*`, `onyx`
  and `concrete` the per-category pattern is the redundant encoding a color-blind or
  monochrome reader depends on, and it cannot survive being painted through a stroke
  (it reads as speckle). Those decks still get the hand type everywhere; only the
  diagram shapes stay machine-drawn. This is not overridable per slide — style does
  not outrank an accessibility affordance.
- No change to any non-sketch deck: the engine emits no `look` key at all unless the
  slide resolves to hand-drawn, so an existing deck's Mermaid directive is
  byte-identical to before.
- Diagram LABELS still use the mono face under `sketch`. That is a separate,
  pre-existing gap in the diagram font path (`engineering/mermaid.md` §5.3), not
  something this change regressed.
