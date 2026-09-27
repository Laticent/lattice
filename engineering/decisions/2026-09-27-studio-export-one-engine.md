---
status: in-progress
summary: The owner wants the Studio's Export to PDF to produce "option 1" — a background photo with real, sharp text and shapes on top — through one export spine shared with the CLI. A browser page cannot write a real-text PDF on its own. Three routes measured - an export server (A), a Studio-only drawer (B), and one pdf-lib writer that runs in-page for both the CLI and the Studio (C, the owner's idea). A prototype of C on the owner's deck matched Chrome's text at 300 dpi, at 211-281 KB and 1.5-1.9 s to draw nine slides; recommends C.
---

# One export engine for the Studio's Export to PDF

**Status:** in progress 2026-09-27. The owner chose C; §7 records what is built so far.
**Related:** [`2026-09-26-backdrop-register.md`](2026-09-26-backdrop-register.md) §4.7–4.8
(the edge fixes, made twice), PR #2404 (the CLI's option 1),
`followups.d/2400-p2-shared-export-face.md`.

## 1. What the owner asked for

The owner approved "option 1" on their own cuoio deck: each slide's soft background (glow,
fade, spotlight) is a small photo, and the text, charts and lines are drawn on top as real
text and shapes. They want the Studio's **Export to PDF** button to produce the same PDF in
the colored modes, and they want every export to come from **one shared spine**, so a finish
bug is fixed once. The black-and-white print mode is out of scope: #2404 already removes the
finish there, so it has no photo at all.

## 2. Why the Studio can't do it today

Option 1 needs a PDF writer that can lay out text and shapes. The CLI has one: it runs its
own Chrome, and Chrome's `page.pdf()` writes real text. **A web page has no such call.** It
can only open the print dialog (`window.print()`), which the Studio already offers as its
separate Print button (`docs/src/components/studio/export/deck-export.js` `exportPrint`).
So the Studio's Export to PDF writes the file itself: one photo per slide
(`pdf-image-stream.js`), plus invisible words for copy and search (`pdf-text-layer.js`).

## 3. Measured today, on the same deck

All numbers come from the 9-slide Northwind deck, measured in the cloud sandbox on
2026-09-27. Poppler is a desktop PDF renderer; its time is how long it takes to draw all
nine pages.

| Export | File size | Text | Sharp at deep zoom |
|---|---|---|---|
| Studio today, PNG pages (strata + `clear`) | 1.19 MB | invisible copy over a photo | no |
| Studio today, JPEG q95 pages | 1.95 MB | invisible copy over a photo | no |
| CLI option 1, strata + `clear` (#2404 light method) | 363 KB | real | yes |
| CLI option 1, cuoio + atrium + `spot-tr` (#2404 fallback) | 2.67 MB | real | yes |
| CLI today, cuoio + atrium + `spot-tr` | 343 KB | real | yes, but slow and hard-edged |

The 2.67 MB row is the known gap in #2404: a spotlight falls back to one full-size photo of
the backdrop, including atrium's fine grid. The #2404 rework draws the grid as real lines
instead. The expected result is close to 343 KB, but that is not yet measured.

Speed on the same deck: poppler draws option 1 in 5.5 s against 13.2 s today. One CLI export
of the deck takes 4.9–10.3 s end to end here, and most of the difference between those two
runs is starting Chrome.

## 4. Three ways to give the Studio option 1

### A. One engine, run on a server

The Studio sends the deck (Markdown, theme, and the images it uses) to a Lattice export
service. The service runs the CLI export and returns the PDF.

- **One spine, literally.** Every export button runs the same code, so the Studio's PDF is
  byte-for-byte the CLI's PDF. A finish fix lands once and every export has it.
- **Speed:** about 5 s for this deck with a cold Chrome, less with a warm one (not measured),
  plus the upload and the download.
- **Costs:** a service we run and pay for (not measured). Decks leave the user's browser,
  which is a real question for board decks and needs a stated retention policy. The export
  also stops working offline, so today's photo export stays as the offline fallback.
- **Build size:** small. The export already exists; the work is hosting it, a request from
  the Studio, and the fallback.

### B. A second PDF drawer, in the Studio only

The Studio's own writer keeps the background photo, and draws everything else itself: real
text with embedded fonts, charts as vector shapes, boxes, borders and shadows.

- **Private and offline:** nothing leaves the browser.
- **The scope, measured on this one 9-slide deck:**
  - 66 text runs across 9 font faces;
  - 25 letter-spaced runs and 16 upper-cased runs;
  - 58 chart shapes;
  - 23 rounded boxes, 7 borders, 7 shadows and 7 gradient fills.

  The full catalog adds Mermaid diagrams, KaTeX math, highlighted code, tables and images.
  Chrome handles all of these for the CLI. B would have to redraw each one by hand.
- **Not one spine for the drawing.** The finish rules and the "photo or drawn" plan can be
  shared, but the drawing would be two implementations. Every construct is a place the
  Studio's PDF can drift from the CLI's, which is the same kind of fix-it-twice problem this
  work set out to end.
- **Build size:** large, and it never finishes, because every new component owes a second
  drawer. Option C is B with that flaw removed: the same drawer serves the CLI too.

### C. One PDF writer that runs inside the page, for both (the owner's idea)

The CLI and the Studio both hold a real browser with the slide fully laid out: the CLI's
Chrome, and the user's browser. So one piece of our code can run in both:

1. **Read the laid-out slide.** Collect every word's box, font, size, color and letter
   spacing, and every chart shape with its transform.
2. **Photograph what is left.** Hide the words and chart shapes, then photograph the slide.
   The photo carries the backdrop, boxes, shadows, and anything the writer cannot draw yet.
3. **Write the PDF with `pdf-lib`,** which runs in both Node and the browser. The photo goes
   underneath. The words go on top as real text, in the deck's own fonts, cut to the
   characters used and pinned to the right weight with HarfBuzz. The chart shapes go on top
   as vectors.

Chrome's own PDF writer (`page.pdf()`) drops out entirely. The CLI keeps Chrome only as the
place where the slide is laid out.

**Prototype, measured 2026-09-27** on the owner's 9-slide cuoio deck (atrium,
`backdrop: "full spot-tr"`). The prototype lives in the session scratchpad and was not
committed.

| | CLI path (Node) | Studio path (in-page) | Chrome option 1 (#2404) | Today |
|---|---|---|---|---|
| Size, light / dark | 281 / 271 KB | 232 / 211 KB | 2,607 KB | 335 KB |
| Poppler, all 9 slides | 1.85 s | 1.46 s | 5.36 s | 12.87 s |
| Export time | 2.4 s capture, 0.2 s write | 1.3 s capture, 0.2–0.3 s write | — | — |
| Copy and paste | yes, real text | yes, real text | yes | yes |

- **Text matches Chrome's layout.** Zoomed to 300 dpi, the figures and labels are
  indistinguishable from Chrome's own PDF.
  - Of 325 words, the median width differs from Chrome's by 0.02 px, the 95th percentile by
    1.6 px, and the worst by 4.3 px, before correction. The gap is kerning, which `pdf-lib`
    does not apply.
  - Each word is fitted to its measured width, within a 10% horizontal scale.
  - Words are placed individually at their measured positions, so errors never accumulate
    across a line.
- **What the prototype handles:**
  - variable fonts pinned per weight;
  - synthetic italics (Chrome's 14° slant, for faces with no italic cut);
  - `text-transform`;
  - letter spacing;
  - colors in any CSS syntax (`oklab`, `color(srgb …)`), read back through a canvas pixel;
  - text hidden by overflow or clipping, such as the chart's screen-reader table (16 words
    skipped);
  - SVG text and shapes under any transform.
- **The same writer module ran in both places.** In the browser it used HarfBuzz's WebAssembly
  subsetter and a WebAssembly WOFF2 decoder. Lazy-loaded cost on first export: 688 KB
  gzipped JavaScript (`pdf-lib`, `fontkit`, the WOFF2 decoder and `html-to-image`, the first
  and last of which the Studio already loads) plus a 251 KB gzipped HarfBuzz module.

**Gaps the prototype found, each with its answer:**

- **The two cameras differ.** The CLI photo came from a Chrome screenshot of the screen face.
  The Studio photo came from `html-to-image` with the `.lattice-exporting` face, because
  `html-to-image` misdraws the screen face's washes (§4.8 of the backdrop note). For one
  spine, both should use the same camera and face. Answer: both use `html-to-image` with the
  export face, and the CLI's own screenshot becomes the test oracle.
- **SVG shapes with gradient fills or clip paths**, such as the Gantt bars, stay in the photo.
  Bare `html-to-image` draws those bars black, with or without this change, so the writer
  must draw them itself: PDF clipping paths, plus gradient shadings written as raw PDF
  objects, since `pdf-lib` has no shading API.
- **Pseudo-element text** (page numbers, list bullets) stays in the photo. It is sharp at the
  photo's resolution but not vector. Answer: generated content is readable through the
  computed `content` property, and the writer can draw it.
- **CSP.** The export HTML's `connect-src 'self'` blocked the WOFF2 decoder's inline
  WebAssembly. The Studio would ship both WebAssembly files as same-origin assets.

### Not pursued

- **Real text only in the browser, with charts and shapes left in the photo.** A smaller
  build than B, but charts go soft at deep zoom, which the owner ruled out.
- **The Print button.** It produces option 1 once the background step runs first, but it
  goes through a print dialog and Safari has its own PDF engine (untested). It stays as it
  is: a separate button, not the Export to PDF.
- **The Laticent desktop app.** It may be able to write a real PDF from its built-in webview,
  which would give A's result offline. This is not checked, and it helps only desktop users.

## 5. The shared spine under C

1. **One export face per finish:** `lib/base/base.finish.css` and
   `lib/finishes/finish-generate.js`, as today.
2. **One in-page reader:** reads a laid-out slide into a drawing list of words, shapes and
   what remains for the photo. It lives in `lib/core` and runs in any browser.
3. **One camera:** `html-to-image` on the export face.
4. **One writer:** turns the drawing list and photo into PDF bytes with `pdf-lib`. It is
   environment-neutral, and each host injects only how to fetch the font and WebAssembly
   files.

Each host adds one thin adapter. The CLI's adapter is Puppeteer, which opens the page and
saves the file. The Studio's is its export button. A finish or drawing fix lands once and
reaches both.

## 6. Recommendation

**C.**

- **One spine, and no server:** decks never leave the browser, and export works offline.
- **Faster and smaller than every measured alternative:** it draws in 1.5–1.9 s where
  today's export takes 12.9 s, and it is smaller than today's 335 KB.
- **It extends the Studio's existing pipeline** (`html-to-image` plus `pdf-lib`) instead of
  adding a second one.
- **The cost:** we own the drawing code. Coverage grows safely, because anything the writer
  does not draw falls back to the photo. A per-slide coverage report, and a test comparing
  every gallery slide against Chrome's own PDF, keep it honest.

Order of work, all in one PR (#2404):

1. Move the reader and writer into `lib/core`. Switch the CLI's `--pdf` to them, keeping
   Chrome's `page.pdf()` as the comparison oracle and, behind a flag, as the fallback.
2. Switch the Studio's Export to PDF to the same modules, with the photo-only export as the
   fallback.
3. Close the gaps above: gradients and clip paths, pseudo-element text, and the shared camera.
4. Add a gallery-wide comparison against Chrome, and a coverage report.

## 7. What is built (2026-09-27)

- **The kernel** lives in `lib/core/pdf-compose/`: `read-slide.mjs` (the in-page reader),
  `font-subset.mjs` (HarfBuzz instancing, WOFF2 via `woff2-encoder`), `write-pdf.mjs` (pdf-lib)
  and `compose.mjs` (the orchestrator both hosts call).
- **The Studio's Share → PDF uses it by default** (`buildPdfBlobShared` in
  `docs/src/components/studio/export/deck-export.js`). Its camera is html-to-image under the
  capture fixups every Studio raster already uses. It fetches only same-origin, `data:` and
  `blob:` images; a web image stays in the photo, where the capture sweeps it to the
  placeholder. A new Workspace preference, **PDF export: Text & vectors / Photo per page**,
  keeps the old lanes one tap away, and they remain the automatic fallback. Verified on the
  built docs site: `docs/e2e/pdf-shared-writer.spec.ts` exports a deck through the real Share
  dialog and reads back tagged, real text and a vector chart.
- **The CLI's `.pdf` uses it by default.** `--chrome-pdf` keeps Chrome's printer, as the fallback
  and the comparison oracle.
- **#2404's hybrid bake is removed** (`2026-09-27-bake-finish-backdrop.md`, superseded), with its
  `--keep-vector-finish` flag and its `--fin-texture-geo` family of slots: it was the second
  spine. Print mode dropping the finish stays.
- **The camera is a host adapter, not shared.** §4 C planned `html-to-image` in both hosts.
  Measured instead: `html-to-image` cannot fetch a `file://` image from the CLI's `file://`
  page, so the first CLI run fell back to Chrome on any deck with a local image. The CLI now
  photographs with Chrome's own screenshot, on the same export face the Studio photographs. What
  decides the PDF's look is shared: the export face, the reader, the fonts and the writer.
- **Beyond the prototype:**
  - SVG gradient fills and clip paths drawn as PDF shadings and clipping paths;
    `non-scaling-stroke` honored.
  - Raster `<img>` and single-layer CSS backgrounds embedded at their original bytes, clipped to
    rounded corners and overflow. An image stays in the photo when something paints over it
    (a scrim), and that slide's photo is taken at 2x.
  - A tagged structure tree (Document › H1…H6/P/LI/Figure, with image alt text), `/Lang` and the
    title: Chrome's PDF was tagged, so dropping it would have been a regression.
  - Real spaces between words, so text copies and reads as sentences.
  - Byte-reproducible output: pdf-lib's random resource names replaced by a counter, and the
    dates taken from the CLI's pinned epoch.
- **Two library bugs, fixed at the root:**
  - `@pdf-lib/fontkit` reads past the end of a subset font whose last glyph is empty. The subset
    is padded with 16 zero bytes.
  - pdf-lib loses the text of ligature glyphs ("first" copies as "rst"). A subset keeps only the
    OpenType features the slide asked for (so `tnum` figures stay tabular) and never a
    ligature, and each word is fitted to the width the browser measured.
- **Measured on the owner's 9-slide cuoio deck, CLI:** 3.1 s end to end and 237 KB. Poppler
  draws all nine slides in 1.45 s, against 13.1 s and 335 KB for Chrome's printing (best of 3,
  110 dpi). 351 words and 26 shapes drawn; nothing left in the photo.
- **Adversarial review, and what it changed.**
  - **The red team** found two real breaks:
    - The CLI's page-to-Node file reader could fetch any http(s) URL, and read image or font
      files anywhere on disk. It is now local-only and confined to the deck's folder and the
      install (`lib/export/pdf-asset-reader.js`, with its own tests).
    - Text under an overlay (a redaction bar) was drawn over it, and copied out. Covered text
      now stays in the photo.
  - **The inversion** judged the chart gradients "washed out" against Chrome's printer. Measured
    against the screen, the writer is right and the printer is not (it drops `fill-opacity` on
    gradient-filled shapes), so `tools/pdf-writer-parity.mjs` now compares against the screen by
    default.
  - **Earlier in the same pass, a regression of my own:** reading the CLI's page under print
    media brought back the hard spotlight arc, the defect this work began from. The CLI uses the
    Studio's `.lattice-exporting` face, pinned by an integration test with a control.
  - **The independent checker** found four blocking defects, all fixed with a test:
    - Mermaid draws edges with `stroke-dasharray: 0`, which went into the PDF as a zero dash
      that poppler draws as nothing: every flowchart lost its edges. Dash arrays are now
      sanitized (all zero or negative means solid; an odd list is doubled), and a shape with
      SVG markers (arrowheads) stays in the photo.
    - When the writer failed after hiding what it had drawn, the page reached Chrome's fallback
      printer with its text hidden: a blank PDF. A failure now restores the page before the
      fallback runs, and the watchdog allows 4 s a slide.
    - Plain `http:` links were dropped; only `https:` was kept.
    - Tabular figures (`font-variant-numeric: tabular-nums`) came out proportional, because the
      subset kept no layout features.
  - Should-fix items, also fixed: font weights clamped to the face's range, text cut by an
    ellipsis left in the photo, in-deck `#slide` links become page jumps, the Studio's font
    fetch goes through the same origin guard as its images, and the photo is capped at
    2560 px on its long edge.
- **The owner's sign-off render found two Studio-only defects**, both fixed with an e2e test that
  fails without the fix:
  - The reader measured each slide at the preview's FIT scale (1208px for a 1280px slide), so the
    page came out 906 x 510 pt with the photo overhanging it. The Studio's `withSlide` now clears
    the fit transform while the slide is read.
  - The Studio's capture reset every section's `box-shadow` to strip a preview shadow that moved
    to `.lattice` long ago. It erased the deck's own tone rail and finish frame from every
    Studio image export, the photo lanes and PPTX included, while the CLI kept them. The reset
    is gone.
- **Big screens: borders are vectors (the owner's pick, over a 2x photo).** At 4K a 1x photo
  smears a 1px card border or heading rule across 5 to 6 px (measured on slide 2 of the
  Northwind deck). Solid HTML borders are now drawn as vectors (straight sides as rectangles,
  an even rounded border as a ring) and made transparent in the photo, and they match Chrome's
  printed line pixel for pixel. Fills stay in the photo, because a fill drawn on top would bury
  whatever the photo still carries inside the box. Dashed or mixed-color borders, elliptical
  radii, and borders something paints over stay in the photo. The alternative under test is a
  2x photo: nearly as sharp, but 500 KB against 204 KB for the dark deck.
- **The second checker pass (on the border work and the late fixes) found:**
  - **Blocking, from earlier in this PR:** SVG shapes ignored the `<svg>` viewport and
    overflow-clipping HTML ancestors, so every KaTeX square root ran its bar (drawn 400em wide)
    to the edge of the page. The gallery comparison missed it: a 1px line moves under 1% of a
    page, so a percentage ranking cannot surface a thin-line defect. SVG shapes now carry both
    clips.
  - **Borders drawn wrong, now refused:** inside a see-through group, around an inline box that
    wraps, in a collapsed table, and on an element with an outline.
  - **A blind hit-test:** `elementsFromPoint` skips `pointer-events: none`, which is how scrims
    are written, so a border (or text) under one was judged uncovered. Everything hit-tests
    during the read.
  - **The Studio:** its unscaled slide reached past the filmstrip's clip. That clip is lifted
    while the slide is read.
  - Also fixed: inner curves use CSS's clamped radius, and a child that inherits its border
    color keeps it.
- **The third checker pass, on the second's fixes, found two regressions in them:**
  - Making every element hit-testable let an empty `pointer-events: none` SVG (sketch mode's
    ink layer) "cover" the words under it; `examples/panes-sketch.md` lost 94 of 200 words from
    its text layer. Only elements that paint a box are made hit-testable now.
  - Clipping SVG to every overflow ancestor erased an absolutely positioned SVG that escapes
    one. Clips follow the containing-block chain now, at the padding box. A nested `<svg>`
    clips to its own x/y/width/height.
- **A thin-line sweep, added because the percentage ranking missed the KaTeX bar:**
  - **What it measures:** the longest run of differing pixels along any row or column, at
    the screen's own scale (96 dpi). A pixel counts only if its color falls outside the range
    of its 3x3 neighbors on the other side AND the ink in that neighborhood differs, so a
    sub-pixel shift or a line drawn crisper than the 1x screenshot does not count.
  - **Positive control:** the earlier run with the root-bar bug flags the bar at 1,153 px.
  - **What it found:** a defect far worse than the bar. pdf-lib's SVG path parser misreads a
    comma followed by a line break and a negative number (`349,\n-36`), which KaTeX's tall
    delimiters use. It wrote `NaN` into the page's content stream, and poppler stopped drawing
    the rest of the page: the math gallery's matrix slide was blank but for the photo. A
    second delimiter was silently drawn with wrong coordinates. Path data is now re-spelled
    into one token per number before pdf-lib sees it (arc flags handled). Any shape whose path
    still does not convert to finite numbers stays in the photo, so no future parser quirk
    can blank a page.
  - **Reviewed by eye:** every page with a run over 55 px (164 pages), screen above and
    writer below. Beyond the path bug the sweep found one more real defect. SVG shapes had no
    paint-over check (images and borders did), so a diagram drawn as vectors buried the card
    laid over it (`scene` slide 5). A shape that anything outside its SVG paints over now
    stays in the photo. Gallery-wide that moves exactly those 2 shapes.
  - Everything else it flags is the same line drawn crisper than the 1x screenshot, or the
    photo's JPEG bleeding a 1px colored hairline into the next row (below).
- **Known limits:**
  - The photo is JPEG, which stores color at half resolution. A 1px colored hairline left in
    the photo (the top keyline of a dark slide) bleeds a little color into the row below.
  - A later sibling's outer `box-shadow` over a border is not hit-testable, so a border can
    draw over it.
  - The 1x background photo is soft at deep zoom or in print; `LATTICE_PDF_PHOTO_SCALE=2`
    trades size for it.
  - Pseudo-element text, emoji and system-font characters stay in the (2x) photo.
  - The photo is Chrome's own raster, so the PDF is byte-reproducible on one machine but not
    across machines — the same as before for anything Chrome rasterized.

