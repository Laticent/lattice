- The k-of-N rail on a `split-panel mirror` split page is legible again. The rail draws in
  `currentColor` — the section's canvas ink — and `mirror` row-reverses the panels, so the
  bottom-right corner it sits in is the PANEL rather than the supporting column. Swept across all
  33 shipped palettes and six variants: 52 of 198 cells fell under the 3:1 that WCAG 1.4.11 asks
  of a meaningful graphical object, bottoming out at 1.00:1 — a progress rail nobody could see.
  The mirrored rail now takes the ink of the field it lands on, from the same four-token table the
  layout's header and footer already use (`--on-dark-secondary`, `--on-accent`, `--cat-on-fill`,
  canvas ink for the light-panel variants). 0 of 198 cells under 3:1 after; worst cell 5.33:1.
