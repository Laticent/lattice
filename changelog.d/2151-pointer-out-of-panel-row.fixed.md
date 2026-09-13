- A coverless `split-panel` split page places its wayfinding marks instead of laying them out in
  the panel row, and reserves what they cover. The section IS that layout's flex container, so
  the forward pointer arrived as a flex ITEM of it: a column at portrait, where it landed on the
  k-of-N rail and the running footer's ink, and a third COLUMN at square, where it squeezed the
  right panel from half the slide to 252.7px and ran 53px past the slide edge. It is now
  positioned in the band, with the reserve inside `.panel-right` so the panels keep their full
  bleed at every size while their content stops above it. An earlier `:not(.form)` on that rule
  left an authored `form` page with every one of those defects intact.
- A stray `<` in a fenced block no longer loses the rest of the block. It was routed to the TAG
  branch of the line slicer, which pushed a stack frame with no tag name: every later line break
  emitted `</undefined>`, and 26 of 30 lines vanished from the rendered page.
- A loose list's `<p>` wrapper comes off BOTH halves of a member, not just the title; a title
  containing `<pre>` unwraps too (the "only one paragraph" test was a substring search); and an
  EMPTY wrapper is left alone, because peeling it to `''` turns a member that survived into one
  the readers drop.
