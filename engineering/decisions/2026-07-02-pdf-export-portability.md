---
status: shipped
summary: Prompted by #690 (SVG-image slides breaking in iOS Quartz PDF viewers), the export strategy was re-examined — full-raster default? two exports? embed the source? DECISION — the single vector PDF stays the canonical export (selectable text, embedded fonts); the fix is TARGETED — every SVG `<img>`/`background-image` reference is rasterized at export time by default into a 2× PNG twin (a plain image XObject, the construct #681 verified on-device), with `--keep-vector-images` to opt out; inline `<svg>` (Mermaid, charts, logo marks) stays vector. Two opt-in delivery flags ship alongside — `--raster` (one full-bleed 2× JPEG per page, maximum viewer compatibility, notes/present/source post-passes still apply) and `--embed-source` (attach the deck's `.md` as a PDF embedded file so the artifact round-trips to an editable deck). Speaker notes need no change: annotations live outside the page content stream. Committed SVG-bearing PDFs (image galleries, exemplars) are a follow-up rebuild sweep tracked on #690.
---

# PDF export portability: rasterize SVG images, keep the vector deck

**Date:** 2026-07-02 · **Status:** shipped · **Issues:** #690 (engine-wide fix), #681 (deck-side precedent)

## The question

Prompted by #690 (SVG-image slides breaking in iOS Quartz PDF viewers), the
export strategy came up for re-examination: do we "vectorize" the PDF export?
Export whole slides as images to guarantee the rendered look? Ship two exports?
Embed the Markdown source in the PDF? What about speaker notes?

## Ground truth first

The PDF export was **already fully vector** before this decision: Chromium
print-to-PDF with the self-hosted fonts embedded, selectable/searchable text,
resolution-independent pages. Speaker notes were already embedded per page as
hidden PDF text annotations plus an HTML presenter channel (`--notes`,
`--notes-icon`). "Vectorization" was never the gap — **viewer portability of
specific vector constructs** was.

The defect (#690, observed on a real iPhone): Chromium prints SVG
`<img>`/`background-image` placements as shading patterns and transparency
groups; clipped/cover placements emit combinations Quartz partially renders or
drops. Poppler renders them fine — which is why CI and desktop review never
caught it (single-renderer verification was the gap). Same failure family as
the CSS `mask-image` print gotcha.

## Options considered

1. **Full-raster PDF as the default.** Guarantees pixels everywhere, but loses
   selectable/searchable text, accessibility, and crisp zoom, and balloons file
   size. Rejected as a default: vector text *is* the boardroom look, and the
   render is already pixel-identical to the browser.
2. **Two default exports.** Doubles artifacts, verification burden, and user
   confusion ("which file do I send?"). Rejected as a default; accepted as an
   **opt-in flag**.
3. **Targeted SVG-image rasterization (chosen).** At export time, each unique
   SVG `<img>`/`background-image` reference becomes a 2× PNG twin (a plain
   image XObject — the construct `pdfimages` confirmed universally supported in
   #681) swapped into the loaded page before `page.pdf()`. Text, layout, and
   inline `<svg>` (Mermaid, charts, logo marks — printed through the page's
   normal paint path) stay vector. Precedent in the emulator itself: logo-wall
   masks are already swapped for inline SVG at PDF time for the same
   viewer-portability reason.
4. **Document-the-hazard only.** Cheapest, but leaves every user deck with SVG
   images broken on the platform where a shared PDF link is opened first
   (phones). Rejected.

## Decision

- **The single vector PDF stays the canonical export.** SVG *images* are
  rasterized into it by default; `--keep-vector-images` opts out.
- **`--raster` (opt-in):** one full-bleed 2× JPEG per page, assembled with
  pdf-lib at the same page geometry, for maximum-compatibility delivery. The
  pdf-lib post-passes (note annotations, `--present`, `--embed-source`) run on
  the assembled document exactly as on the vector one.
- **`--embed-source` (opt-in):** attach the original `.md` bytes as a PDF
  embedded file (`text/markdown`), so the artifact round-trips to an editable
  deck. Opt-in because it ships the author's source — speaker notes included —
  inside the artifact.
- Speaker notes need no change: annotations live outside the page content
  stream, so both the SVG swap and `--raster` preserve them.

## Consequences

- Decks embedding SVG photos grow (each 2× PNG twin is Flate-encoded by
  Chromium; the placeholder pano adds ~500 KB). Portability outranks bytes for
  the deliverable; `--keep-vector-images` remains for size-critical vector-safe
  contexts. A future knob (JPEG twins for opaque SVGs) is noted below.
- Committed PDFs that embed the SVG placeholders (per-component `image`
  galleries, exemplars) still carry the vector constructs until rebuilt — a
  **follow-up sweep tracked on #690**, kept out of this change to respect
  gallery isolation (HARD RULE #8) and the golden-staleness work in #688.
- On-device iOS re-verification of the engine-level fix is **UNVERIFIED from
  this sandbox** (no reachable Quartz surface — HARD RULE #23); the fix
  reproduces the exact construct swap #681 verified on-device (plain raster
  image XObjects, confirmed via `pdfimages -list` in the integration suite).

## Future knobs (not built)

- JPEG twins for SVGs with no alpha channel (smaller; needs an alpha probe).
- A `rasterize: false` front-matter key if a deck ever needs to pin vector SVG.
- Rebuild sweep of committed SVG-bearing PDFs once #688 settles the goldens.
