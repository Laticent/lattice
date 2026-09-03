- The tools that answer "what visually changed" no longer drop the worst pages. ImageMagick's
  `compare -metric AE` prints a changed-pixel count over 1,000,000 in scientific notation
  (`1.15966e+06`), and both copies of the parse tested for a bare integer and fell back to
  zero — so a page differing by more than a million pixels was recorded as IDENTICAL by
  `golden-diff`, the regression gate and `npm run preview`. The worse the drift, the more
  likely it vanished. Measured on `examples/gallery-jargon.pdf`: page 12 (976,578px) was
  reported, page 17 (1,159,660px, a quarter of the page) was not. An unreadable count is now
  `-1` — the sentinel every caller already treats as changed — rather than zero.
