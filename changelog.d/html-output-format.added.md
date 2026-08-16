- **Added: `.html` is a real output format — `lattice deck.md out.html` now writes
  HTML.** It previously fell through the format switch to PDF, so that command wrote
  **PDF bytes into a file named `.html`** and put the actual HTML in a second
  `out.html.html`. The rendered HTML was always produced as a sidecar of every render;
  the only thing missing was a way to ask for it without also paying the PDF encode.
  Measured on a 58-slide deck (medians of 3), the `.html` render takes 6.77s
  against the `.pdf` render's 8.24s. **The saving scales with the deck** — about
  18% there and 20% on the chart gallery, but under 1% on a one-slide deck, where
  browser startup dominates and there is barely any PDF to encode.
- **This is still a full browser render, not a browser-free one.** Auto-split and the
  overflow/legibility passes measure laid-out DOM, and the written file is their
  post-split result — an `.html` render pages identically to the same deck's `.pdf`.
  What it skips is the PDF encode and the PDF-only SVG rasterization pass. For markup
  without layout, call `lib/engine` directly instead.
- **`--player` and `--fluid` are the best reason to use it**: they build the viewer
  at the requested `.html` path, where previously they forced a full PDF encode and
  a megabyte-plus artifact nobody asked for. That win holds at any deck size.
- `--notes` writes `deck.notes.txt` rather than `deck.html.notes.txt`, and
  `--strip-notes` scrubs that sidecar exactly as it does on the PDF path.
  `--raster`, `--paper`/`--orientation`, `--present` (including the `present: true`
  front-matter form) and `--embed-source` are PDF-only and now say so instead of
  going silent.
- A failed `.html` render leaves **no** file, like every other format — it no longer
  strands a complete-looking pre-split document at the deliverable path.
