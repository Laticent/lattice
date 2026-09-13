---
status: in-progress
summary: >
  The Studio's exported PDF was a stack of pictures: Cmd-F found nothing, a cursor
  selected nothing, and a screen reader got blank pages. It now writes each word
  over its page image in text rendering mode 3 — invisible ink, the mechanism OCR
  output has used for decades. The words are measured in the capture frame one WORD
  at a time and carried by a font that is a lookup table rather than a typeface, so
  any character survives. `pdftotext` on a real 18-page export returns 1,220 words
  in reading order; the picture is untouched (image streams byte-identical, pages
  AE = 0) and the file grows 0.7%.
---

# The exported PDF gets a text layer

## The defect

`2026-09-13-pdf-export-encode-lanes.md` closes with it: *"Not a text layer. The
exported PDF is still images: unsearchable, and inert to a screen reader. The
inversion pass argued that is the more valuable defect to fix."*

Measured, on the shipped export before this change: `pdftotext` over an 18-page
deck returns **0 words**. Not garbled text — none. The CLI's own PDF export does
not have this problem (it is Chromium's `page.pdf()`, real vector text), so the
gap was the browser export alone, which is what the Studio's Share button, the
mobile export and every shared deck actually use.

## What ships

Three pieces, split along the one line that matters — what needs the DOM and what
does not.

1. **`pdf-text-extract.js`** (main thread) reads the words out of the capture
   frame, INSIDE the capture fixups, which is the only moment the measurement is
   true: before them the slide can still be behind the preview's lazy-render gates
   and every rect reads zero; after them the frame is gone. It emits one run per
   WORD, normalized to the slide box.
2. **`pdf-text-layer.js`** (worker, pure) turns runs into content-stream operators
   and the font objects they need.
3. **`pdf-export-worker.js`** writes the image, then the words over it, and
   deflates the result.

### One run per word, not per line

Each word is placed at its own measured x, and the spaces between them are
inferred by the reader from the gaps — which is exactly what OCR output does, and
what poppler, Acrobat and pdf.js all read. A line-at-a-time run would have to
trust the font's own advance widths to space the characters, and those are
Helvetica's here, not the deck's. So the word is the unit: a reader's selection
lands on the word under the cursor.

### The font is a lookup table, not a typeface

Nothing is drawn (`3 Tr` = neither filled nor stroked), so glyph shapes are
irrelevant and the font object's only job is to say what each byte MEANS. We write
a simple Type1 font that borrows Helvetica's name — a standard-14 base needs no
embedded font program — give every code the same nominal 500/1000 width, and
attach a `/ToUnicode` CMap mapping each code to the real character.

That choice is what lets the layer carry ANY character. The meaning rides in the
CMap rather than in an encoding we did not choose, so `·`, `—`, `café`, CJK and
emoji all round-trip. A simple font holds 223 codes (0x20 is skipped because every
extractor reads code 32 as a space, and a run never contains one); a document past
that opens another font, and an English deck uses exactly one.

The `/Differences` array names each code `/uniXXXX` as well — belt and braces,
since poppler reads `/ToUnicode` first and the glyph name only if that is missing.

### `Tz` is what keeps the words on their picture

Uniform widths would drift a long word off the ink underneath it. Each run
therefore carries a horizontal scale computed to make the run's drawn width equal
the width the browser measured. The word's box is exact; character positions
INSIDE it are evenly spaced rather than true. That is a deliberate trade: a
per-character truth needs a per-character measurement on the main thread, which is
the cost this whole export exists to avoid, and the word is the unit selection and
search operate on.

### What is deliberately NOT extracted

- Anything a human cannot see: `display:none`, `visibility:hidden` (which is how
  the capture frame hides an unrendered Mermaid fence), `opacity:0`.
- **Screen-reader-only text** — the 1px `overflow:hidden` clip. `.cell-sr-label`
  names a matrix cell's state for anything reading DOM text; it is not copy on the
  slide, so lifting it into the page's text would make the extraction disagree with
  the picture it sits on.
- `<script>` / `<style>` content, which is not copy at all.

`aria-hidden` is **not** a reason to skip, and that is the non-obvious one: charts
mark a VISIBLE label `aria-hidden` when its accessible name lives elsewhere
(journey's actor dots, gantt's axis). That label is on the slide in ink.

`text-transform` IS applied, because the run has to say what the slide SHOWS: an
eyebrow is written lowercase in Markdown and set in capitals by the theme. The
word offsets are taken from the RAW text and only the run's own string is
transformed — `'ß'.toUpperCase()` is two characters, so transforming first would
shift every range after it.

## A trap this hit, worth knowing

**pdf-lib rewrites `/Contents` into an array the moment you touch a page's
resource dictionaries.** `setFontDictionary` normalizes the page, and normalizing
wraps an existing `/Contents` stream in a one-element array. Legal PDF, and
nothing renders differently — but `tools/bench-pdf-export.mjs` resolves each
page's image THROUGH its content stream and takes `instanceof PDFRawStream`, so
every text-bearing page read as empty, every digest came back identical, and the
tool then called any page order correct. A verification tool that cannot fail is
worse than no tool.

The fix is one line of ordering — fonts on, then the content stream — and the unit
tier pins the shape so it cannot drift back.

## How it was verified

| Claim | Evidence |
|---|---|
| The text is really there, on the real surface | `pdftotext -layout` on a Studio export driven through `tools/bench-pdf-export.mjs` (built docs site, Chromium 141, 18 pages): **1,220 words**, in reading order, headings and body copy intact. The same export from `main`: **0 words** |
| It says what the slide SHOWS | The extracted copy carries the theme's uppercase eyebrows (`LATTICE · DECISION FRAMEWORK GALLERY`) and the `·` separator — the `text-transform` and the non-ASCII path, both on a real page |
| The picture did not move | Same deck, `main` vs this branch: the page image streams are **byte-identical page for page** (18/18, 18 distinct digests, so the comparison is not vacuous), and the rasterized pages match at **AE = 0** on all 18 at 50 dpi |
| The words are invisible, not white-on-white | Every text block is written `3 Tr`, asserted per block in the e2e spec. AE = 0 above is the independent proof |
| The layer lands on the right page | `docs/e2e/pdf-text-layer.spec.ts` exports a four-slide deck through the real Studio, decodes every page's `Tj` bytes through that page's own `/ToUnicode` CMap, and asserts each page carries its own marker word and NONE of the other three. **Mutation-proved**: shifting the text layer one page (`texts[(i + 1) % pages.length]`) fails it |
| It costs nothing on the eager path | Studio `eagerJsGz` is **650.4 KB / 658.7 KB with and without this change** — identical, measured by a full `npm run build` on each. `deck-export.js` is dynamically imported, so the extractor rides in the lazy export chunk |
| Any character survives | Unit tier round-trips `—`, `café`, `日本語` and `👋` through a real pdf-lib document and back out through the CMap; a `)` and a trailing `\` too, the pair that corrupted the sticky-note annotations when they were written as PDF literals |
| The file a reader opens is well-formed | Ghostscript parses all 18 pages, no errors |
| It costs almost nothing | 3,264,300 → 3,286,755 bytes over 18 pages (**+0.69%**), with the content stream now deflated. Wall time 5.4 s → 5.9 s on the same machine |

## What this is NOT

- **Not on the main-thread fallback lane.** The jsPDF lane (a browser without
  `CompressionStream`/`OffscreenCanvas`/module workers, or a worker that died)
  still writes image-only pages. Adding it there means encoding through jsPDF's
  WinAnsi standard fonts, which cannot carry the characters the CMap path can — so
  the two lanes would disagree about the TEXT rather than merely about whether
  there is any. A page without a text layer is the old behavior; a page with the
  wrong text is a new defect.
- **Not on the print `sheet` lane or PPTX.** `assembleSheetPdf` places cached
  images on paper and never sees a DOM; PPTX is image slides by design
  (`engineering/pipeline.md` §4).
- **Not per-character positioning.** See the `Tz` note above.
- **Not a tagged PDF.** A screen reader can now READ the page; it still gets no
  heading structure, no reading-order tree and no alt text, because those need a
  `/StructTreeRoot` the export does not write. That is the next rung, and it is a
  larger change: the structure has to come from the DOM's own semantics rather
  than from a rect.
- **Not verified on a real phone.** Every measurement is from headless desktop
  engines in this sandbox (HARD RULE #23).
