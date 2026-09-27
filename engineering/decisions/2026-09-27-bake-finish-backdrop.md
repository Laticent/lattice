---
status: in-progress
summary: A finish printed into the vector PDF as gradients, repeating patterns and transparency groups, which iOS Preview and Acrobat redraw per pixel on the CPU — about 1–2.5 s a slide, drawn in visible pieces. The CLI PDF export now bakes each finish slide's backdrop into one opaque JPEG (quality 100, at the raster export scale for the deck's size), captured from the screen face so the PDF matches the Studio; text and content stay vector. `--keep-vector-finish` opts out.
---

# Bake the finish backdrop into the PDF

**Status:** in progress 2026-09-27, pending the owner's export sign-off on device.

## 1. The symptom

The owner, reading exported decks on an iPhone (iOS Preview and Acrobat Reader), saw each
finish slide draw progressively, about a second per slide. A slide with no finish drew at once.

## 2. The cause

A finish reaches the vector PDF as drawing instructions, not pixels: a gradient wash, a
texture written as a `repeating-linear-gradient` (one shading whose color function switches
back and forth ~40 times across the page), a transparency group for the strength veil, and
the blurred clear layer. A viewer evaluates all of it per pixel, and again at each zoom.

Measured with poppler at 150 dpi, one slide:

| Slide | Draw time |
|---|---|
| no finish | 0.16 s |
| atrium without its grid texture | 0.38 s |
| atrium as shipped | 2.37 s |
| atrium + `backdrop: 60 clear` | 2.83 s |

Other finishes: loom 2.6 s, halo 2.1 s, nimbus 1.6 s, meridian 1.4 s, ledger and savile 1.2 s.

## 3. Candidates

| Candidate | Result |
|---|---|
| Draw the straight textures as one repeated tile (branch `claude/finish-texture-tiles`) | poppler 16 slides 29.6 s → 8.7 s. Owner: "faster but still janky". Chromium flattens each tiled texture into a ~96 dpi image with an alpha channel, the glow stays a shading and the veil a transparency group |
| Draw each grid line as its own rectangle | vector, but poppler only 2× faster and Ghostscript 17× slower; cannot draw diagonals |
| **Bake the whole backdrop into one opaque image per slide** | Owner, on iPhone: "fast and looks good" (1× prototype) |

Poppler draws the baked version no faster than the tiles (it resamples large images slowly),
while Ghostscript draws it 2.6× faster. Neither is the owner's viewer; the device check decided.

## 4. Decision (owner, 2026-09-27)

- **Bake by default** for every finish slide in the vector PDF; `finish-none` / `backdrop-none`
  slides are skipped. `--keep-vector-finish` keeps the old vector drawing.
- **Resolution follows the deck's size:** the raster export scale, `resolveRasterScale('max')`
  (2× for HD, 1× for 4K, long edge ≤ 3840 px), the same rule the PNG, PPTX and image-set
  exports use.
- **Quality:** JPEG 100 ("the highest quality possible"). Chromium re-encodes each image and
  keeps the smaller of JPEG and lossless Flate, so light slides often land as Flate; both
  carry the same pixels.

## 5. Mechanism

`bakeFinishBackdropsInPage` in `lattice-emulator.js` runs just before `page.pdf()`, after the
SVG-image rasterization pass (the same shape of fix, `2026-07-02-pdf-export-portability.md`).
Per finish slide it fades every child but `.backdrop` to opacity 0, screenshots the backdrop's
box, and swaps the backdrop for an `<img>` on the same box and z-index. The page is still in
screen media, so the capture is the **screen face**: the soft clear edge, feathered masks and
alpha fades that the opaque print face gave up only because vector viewers mis-draw them.
The Studio and the PDF now show the same finish.

## 6. Costs

- **File size:** about 70–370 KB a slide at 2× (dark and busy textures cost most). The
  16-slide test deck grows from 197 KB to 5.9 MB; `examples/backdrop-register.pdf` from 253 KB
  to 2.1 MB.
- **The finish is no longer vector:** it is sharp at the deck's raster scale and softens only
  past it. Anything that edits the PDF's vectors (Illustrator) sees one image; use
  `--keep-vector-finish`.
- **A finish mark with text** (a monogram or numeral ghost glyph) becomes pixels; it was
  decoration, never read as text.

## 7. What this makes moot

- The export-only opaque faces (`--fin-*-opaque`) and the print flips still exist for
  `--keep-vector-finish`, the HTML export and the Studio's own image export, but no longer
  shape the default PDF.
- PR #2400 (soft clear edge in print) and the tile branch are on hold at the owner's
  request; baking delivers both results in the default PDF.
