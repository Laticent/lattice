- **A component's landscape veto survives a declined strategy.** Four strategies return "no" to
  ENFORCE a scope rather than because they failed to parse — `journey-stages` and
  `roadmap-horizons` keep the landscape board whole, `redline-blocks` keeps a single passage
  whole, `kanban-lanes` keeps a single-lane board whole. Those vetoes were being re-derived from
  the rendered DOM and overridden: at `size: square` a `journey` slide became a cover plus seven
  pages that repeated the whole board and differed only by one item of the MOOD LEGEND, on nine
  of the ten slides in its own gallery, and eight of `roadmap`'s. `redline annotated` was cut
  into three pages that carried the reasoning without the amendment it explains. Only the five
  cover readers, whose "no" really does mean "not my shape", fall through now.
- A run's engine `id` lands exactly once, on a `code` split with no heading. With a cover the
  cover holds it; with no masthead there is no cover, and the first body page now keeps it
  instead of the run emitting three pages and no anchor at all.
- An authored modifier survives a split whatever order it was written in. `data-split-mods`
  dropped the class list's FIRST token as "the layout", so `<!-- _class: cat-3 split-panel -->`
  stamped `split-panel` and dropped `cat-3` — the run reverted to the plain accent field, which
  is the defect the attribute exists to prevent. The layout is now read from the role string.
- A loose list — blank lines between items, ordinary authoring — reaches a split page correctly.
  markdown-it wraps each item in `<p>`, and that `<p>` was being placed inside the title's
  `<span>`, which is invalid and reparents the label out of its row.
- `obligation-matrix heat` reads the same risk axis split as unsplit. Two cascade defects, both
  measured in a real browser: folding the split-card selector in with `:is()` re-ranked every
  table rule and flipped `pass` to GREEN on the shipped UNSPLIT `heat` table, under a caption
  that reads "Red = applies"; and the universal `.heat` inversion is scoped to `td`, so the
  cards a portrait split emits kept the un-inverted mapping.
- `split-panel pullquote`'s coverless split pages place their wayfinding marks instead of
  stacking them. Both marks dock at SECTION level on a page with no footer row — and on this
  layout the section is the panel flex container, so the forward pointer arrived as a flex item
  of it. At portrait that put it in the bottom band, over the k-of-N rail (42.1×6.5px) and the
  running footer's ink (206.6×24.5px); at SQUARE the container is a row, so the same item became
  a third COLUMN, squeezed the right panel from half the slide to 252px and ran 53px past the
  slide edge. The pointer is now positioned in the band rather than laid out in the panel row,
  which also restores the panels' full bleed at every size.
