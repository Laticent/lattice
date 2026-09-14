- The k-of-N rail on a coverless `split-panel` split page is legible on every field it lands on.
  The rail draws in `currentColor` — the section's canvas ink — and the bottom-right corner it
  sits in is not always the light column. Three things decide which field is there: `mirror`
  reverses the row so the corner becomes `.panel-left`; `metric` inverts the panels so an
  unmirrored page's corner is the DARK one; and an insetting Form frame lifts both panels off the
  corner entirely, leaving the frame's own canvas. Measured across all 33 shipped palettes and 19
  configurations, 627 cells: 90 fell under the 3:1 that WCAG 1.4.11 asks of a meaningful graphical
  object, bottoming out at 1.00:1 — a progress rail nobody could see. The rail now takes the ink
  of the field it lands on, from the same token table the layout's header and footer already use
  (`--on-dark-secondary`, `--on-accent`, `--cat-on-fill`, canvas ink for the light-panel variants
  and for the framed canvas). 0 of 627 cells under 3:1 after; worst cell 5.11:1.
