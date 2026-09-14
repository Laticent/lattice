- The k-of-N rail on a coverless `split-panel` split page is legible on every field it lands on.
  The rail draws in `currentColor` — the section's canvas ink — and the bottom-right corner it
  sits in is not always the light column. Three things decide which field is there: `mirror`
  reverses the row so the corner becomes `.panel-left`; `metric` inverts the panels so an
  unmirrored page's corner is the DARK one; and an insetting Form frame lifts both panels off the
  corner entirely, leaving the frame's own canvas. The rail now takes the ink of the field it
  lands on, from the same token table the layout's header and footer already use.
  **Swept 33 palettes × 19 configurations, measuring EVERY segment of the rail rather than the
  first: 5,643 cells, 3 under the 3:1 that WCAG 1.4.11 asks of a meaningful graphical object,
  floor 2.97:1.** An earlier sweep reported 627 cells and a 5.11:1 floor; it took
  `querySelector('.seg')`, and `auto-split.js` marks segments `0..k` as `on`, so segment 0 is
  always the opaque one — the sweep had never measured the 0.7-alpha OFF pills at all. The three
  remaining cells are `cuoio | steps mirror`, where the corner is `--bg-alt`; that is the rail's
  own shared alpha rather than this layout's ink choice, and is recorded in the decision note.
