- A coverless `split-panel` split page places its wayfinding marks instead of laying them out in
  the panel row, and reserves what they cover. The section IS that layout's flex container, so
  the forward pointer arrived as a flex ITEM of it: a column at portrait, where it landed on the
  k-of-N rail and the running footer's ink, and a third COLUMN at square, where it squeezed the
  right panel from half the slide to 252.7px and ran 53px past the slide edge. It is now
  positioned in the band, with the reserve inside BOTH panels on every page of the run so the
  panels keep their full bleed at every size. The reserve REPOSITIONS content that fits — which
  is what stops a run's last page (no forward pointer) sitting 31-44px off its siblings, and what
  puts the reserve on the right column under `mirror`, which row-reverses them. It does not hold
  OVERFLOWING content out of the band and cannot, since `.panel-right` clips at its padding box;
  those pages are flagged `overflow` by the engine. An earlier `:not(.form)` on the rule left an
  authored `form` page with every one of the original defects intact.
- A stray `<` in a fenced block no longer loses the rest of the block. It was routed to the TAG
  branch of the line slicer, which pushed a stack frame with no tag name, so every later line
  break emitted `</undefined>` and most of the block vanished from the rendered page. (How much
  depends on where the page boundary falls relative to the `<`: three reconstructions measured 7,
  22 and 26 of 30 lines, which is why no single figure is quoted.)
- A loose list's `<p>` wrapper comes off BOTH halves of a member, not just the title; a title
  containing `<pre>` unwraps too (the "only one paragraph" test was a substring search); and an
  EMPTY wrapper is left alone, because peeling it to `''` turns a member that survived into one
  the readers drop.
