---
status: in-progress
summary: A finish printed into the vector PDF as gradients, repeating patterns and transparency groups, which iOS Preview and Acrobat redraw per pixel — about 1–2.5 s a slide, drawn in visible pieces. The CLI PDF export now rebuilds each finish backdrop as a HYBRID — the soft layers (wash, glow, clear fade, strength veil) as one tiny opaque image, the texture as plain vector lines faded in constant-opacity steps under `clear`, marks as live vector — so the PDF draws fast, matches the Studio, and stays near its old size. Print mode drops the finish. `--keep-vector-finish` opts out.
---

# Rebuild the finish backdrop for fast PDF viewing

**Status:** in progress 2026-09-27, pending the owner's export sign-off on device.

## 1. The symptom

The owner, reading exported decks on an iPhone (iOS Preview and Acrobat Reader), saw each
finish slide draw progressively, about a second per slide. A slide with no finish drew at once.
Separately, `backdrop: clear` showed a hard-edged panel in the PDF but a soft fade in the Studio.

## 2. The cause

A finish reaches the vector PDF as drawing instructions, not pixels: a gradient wash, a
texture written as a `repeating-linear-gradient` (one shading whose color function switches
back and forth ~40 times across the page), a transparency group for the strength veil, and
the clear layer. A viewer evaluates all of it per pixel, and again at each zoom.

Measured with poppler at 150 dpi, one slide:

| Slide | Draw time |
|---|---|
| no finish | 0.16 s |
| atrium without its grid texture | 0.38 s |
| atrium as shipped | 2.37 s |
| atrium + `backdrop: 60 clear` (soft edge kept by a blur) | 2.83 s |

## 3. Candidates (16 finish slides: atrium, ledger, loom, savile, light and dark)

| Candidate | Size | Poppler | Owner, on iPhone |
|---|---|---|---|
| Today | 197 KB | 29.6 s | slow, progressive |
| Textures as one repeated tile | 389 KB | 8.7 s | "faster but still janky" |
| Each grid line its own CSS rectangle | — | 2× faster, Ghostscript 17× slower; no diagonals | — |
| Whole backdrop as one image, 1× | 1.1 MB | 10.0 s | "fast and looks good" |
| Whole backdrop as one image, 2× JPEG 100 | 7.0 MB | 15 s | size rejected |
| **Hybrid (this decision)** | **214 KB** | **4.9 s** | "it's fine" (prototype) |

With `backdrop: clear` on all 16 slides the hybrid is 318 KB (today's hard-edged export: 222 KB).
PR #2400 (keep the blur in print) was the first answer to the clear edge; it embeds a 300 ppi
image with an alpha channel per cleared slide and is superseded by this.

## 4. Decision (owner, 2026-09-27)

- Rebuild the backdrop of every finish slide in the vector PDF; keep the file near today's size.
- `color-mode: print` carries no finish at all, on screen and in every export
  (`base.finish.css` `section.print.finish[class]`): a finish on paper is ink with nothing to say.
- `--keep-vector-finish` keeps the stylesheet's own drawing.

## 5. Mechanism

`bakeFinishBackdropsInPage` in `lattice-emulator.js` runs just before `page.pdf()`, after the
SVG-image rasterization pass (`2026-07-02-pdf-export-portability.md`), while the page is still
in screen media, so it captures the Studio's face.

- **Soft layers.** With the content, the texture, the mark and a hard edge hidden, the backdrop
  is captured at a quarter of the slide's pixels (320 × 180 for HD) as an opaque JPEG and becomes
  the backdrop's background. The mask's work (the clear fade, the veil) is in that image, so the
  mask element is removed.
- **Texture.** The finish generator publishes `--fin-texture-geo` (pattern and period) and
  `--fin-texture-ink` (the screen face's line color). `planLiveLayers` redraws the pattern as an
  inline SVG under the mark: grid, pinstripe, ruled, hatch, lattice and contour as 1px lines
  placed where the CSS gradient puts them, rings as circles, dots as dots. Each line is cut into
  3px runs, each run drawn at the nearest of 12 opacity levels given by the strength times what
  the Studio's blurred clear layer leaves at that point. The result is at most 12 solid paths.
- **Marks and hard edges** (`--fin-edge-kind` fold or margin-rule) stay the live pseudo-elements,
  with their opacity set from the same function at their center.
- **Fallback.** A texture without `--fin-texture-geo` (hand-written in a deck, or a Fabricate
  finish saved before this change), a spotlight, or a legacy baked clearance ellipse: that slide's
  whole backdrop becomes one image at the raster export scale (2× HD, 1× 4K).
- A slide that fails keeps its vector finish and warns. Gallery's frame keyline is held off: the
  print face always covered it, and on screen it strikes through the header (followup
  `2388-p3-gallery-frame-crosses-header`). `--paper` and `--raster` screenshot every slide already
  and are skipped.

## 6. Costs and limits

- The soft layers are a 320-pixel image. They are smooth, so upscaling loses nothing visible.
  The one HARD shape a shipped wash carries, strata's 4px hairline strip (and Fabricate's
  `wash.hairline`), is drawn live instead: the generator publishes it as `--fin-wash-hairline`.
- The clear fade on the texture is 12 steps. On a finish's faint 1px lines the steps are well
  under one level of visible difference. Where two lines cross, their alpha is not doubled as
  it is in CSS; the dot this leaves is below visible in a normal view.
- A mark's opacity is one value: the fade averaged over its box (for a glyph, the glyph's own
  box, measured by laying the same text out in a probe). The Studio fades a large glyph across
  its body; the PDF dims it evenly.
- The live mark and hard edge are pinned to their SCREEN values: `page.pdf()` prints, and the
  print flip would otherwise swap in the opaque mirror (ledger's fold covered the texture).
- Export time: about 0.12 s per finish slide (a 128-slide deck: 3.5 s → 18.8 s).
