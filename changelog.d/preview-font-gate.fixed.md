- Preview frames no longer re-solve their layout when the web fonts arrive. Every
  engine `@font-face` is `font-display: swap`, so a preview document laid out once
  against fallback metrics, painted, and shifted when the real face landed — with
  nothing to report it, because the slide box is pinned to its `@size` and no fit
  or overflow channel fires. All three preview builders (the Studio/Playground
  filmstrip, the Present stage window, and the landing-page and specimen islands)
  now hold their existing reveal until the document's own faces have settled.
  Measured on `/playground/?view=edit` with a `list` + `cards-grid` deck: a reader
  saw two layouts, at 197ms and 517ms, with the worst text run moving 330.3px
  between them — now one. Warm-cache reveal cost is ~30ms; a face fetch that never
  answers reveals anyway after 1.5s, so a dead font can cost a shift but never a
  blank preview.
- The desktop print path waits for that gate rather than a fixed 450ms beat before
  opening the print dialog. This is hardening, not a bug fix, and the measurement
  says so: driving the real Share → Print deck → Print with faces on a 600ms link,
  `.lattice` computed `visible` at the instant `print()` was called *with the wait
  removed as well*, because the reveal lands before the frame's `load` event; with
  faces hung, `load` never fires and nothing prints on either arm. What the change
  removes is a latent coupling — the print path's correctness rested on "the reveal
  happens before `onload`", which is incidental rather than guaranteed, and
  `buildSrcdoc` hides `.lattice` until that reveal, so losing the race would print
  blank pages into a file the author keeps.
