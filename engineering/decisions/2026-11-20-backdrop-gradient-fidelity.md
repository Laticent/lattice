---
status: in-progress
summary: Why a finish's backdrop looked dithered and blotchy in exported PDFs (a 1x JPEG photo of it, 81% of a finish deck's bytes), and what replaced it. The shared writer now draws the backdrop - glows as one computed, lossless, smoothly scaled picture; textures as paths; fades above them as opacity maps - and reads the finish's screen face. Smoother, closer to the screen on every slide measured, usually smaller, and drawn 14 to 35 times faster in Chrome's PDF engine than Chrome's own vector print. Awaits the owner's export sign-off.
---

# Backdrop gradient fidelity — the audit, and the build (2026-11-20)

**Asked.** The owner sees dithering in the backdrop gradient, suspects it also inflates the
slide's background image, and wants every surface to look better without bloating the files. The
earlier export decisions were made for file size and export portability, and the owner wants
them audited.

**Answer, first.** The dithering is not a property of the gradient. It comes from how the
shared PDF writer stores it: the backdrop rides in a **1x photo** of the slide (1280×720 at
96 ppi), and that photo is a **JPEG** whenever the slide is busy. JPEG cuts a gradient that
spans only 15–20 color levels into 8×8 blocks and stores color at half resolution, so the eye
reads it as blotches and grain. The fix that is both smoother **and** smaller is to stop
photographing the backdrop: draw it as a vector shading, as the writer already does for the
slide's top edge (`readSectionEdges`) and for SVG chart gradients (`write-pdf.mjs` `addShading`).

## 1. What each surface does today

| Surface | How the backdrop gets there | What it looks like | Measured |
|---|---|---|---|
| Studio, docs site, HTML player (Chromium) | live CSS | smooth: about 60 one-level steps across a 13% glow, almost no dither noise (0.09 mean deviation from a blur) | synthetic page, Chromium, 2026-11-20 |
| Same, Safari / iOS (WebKit) | live CSS | **UNVERIFIED.** The sandbox's network policy refused the WebKit download (`cdn.playwright.dev`) | — |
| CLI PDF and Studio PDF (shared writer) | in the slide's photo, **1x**, PNG if flat, else JPEG q90 4:2:0 | 8×8 blocks, cyan and lavender patches in a blue glow, soft texture lines | `finish-backdrops.md`: 15 photos, 9 of them JPEG, **407 KB of the 502 KB file** |
| `--chrome-pdf` (fallback) | Skia's vector shading | smooth; one-level steps where the viewer does not dither, sharp texture lines | same deck: **291 KB** |
| `.pptx` / `.odp`, picture mode | whole slide as one 2560×1440 picture | sharp, heavy | same deck: 3.1 MB, 15 pictures of 108–423 KB |
| `.pptx` / `.odp`, `--editable` | a shared layout background, 2560×1440 PNG or JPEG | sharp, heavy | same deck: 2.2 MB, 12 backgrounds of 19–487 KB |
| PNG set, video | raster at the output size | correct for the format | not measured |

The comparison image (contrast stretched about 14x so the faults show; writer on top, vector
below) is in the PR that adds this note.

## 2. Why it is like this — the decisions behind it

1. **The shared writer photographs what it cannot draw** (`2026-09-27-studio-export-one-engine.md`).
   Text, charts, borders, checks and the slide edge became vectors one by one. The backdrop
   never did, because the reader has no parser for a CSS `radial-gradient`, a layered
   background or a repeating gradient (`read-slide.mjs` reads only one-layer, non-repeating
   linear edges).
2. **The photo is 1x unless it holds text or an image** (`pipeline.md` §4a0). A backdrop-only
   photo is 1x by design, to hold the file size. In a viewer at 150–200% zoom, every photo
   pixel covers 2–4 screen pixels.
3. **A busy photo is JPEG when JPEG is smaller** (`smallestPhoto`, #2503). A finish texture
   makes almost every finish slide "busy", so the backdrop goes JPEG.
4. **The opaque face** (`base.finish.css`, the `-opaque` mirrors). Every export shows a
   finish's flatter export face, with no fade to transparent, because Chrome's print-to-PDF
   wrote alpha fades that poppler and Ghostscript drew through gray. Since the shared writer
   took over, that face is only *photographed*, so the reason for it no longer applies to the
   default PDF path. It still applies to `--chrome-pdf`.

## 3. Options

| Option | Smoothness | File size | Cost to build | Risk |
|---|---|---|---|---|
| **A. Vector backdrop in the shared writer** (recommended) | exact at any zoom; texture lines sharp | **smaller**: about −40% on the measured deck, since the photo goes flat (PNG) or away | moderate: a CSS radial and linear gradient parser, layers, `background-size` and position, repeating gradients as tiling patterns or lines, alpha as a soft mask; fall back to the photo for anything unmodeled, with a `LATTICE_PDF_REPORT` reason, as every other drawn part does | a viewer that does not dither shows one-level steps (smooth to the eye on light slides; to be checked on dark slides in Preview and iOS PDFKit) |
| B. JPEG 4:4:4 for the photo | fixes the color patches, keeps the blocks | about +30% on a proxy | one line | does not fix the 1x softness |
| C. 2x photo always | sharper | about 2x (`pipeline.md`) | an env var exists (`LATTICE_PDF_PHOTO_SCALE=2`) | the bloat the owner ruled out |
| D. Backdrop as its own low-resolution PNG with `/Interpolate` | smooth if the viewer honors interpolation | small | moderate: a second photo per slide, layering | Interpolate is a hint; several viewers ignore it, so the result depends on the viewer |
| E. Add grain on top | hides steps | larger (noise does not compress) | small | the opposite of what the owner asked for |

**Then, for the editable `.pptx`:** draw the same backdrop model as native `<a:gradFill>` on
the layout background (linear and `path="circle"` gradients carry per-stop alpha). Gradients it
cannot express keep today's picture. That cuts the largest part of a 2.2 MB file, but it only
pays off once option A has a backdrop reader to share.

**And later, the rich face in exports.** With the writer drawing the backdrop itself, a fade
to transparent can be written as the accent color over an alpha ramp (a soft mask), which is
exactly what the bottom-layer rule fakes by hand. That would let exports show the same rich
face as the screen and retire the `-opaque` mirrors for the shared writer. It should wait until
option A has run on real viewers.

## 4. Recommendation

Build **A** behind the existing photo fallback, in this order: the wash (one or two radial or
linear layers, the bulk of the bytes and all of the blotches), then the textures (repeating
gradients drawn as lines and dots), then the mark. The evidence it owes: the before/after table
on the finish galleries, dark and light, at 100% and 300% zoom in poppler, plus Chrome's PDF
viewer and, by dispatch, macOS Preview. Because it changes exported bytes, it stops for the
owner's sign-off before merge (CLAUDE.md Quality Bar).

**Not recommended:** B and C as the fix (each costs bytes and leaves part of the fault), and E.
B is still worth taking for the photos that remain, if a later measurement shows the color
patches there.

## 5. What was built (2026-11-20)

The owner chose option A with the rich face included, and asked that viewer performance be tested,
because Chrome's vector PDFs had opened slowly before. That memory was right, and measured: Chrome's
print writes a repeating gradient (a finish texture) as a PostScript-function shading inside a tiling
pattern, which a viewer evaluates per pixel. Chrome's own PDF engine (PDFium) took 12.8 s to draw the
15-slide `finish-backdrops` deck and 20.8 s for an 11-slide dark `loom` deck; today's writer took 0.56
and 0.37 s.

So the build is shaped by draw cost as much as by looks. Measured per full page at 150 dpi:

| Drawing | PDFium | poppler | MuPDF | Ghostscript |
|---|---|---|---|---|
| axial or radial shading | 0.070 s | 0.093 s | 0.028 s | 0.008 s |
| quarter-resolution RGB picture, `/Interpolate` | 0.012 s | 0.016 s | 0.020 s | 0.013 s |
| 1x1 color over a quarter-resolution opacity map | 0.025 s | 0.077 s | 0.050 s | 0.058 s |
| soft-mask group (poppler rasterizes a page-sized bitmap each) | — | ~0.22 s | — | — |

What the writer does now (`lib/core/pdf-compose/backdrop.mjs`, `read-slide.mjs` `readBackdrop`,
`engineering/pipeline.md` §4a0):

- **Glows under the first texture: one opaque picture**, blended onto the slide color in JS from the
  gradients' own math (premultiplied, Oklab for `color(srgb …)` stops as Chrome paints), at a quarter of
  the slide's resolution, Flate with the PNG Up predictor. No dither, no JPEG. All four engines scale it
  smoothly (largest step along a fade: one level).
- **Textures: paths.** Stripes, a weave, rings, a disk per dot. Sharp at any zoom.
- **Fades of one color above a texture: opacity maps.** A vignette, a spotlight's scrim, a strength veil,
  and the clear panel (its export face, two ramps multiplied: the documented stand-in for the blur).
- **The section's sharp inset shadows** (a `frame` keyline, a tone rail) and the mask layer's sharp outer
  ring are paths too. The keyline goes over the glow picture, not under it: under an opaque picture it
  would vanish. It loses a few percent of glow over a 3 px line.
- **The photo** is taken with all of that hidden, transparent, and cut to the boxes that hold ink.
- **The screen face** is read whenever nothing of the finish stays in the photo.

Measured, old writer against new (PDFium draw time, whole deck, 150 dpi):

| Deck | Size | PDFium | Closer to the screen (mean error) |
|---|---|---|---|
| `finish-backdrops` (15 slides) | 502 → 368 KB | 0.61 → 0.57 s | every finish slide; 4.1 → 2.9 at worst |
| `backdrop-vector-export` demo (8) | 259 → 158 KB | — | all 8; 3.4 → 1.2 on dark `nimbus` |
| owner deck, dark `loom` + strength 40 (11) | 455 → 193 KB | 0.39 → 0.48 s | 1.9 → 1.35 |
| owner deck, dark `nimbus`, photographs (5) | 4.4 → 4.4 MB | 0.42 → 0.51 s | 5.3 → 1.1 |
| owner deck, `meridian` + `clear`, 51 slides | 5.4 → 5.4 MB | 1.88 → 3.43 s | 2.6 → 1.3 |

The 51-slide deck is the one real regression in draw time: 37 to 67 ms a page in PDFium, from the clear
panel's opacity map on every slide. Folding the panel into the glow picture would remove it, but a
texture under a feathered panel would then draw wrong, so it was not done. Poppler is the slowest
engine throughout (0.14 to 0.34 s a page on that deck); MuPDF and Ghostscript sit between.

Found on the way, and fixed by the same path: the export face buried a `tint-edge` rail under a finish
(the rail pixel read rgb(39, 32, 22) against the screen's rgb(166, 98, 124)), because its bottom glow
ends on solid canvas. Where the backdrop is drawn, the screen face is used and the rail is back; where it
stays in the photo, it is still lost (`followups.d/`).

### 5.1 The adversarial review (red team, inversion, independent checker)

Fixed in the same change, each with a test that fails without it:

- **Group opacity dimmed the section's own keyline** (checker, red team): a strength without a mask
  dimmed every drawn piece, the frame's ring included, which the screen leaves whole. The rings now keep
  full strength; a section layer under a dimmed backdrop, or a part of it left in the photo, refuses.
- **A busy photo became a transparent PNG about 8x its JPEG** (inversion): past 64 KB the old opaque
  photo is taken as well and the smaller wins (`backdrop-busy-photo`).
- **A camera with no transparent PNG** would have buried the drawing under an opaque photo (checker):
  it now refuses (`backdrop-camera`).
- **A wide-gamut accent aborted the writer**, and its glow wrapped to wrong colors (red team): clipped.
- **A flex child at `z-index: -3`** paints under the canvas plane with no `position` (red team):
  `backdrop-under`.
- **Hard stops and strips** (strata's top bar) were blurred into the quarter-resolution picture (red
  team): only smooth glows over the whole box go in it.
- **Unbounded work**: a ring cap bypassed by a far start, and an 80,000 px mask pseudo-element (red team):
  counted from the loop's real start; clipped to the backdrop.
- **A 1x1 color image under a larger soft mask** (inversion: Apple PDFKit is the strict viewer): the
  color image is now the mask's own size.
- Smaller: an even-odd hole that could leak past its clip, two faces on one slide, a backdrop on a
  plane at or above 0, section layers lost beside a tone rail.

Accepted and recorded: each slide picks its own face (a slide that keeps a ghost numeral in the photo
stays on the export face while its neighbors take the screen face); the keyline is drawn above the
glow picture; the clear-panel deck's draw-time cost.

## 6. What was not checked

- **Apple PDFKit (Preview, iOS)**, the owner's viewer: not reachable from the build sandbox. The owner
  chose a platform suite for it (2026-11-20): `pdf-pdfkit` (`.github/platform-suites.json`,
  `tools/pdfkit-check/`) draws the demo deck's PDF through PDFKit on a macOS runner, on every PR that
  touches the writer and nightly. It also exports a CONTROL, the same deck with the backdrop photographed
  whole as `main` did, and fails when any 32 px tile of the drawn page is more than 8 levels further from
  Chrome's screen than the control's, both drawn by PDFKit.
  **Its first PDFKit run failed, and the control says why** (2026-11-20). The gate then compared the
  drawn page with the screen directly (fail over 12 levels), and three glow slides missed by 14 to 17. The
  photographed control missed by the same amount, at the same tile, with the same colors: slide 1, 16.43
  against 16.37 at 576,288; slide 5, 16.68 against 16.68 at 96,96. Every worst tile was a heading, light
  text on a dark slide: PDFKit draws it heavier than Chrome, on today's exports as much as on the new
  ones. It is not the backdrop's. So the gate measures what the backdrop changes: what the viewer does
  to the rest of the slide is in both arms and cancels. Calibrated with poppler: the drawn backdrop at
  most 4.2 levels further than the photo; with the fade's soft mask dropped, 11 to 22 (slides 4 to 6
  fail). The raw distance from the screen stays in the log. It does not gate on blockiness: a glow changes by under a level every 4 px, so a viewer ignoring
  `/Interpolate` would draw stairs of a level at most, which no gate can tell from rounding.
- **The Studio's PDF download** is driven for real by `docs/e2e/studio-pdf-backdrop.spec.ts` (Chromium,
  10 runs alone and 5 under load, green). Driving it found the Studio's dark slide drawn as opacity maps
  (its hairline reached the drawing as a section strip); a section strip now goes above the glow picture.
  The same spec later ran on every project its tags target (Chromium desktop, WebKit tablet, Firefox:
  4 passed, 2026-11-21), so WebKit's Studio download is driven too.
- The iOS Simulator and macOS platform suites the change reaches ran on the PR head (run 44793081151):
  13 of 15 passed. `ios-safari-font-cache` failed on the iPad warm arm, the stall recorded in
  `followups.d/3095-p3-ipad-font-cache-warm-stall.md` that also fails on `main`; font warming is not in
  this change. `ios-safari-present-memory` reports its job cancelled after its suite step passed.
- 4K slides (the photo cap) and the editable `.pptx` (option A's follow-on) were not touched.
