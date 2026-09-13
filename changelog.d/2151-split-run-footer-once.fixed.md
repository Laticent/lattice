- A split run now says its slide's own `_footer:` caption **once**, on the page that opens the
  run, instead of repeating it on every page. A run is one slide unfolded, so the caption belongs
  to the run — the same argument the 2026-09-01 chrome ruling made about the deck frame, one level
  down. It is also what clipped: the caption lands in the shared Form footer band, whose budget is
  one line. Measured on `split-panel cat-1` at portrait, the authored slide fits unsplit and all
  three of its split pages clipped; the shipped `split-panel` gallery went from 30 clipped pages
  to 11. The page number and the k-of-N pill rail still ride every page.
