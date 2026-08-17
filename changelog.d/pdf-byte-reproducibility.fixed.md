- **Rendering a deck twice now produces byte-identical PDFs.** The exported PDF
  carried the wall clock in `/CreationDate` and `/ModDate`, so a re-render with
  no visual change still wrote a whole new file — four differing bytes in 1.5 MB
  was enough for git to store a fresh copy of every golden a cross-cutting CSS
  change touched. Both timestamps are now pinned, and
  `SOURCE_DATE_EPOCH` overrides the pinned instant if you want a real date.
  Covers the vector path, `--raster`/`--paper`, and the `--notes` / `--present` /
  `--embed-source` post-passes.
