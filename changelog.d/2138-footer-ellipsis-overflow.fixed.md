- **Fixed: a slide no longer reports itself as overflowing because a word in its footer is in
  backticks.** The frame's footer cell ellipsises a too-long line by design, but an inline
  element inside it (a `<code>`, a `<strong>`, an `<em>`) laid out past the cell's right edge and
  the overflow probe read that as the SLIDE overflowing. `over` drives autosplit, so a slide
  whose body fit perfectly was a candidate to be cut into a run: 28 of 71 pages on
  `split-panel.gallery.md` at portrait. A box that truncates its own line no longer contributes
  horizontal spill; it still raises the suspicion that gets the truncation reported to the
  author, and vertical spill out of such a box still counts.
