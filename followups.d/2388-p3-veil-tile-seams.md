---
origin: 2388
priority: P3
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2388
---

# Poppler draws faint gray seams on a dimmed slide that also has a mask

```text
  P3 · [no ticket] Veil seams in poppler on masked, dimmed slides.
       why now   — with a mask on (clear or spotlight), a strength below 100% is drawn as a flat
                   canvas veil. Poppler draws 1px gray (153,153,153) seams at the finish
                   texture's tile boundaries on those pages (examples/backdrop-register.pdf:
                   1,858 px at 100 dpi). PDFium and Ghostscript draw none. Group opacity has
                   no seams but wedges around a mask, so neither drawing is clean in poppler.
       where     — lib/base/base.finish.css § BACKDROP REGISTER (the veil); poppler's handling
                   of a soft-masked shading over a tiled pattern.
       done when — a dimmed + masked slide rasterizes seam-free in pdftoppm and unchanged in
                   PDFium, e.g. by pre-mixing the dim into the finish colors instead of a veil.
       evidence  — gray-pixel count of pdftoppm -r 100 before/after.
       verify    — tier: export sign-off.
```
