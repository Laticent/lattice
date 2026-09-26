---
origin: 2388
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2388
---

# A fabricated finish that bakes a dim AND a clearance draws a dark wedge in poppler

Found while building the `backdrop:` register (#2388), not caused by it.

```text
  P2 · [no ticket] Baked dim + baked clearance → poppler wedge.
       why now   — any saved finish with Fabricate Strength < 100% and "Clear behind
                   content" both on exports a PDF that Evince / Okular / pdftoppm draw with
                   a large dark wedge across every slide. PDFium (Chrome) draws it clean.
       where     — lib/base/base.finish.css: `.backdrop { opacity: var(--fin-backdrop-strength) }`
                   wraps the hard-edged `.backdrop-mask` in a transparency group. Repro on a
                   minimal page: nested mask + group opacity → wedge; no group → clean.
       done when — a baked dim is drawn as the flat canvas veil (`--backdrop-dim-scrim`, the
                   mechanism #2388 uses for register steps) instead of group opacity, for
                   every finish slide, and the rasterized PDF of such a finish is clean in
                   poppler and unchanged in PDFium.
       evidence  — pdftoppm raster of a finish baking strength 0.6 + clearance, before/after.
       verify    — tier: export sign-off (changes exported bytes of existing saved finishes).
```
