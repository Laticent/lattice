- **`{LABEL}` in inline code renders as a pill, anywhere in any deck.**
  `` `{STABLE}:c2` `` draws a capsule; `:tag` `:tag-bordered` `:chip` `:circle`
  `:chevron-right` `:chevron-left` `:diamond` pick the shape, `:c1`–`:c12` pick an
  ordinal categorical slot (not a color — the same slot is sky blue on `indaco` and
  deep red on `burgundy`), and `:sm` / `:lg` scale it from the type. Modifier order is
  free. Shape and color now belong to the VALUE, so one ledger can carry four different
  statuses without a variant class on the slide — which is what five of `list-tabular`'s
  eight variants were doing, none of which ever moved a grid cell.
- **Nothing existing changes.** A pill needs a brace pair whose label is trimmed and
  comma-free; every other inline code stays literal, including `` `[x]` ``,
  `` `[data-mark]` ``, `` `{ ok, scene }` `` and `` `getUserId()` ``. Measured across all
  12,493 single-backtick spans in the repo: zero render differently. An unknown modifier
  (`` `{X}:c13` ``) falls back to literal rather than being ignored, and double backticks
  force the literal for a label that would otherwise qualify.
- **The four state markers are reserved inside `{}`.** `` `{x}` `` `` `{-}` `` `` `{/}` ``
  and `` `{ }` `` render literal, with a `lint:deck` suggestion pointing at the bare
  `- [x]` form. Without the reservation `{x}` drew a capsule pill containing the letter
  `x` — not an obvious no-op but a plausible-looking wrong artifact — and the four
  behaved three different ways, since `{ }` already fell to literal on the space.
- **Fixed before release: a pill in a `list-tabular` row was not placed at all.** Every
  placement rule in that component selects `code` — the element — so a pill auto-placed
  into the first free cell instead. Measured on a row carrying both a `` `META` `` and a
  pill, the pill landed in the label column and shoved the row name out to the counter
  column at x=0. A pill now takes the same cell its variant gives a `code`, and a census
  test fails if a future variant places a code without placing a pill.
