- Every page of a split run now carries the footer band its layout was missing. A "sovereign"
  layout — `split-panel`, `premise` — suppresses the footer Cell, which is right for a standalone
  slide and wrong for a run: a run is multi-page and needs wayfinding. Without the Cell every
  mark fell back to section level, and on `split-panel`, whose section IS the panel row, the
  forward pointer became a third COLUMN that squeezed the content panel from 450.9px to 252.7px
  at `square` and ran off the slide. The page number, the k-of-N rail and the forward pointer now
  dock in the band on every page of a run, as they already do on every other layout. The run's
  caption is unchanged: still said once, on the page that opens the run.
- A split page's overflow is visible to the engine again. The band is reserved on the SECTION, so
  a content cell's box genuinely ends above it and content that exceeds the cell is ordinary
  overflow — warned, and tagged "Content clipped" where it clips. Measured: `.panel-right` shrinks
  936.1px to 835.5px at portrait and three previously-silent pages of a test deck now report.
  **The band costs roughly 12% of the panel's height at portrait**, which is the same price every
  other layout pays for its footer, and a long run may split one page further because of it.
