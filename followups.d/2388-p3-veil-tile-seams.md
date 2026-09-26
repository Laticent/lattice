---
origin: 2388
priority: P3
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2388
---

# Poppler draws gray tile seams on any dimmed textured finish, at some zoom

```text
  P3 · [no ticket] Poppler tile seams under a dimmed finish.
       why now   — any strength below 100% over a tiled finish texture seams in poppler
                   (Evince, Okular, pdftoppm): 1px gray lines at the tile boundaries. Group
                   opacity (a finish's own baked strength, as on main) seams at thumbnail zoom
                   (≈40–72 dpi) and is clean at 100; the flat veil (register steps, masks)
                   seams at 100 dpi and at 40, clean at 50–60. PDFium and Ghostscript draw
                   neither. Measured on #2388; not introduced by it (main's baked strengths
                   already seam at low zoom).
       where     — lib/base/base.finish.css § BACKDROP REGISTER; poppler's handling of a
                   transparency group or soft mask over a tiled pattern.
       done when — a dimmed slide rasterizes seam-free in pdftoppm at 40, 60 and 100 dpi and
                   unchanged in PDFium, e.g. by pre-mixing the dim into the finish's colors
                   instead of drawing it as a layer.
       evidence  — gray-pixel count of pdftoppm at 40/60/100 dpi before/after.
       verify    — tier: export sign-off.
```
