- **The committed demo and gallery PDFs are now written by the shared PDF writer.** Every
  `examples/*.pdf`, gallery PDF and golden was re-rendered in one pass, so the tree no longer
  mixes Chrome-printed and writer-made PDFs, and no later PR's golden diff reports the writer
  switch as its own drift. Page counts are unchanged (4963 pages over 429 files), and the
  set is 19% smaller (136.9 MB to 111.1 MB).
- **The CLI's PDF photo uses Chrome's normal PNG encoder again.** It had used the fast one, which
  made a flat deck's PDF about 2x larger. Tests still use the fast encoder (`node --test`, or
  `LATTICE_PDF_PHOTO_FAST=1`); the pixels are identical either way.
