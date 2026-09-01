- **Fixed: a `decision` card distributes its height at landscape, not just at square.**
  `justify-content: safe center` was stamped for the square, tall and strip families and left
  off wide, so the one family most decks use pinned the justification to the top of a card the
  row had already stretched to full height — 55% of a tinted panel empty below the text. The
  declaration moved to the base card rule; square, portrait and story render byte-identical.
- **Fixed: every `matrix-2x2` quadrant centers its content instead of top-pinning it.** A
  quadrant's height is definite in every family, and the card declared no `justify-content`, so
  36–43% of each one sat empty below the label and items. The card now distributes that height
  at wide, square, tall and strip alike.
- **Fixed: an autosplit page keeps a stat a tile rather than blowing it up to fill the stage.**
  The generic split rules fill a lone member on the premise that every such card is a wrap-flex
  row; a stat tile is a nowrap flex column, so the `align-content: center` paired with that fill
  did nothing and the tile stretched to the whole page with its number at the top. A portrait
  deck that autosplits one stat per page went from 52.7% of the tile empty to 0.9%.
- **`list-tabular` was reported as a fourth case and is not a defect.** Its ledger box
  distributes its height exactly (zero trailing slack on every slide measured); a row's figures
  baseline-align with the first line of the label, as a ledger should. The reported 63% came
  from a measurement that skipped the body column because its wrapper is `display: contents` and
  therefore has no client rects.
