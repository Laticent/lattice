---
origin: 3232
priority: P7
recorded: 2026-11-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-16-status-triplets.md §4
deferred: off-path — the finish compositor's print and export face, which the relative-color guard fixes do not touch; it is generated from lib/finishes/ and needs its own fallback design
source: https://github.com/Laticent/lattice/pull/3232
---

# The finish's opaque face drops its fades in Safari 17 exports and prints

```text
  P7 · [no ticket] the finish's opaque face fades through a relative color with no guard
       why now   — Found while guarding the four WebKit 17 rules (P1 of the status-triplets
                   continuation). Every full-bleed fade on the opaque face ends on
                   `rgb(from var(--fin-canvas) r g b / 0)` (lib/finishes/finish-generate.js
                   fadeClear; base.finish.css --fin-edge-opaque and the mesh layers). In
                   Playwright 1.44's WebKit 17.4, CSS.supports('color', 'rgb(from light-dark(red,
                   red) r g b / 0)') is false and the plain-origin form is true, so where
                   --fin-canvas resolves to a light-dark() token the gradient goes invalid and
                   that layer drops. The opaque face applies under @media print and
                   .lattice-exporting, and the Studio's in-browser export adds that class
                   (docs/src/components/studio/export/deck-export.js), so a Studio export or a
                   print from Safari 17.5-17.6 can lose finish layers. The CLI's PDF export
                   runs in Chromium and is unaffected. Not yet seen on a real export.
       where     — lib/finishes/finish-generate.js fadeClear('opaque'), and the generated
                   region of lib/base/base.finish.css.
       done when — the opaque face has a value WebKit 17.4 computes (for example a guarded
                   `transparent` fallback, accepting its gray fade in a PDF rasterizer), and a
                   Studio export and a print preview in WebKit 17.4 keep every finish layer.
       verify    — getComputedStyle(section, '::before').backgroundImage under
                   .lattice-exporting in WebKit 17.4 and in Chromium.
```
