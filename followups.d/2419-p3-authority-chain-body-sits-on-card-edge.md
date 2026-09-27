---
origin: 2419
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2419
---

# authority-chain: the body line sits on the card's bottom edge.

Found while rendering the legal layouts for the card-tag audit (PR #2419). It is
pre-existing and not on that PR's path, so it is logged here rather than fixed there.

```text
  P3 · [no ticket] authority-chain body line has no bottom padding.
       why now   — in the committed gallery (authority-chain.gallery.light.pdf,
                   slide 2, default variant) each card's gloss line ("Congress,
                   1998 — …", "$245M consent order — …") touches the card's
                   bottom border. The STATUTE/REGULATION label is vertically
                   centered, the body is not, so the card reads as cropped.
       where     — lib/components/legal/authority-chain/authority-chain.styles.css
                   (card padding / row alignment).
       done when — the gloss line clears the bottom border by the same inset
                   as the top, at laptop and hall venue.
       evidence  — before/after raster of gallery slide 2, light and dark.
       verify    — observed at 90 dpi in a raster, not measured; measure the
                   gap with tools/pixel-check.js before fixing.
```
