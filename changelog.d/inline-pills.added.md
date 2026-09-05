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
- **`` `[x]` `` in inline code draws the state disc, anywhere inline code can go.** The
  same four markers an author already writes bare at the start of a bullet — `[x]` `[-]`
  `[ ]` `[/]` — now work in a sentence, a heading, a table cell or a ledger row's
  trailing column. Brackets make a mark, braces make a pill: one vocabulary in two
  positions. `[ ]` takes the neutral open-ring reading inline. The mark names itself on
  `role="img"` + `aria-label`, putting no word in the document, and every `checks-*`
  style variant reaches it because it carries the same classes a checklist row does.
  Only the four exact forms dispatch — `` `[?]` ``, `` `[data-mark]` `` and `` `[0]` ``
  stay literal.
- **`stateClassesFor` is one kernel again.** The marker-to-semantic decision lived twice,
  in the markdown-it plugins and in the runtime, which is the drift HARD RULE #1 exists
  to stop. Adding the inline consumer forced the unification rather than a third copy;
  both originals import `lib/core/state-marks.js` now, and a test fails if one grows back.
- **The escape is a backslash, and it works on every render path.** `` `\{LIVE}` `` and
  `` `\[x]` `` render the literal with the backslash removed. It replaces a
  double-backtick escape that worked only on the engine path: marp-core renders
  `` `{LIVE}` `` and `` ``{LIVE}`` `` to the same `<code>`, so the runtime's DOM mirror
  could not tell them apart and converted both — a divergence the fidelity probe now
  pins. A backslash survives into the DOM, so both paths agree. It only escapes what
  would otherwise dispatch, so `` `\[a-z]` `` and `` `\d+` `` keep their backslash and
  a regex is safe. Fenced and indented code blocks were never affected — they are not
  inline code, so no directive is ever read inside one.
- **Pills and marks now clear the text either side of them.** Measured as the only
  mechanism without wrapping every one in a spacer element: on the same pill,
  `padding-inline` grew the chrome 58.9px to 73.3px and gave 0px of outside space, while
  a horizontal margin left the chrome alone and opened 5.59px. Horizontal only, and there
  is deliberately no vertical padding — these are atomic inline boxes, so block padding
  enters the line box and gives one line of a paragraph leading its neighbors lack
  (measured 75.6px to 82px). Vertical room stays the container's, through `line-height`.
