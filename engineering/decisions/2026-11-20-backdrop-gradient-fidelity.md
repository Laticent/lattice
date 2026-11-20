---
status: proposed
summary: Audit of why a finish's backdrop gradient looks dithered and blotchy in exports. The PDF writer leaves the backdrop in a 1x photo of the slide, usually a JPEG, and JPEG cuts a faint gradient into 8x8 blocks with color patches. Measured on finish-backdrops.md, those photos are 407 KB of the 502 KB PDF. Chrome's own print path, which wrote the same gradients as vectors, gave a smooth backdrop in a 291 KB file. Recommends drawing the backdrop as PDF shadings in the shared writer (smoother and smaller), then the same backdrop as native gradient fills in the editable .pptx. Every raster-only fix costs bytes.
---

# Backdrop gradient fidelity — the audit (2026-11-20)

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

## 5. What was not checked

- WebKit (Safari, iOS) on screen: the browser download was refused by this sandbox's network
  policy. CSS gradients in WebKit are known not to dither, so dark slides may band there; this
  needs the WebKit Playwright project or a device.
- Real PowerPoint, Keynote, and Apple PDFKit rendering of vector shadings.
- The PNG set and video.
