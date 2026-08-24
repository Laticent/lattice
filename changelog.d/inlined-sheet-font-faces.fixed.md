- **Fixed: every export stopped issuing 37 doomed font requests per navigation.** A
  stylesheet's relative `url()` resolves against the stylesheet, and the export inlines
  `dist/lattice.css` into the deck document instead of linking it — silently rebasing its
  37 self-hosted `url('fonts/…woff2')` faces onto the output directory, where all 37
  404ed. Measured on a real sidecar: 74 declared faces, 37 `loaded` and 37 `error`. Type
  was never wrong (each doomed face had a working twin — the base64 block, or KaTeX's
  `<link>` — and the browser fell back within the family group), so nothing showed. The
  inlined copy now drops a face the document already supplies and leaves everything else
  byte for byte: 37 failed requests → 0, and ~21 ms per navigation.
