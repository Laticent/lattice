---
status: in-progress
summary: >
  The Studio's PDF export spent ~1 s per slide inside jsPDF's `addImage`, which
  INFLATES the canvas PNG in JavaScript and re-deflates it into the PDF. The first
  fix parallelized that cost across four encode workers for 1.9-2.8x at +0.5-1.4 GB
  of peak memory; an inversion pass then asked why the cost existed at all. The
  export now reads the bitmap's pixels once and deflates them with the platform's
  own CompressionStream into a pdf-lib image XObject — ONE worker, 8.0-9.7x faster
  on the real surface across Chromium, Firefox and WebKit, pixel-identical output
  (AE = 0 over 56 pages), a 5% smaller file, and peak memory within noise in two of
  three engines.
---

# The PDF export stops round-tripping through a PNG

## The question this came from

Is there room for batching and scatter/gather to Web Workers in the engine's render
and export paths? Not in the preview render — the engine transform is already ~19-39
ms for 58 slides and everything expensive around it is DOM-bound — but the browser
PDF export was spending seconds a slide in a worker, so that is where the work went.

## The measurement that started it

`deck-export.js` pipelines two halves: the main thread clones and draws each slide
(`html-to-image` → `createImageBitmap`) and transfers the bitmap; the worker encodes
it. The backpressure window couples them, so the shipped code cannot say which half
is the limiter. Raising the window to 999 in a throwaway build uncouples them.
Measured on the REAL Studio export (the first 20 `---` blocks of
`examples/gallery-jargon.md` = 18 rendered slides, 4-core sandbox):

| Engine | main-thread clone+draw | worker encode | ratio |
|---|---:|---:|---:|
| Chromium 141 | 256 ms/slide | 2075 ms/slide | 8.1x |
| Firefox 142 | 651 ms/slide | 3146 ms/slide | 4.8x |
| WebKit 26 | 319 ms/slide | 1078 ms/slide | 3.4x |

## The first answer, and why it was wrong

The obvious read is "the consumer is the pipeline, so run four of them". That was
built: slides dealt round-robin across one worker per spare core, each lane building
its own PDF, pdf-lib re-interleaving them in slide order. It worked — 2.16x / 2.43x /
1.97x on the real surface, page-for-page identical output, tests and an e2e oracle to
match.

Then a Munger-inversion pass asked the question the implementation had skipped: **why
does the encode cost a second a slide at all?** The answer is that jsPDF's
`addImage(…, 'PNG')` fully decodes the canvas PNG to raw pixels in JavaScript and
re-deflates them. The pixels were already in the canvas, and every engine ships a
native deflate.

That reframed the lanes as a correct implementation of the wrong optimization, and
their costs were real: +484 MB (Chromium), +914 MB (Firefox), +1389 MB (WebKit) of
peak browser RSS on an 18-page export; a main-thread merge that grows with the deck
(measured 853 ms at 500 pages); four stall points instead of one; and a device
heuristic to keep phones out of the deep end, which a red-team pass then showed did
not reach an iPad with a keyboard, or Firefox and Safari on a low-memory machine
(neither reports `navigator.deviceMemory`). All of that was deleted.

## What ships instead

`pdf-image-stream.js` is the new kernel and `pdf-export-worker.js` uses it:

1. Draw the transferred bitmap onto the reusable scratch canvas over a white
   underlay. (The capture is RGBA and its text is anti-aliased against transparency;
   dropping alpha without compositing changes every glyph edge — measured, before the
   underlay was added.)
2. `getImageData` once, pack the rows PNG-predictor style (`[0, r,g,b, …]` per row,
   alpha dropped), and deflate them with `CompressionStream`.
3. Register that as a `/FlateDecode` image XObject with `/Predictor 15`, add a page,
   and write its content stream directly — `q W 0 0 H 0 0 cm /Im0 Do Q`.
4. Assemble the document with pdf-lib: page boxes matched to jsPDF's `px_scaling`
   (px × 4/3), review comments as `Text` annotations, and `/Producer` stamped with
   Lattice's own provenance rather than the library's.

The `jpeg` page-format preference now hands the canvas's own DCT bytes to
`/DCTDecode` with no re-encode either.

Four things a second checker pass found and this now carries:

- **Annotation text is written as a hex string, always.** pdf-lib's `PDFString.of`
  does no escaping, so a comment containing `)` — `ship it :)` — closed the literal
  early and corrupted the annotation; and because pdf-lib packs a page's objects into
  one object stream, that took every note on the page with it. The jsPDF lane escaped
  properly, so this would have been a regression.
- **The fallback lane's page orientation now follows the deck.** It hardcoded
  `landscape`, which makes jsPDF swap a portrait format: a `size: portrait` deck got a
  960×768 pt landscape page with the image drawn 768×960 over it. Pre-existing, but
  squarely on this change's path — the two lanes are supposed to produce the same page.
- **A long comment thread wraps into another column** instead of walking off the
  bottom of the page (25+ notes on one slide put a rect outside the MediaBox).
- **The page box and the draw matrix are pinned by literals**, not derived from the
  constant under test. A wrong `PX_TO_PT` and a vertically flipped matrix both passed
  the first version of the suite; both now fail it.

Two things worth knowing for the next reader:

- **pdf-lib's `pushOperators` is not the way to draw here.** A page built with it
  round-trips with an EMPTY `/Contents` and renders blank (measured). The content
  stream is written explicitly.
- **`PDFDocument.load(bytes)` stamps pdf-lib's own `/Producer` into whatever it
  loads.** Anything checking that field has to pass `{ updateMetadata: false }`, or
  it is reporting on the reader, not the file.

## The result, on the real surface

Same deck, same machine, before = the shipped pipeline, after = this one:

| Engine | before | after | speedup | peak browser RSS |
|---|---:|---:|---:|---|
| Chromium 141 | 39.6 s | **4.6 s** | 8.6x | 958 → 960 MB |
| Firefox 142 | 56.1 s | **5.8 s** | 9.7x | 1854 → 2111 MB |
| WebKit 26 | 48.7 s | **6.1 s** | 8.0x | 1724 → 1593 MB |

A 56-page deck in Chromium: **130.8 s → 14.7 s** (8.9x), 12.78 MB → 12.15 MB.

Isolating the encode alone (same real slide bitmaps, one worker, no capture):

| Engine | jsPDF PNG | native deflate | speedup |
|---|---:|---:|---:|
| Chromium | 824 ms/slide | 114 ms/slide | 7.2x |
| Firefox | 1186 ms/slide | 109 ms/slide | 10.9x |
| WebKit | 1010 ms/slide | 135 ms/slide | 7.5x |

The pipeline is now producer-bound in every engine — the remaining cost is the
clone+draw that cannot leave the main thread.

## How it was verified

| Claim | Evidence |
|---|---|
| The pages are unchanged | Old pipeline vs new, same deck, rasterized at 30 dpi: **AE = 0 on all 56 pages** (Chromium) and on all 18 (Firefox, WebKit). The encode alone, on identical bitmaps: AE = 0 at 72 dpi |
| The fast lane and the fallback agree | `docs/e2e/pdf-export-worker.spec.ts` exports the same deck through the worker and through the main-thread jsPDF lane (worker script aborted), decodes every page's image — undoing the PNG predictors, which jsPDF really uses and the worker does not — and compares an 8x8 block signature per page. **Mutation-proved**: reversing the worker's page order fails it |
| The kernel is lossless | `pdf-image-stream.test.ts` round-trips a ramp image through pack → deflate → PDF → inflate → unpack and asserts every RGB value, plus that the page's content stream actually draws the image (the blank-page trap above) |
| Comments still land | 20 comments seeded into the real store, exported from the real Studio: 18 text notes, each on its own page, zero on the wrong page, zero orphan page dicts, zero stray `/P` |
| A real reader agrees | Poppler draws the note icon on the exported page; Ghostscript parses the file, all pages, no errors |
| The fallback still catches | The worker script is aborted: the export still delivers, and its pages match the worker lane's (the e2e arm above) |
| Annotation text survives | Parens, backslashes, a trailing backslash, non-ASCII and a newline round-trip through a real pdf-lib document (unit tier) — the exact strings that corrupted the page before |
| The shipped build behaves like the measured one | Every measurement above runs against `astro preview` of `build:e2e`, which skips two head-rewriting steps (`inject-modulepreload`, `hoist-stylesheets`). The full `npm run build` was driven too: same export, 4.8 s, pages identical by digest to the `build:e2e` run, and `check:route-budget` passes with studio `eagerJsGz` at 642.2 KB / 658.7 KB — so the lazy `pdf-lib` chunk stays off the eager path in the build users get |
| The Workspace copy fits | `tools/screenshot.js`-style captures of Workspace → General at 1440, 820 and 390 px, on the built site |
| Nothing else regressed | `npm run lint`, root unit suite (9416), docs unit suite (3958), `build:check`, `tsc`, and the 13 export-adjacent e2e specs (`author-export`, `webpage-export`, `state-chart-export-layout`) |

`tools/bench-pdf-export.mjs` reproduces the wall-clock and the page comparison on any
machine: `node tools/bench-pdf-export.mjs --engine webkit --slides 58 --verify <pdf>`.

## A failure this surfaced, and what it was not

Testing the branch on a real phone, the jargon gallery deck failed with **"PDF failed:
unexpected error"**. It is worth recording that this was NOT the new encode, and how
that was established: blocking the worker script so only the main-thread jsPDF lane
runs — which is exactly the pipeline on `main` — reproduces it identically, on the
same deck, with the same three 404s for `lib/base/_logo/lattice-mark-min.svg`. The
deck's front matter carries `logo: ../lib/base/_logo/lattice-mark-min.svg`, a path
relative to the deck FILE: correct for the CLI, unresolvable on the web.

html-to-image rejects with the raw load `Event`, which has no `.message`, so every
lane's catch printed "unexpected error". `captureError` now translates it, and the
author sees what to fix. Two things it deliberately does not do:

- **It names no URL.** By the time the Event fires, the clone's `<img>` has had its
  `src` blanked, and an empty `src` reads back as the PAGE's own address — measured,
  `http://localhost:4321/studio/`. Naming the failing file needs the capture frame to
  record its failed requests; that is a bigger change than this one.
- **It does not make the export survive a missing image.** A deck with a broken image
  path still fails rather than exporting without it. That is the pre-existing behavior
  and a separate decision.

## What it costs

- **175 KB gzipped** of `pdf-lib` on the export path, lazy-imported (`check:route-budget`
  passes: studio `eagerJsGz` 641.3 KB / 658.7 KB). jsPDF stays for the main-thread
  fallback, so the worker bundle is now the smaller of the two.
- `CompressionStream` joins the worker-lane capability test. A browser without it
  takes the jsPDF fallback rather than writing an uncompressed PDF.
- pdf-lib writes the `Text` annotation without jsPDF's companion `/Popup` object. Both
  render as a clickable note; a viewer that expects a popup dictionary sees one fewer
  object.
- The **JPEG preference is no longer a speed setting**, and its Workspace copy said it
  was: measured on the same 18-page deck, PNG is 4.6 s / 3.3 MB against JPEG's 4.8 s /
  7.4 MB — flat color and hard type are what PNG compresses well. The copy now says
  photographic, which is the case it still wins.

## What this is NOT

- **Not verified on a real phone.** Every number is from headless desktop engines in
  this sandbox (HARD RULE #23). The memory picture is now no worse than what shipped,
  which is why no device heuristic survives in the code.
- **Not a change to the CLI.** `lattice-emulator.js` still rasterizes slides strictly
  serially; measured separately, sharding that across 4 Chromium processes is 2.81x on
  the screenshot stage and 1.56x including the duplicated page load.
- **Not the whole browser export surface.** PPTX (`pptxgenjs`) and the image-set `.zip`
  (JSZip deflate) still run entirely on the main thread, and PPTX embeds its slide
  images through a second encoder that has never been measured against this one.
- **Not a text layer.** The exported PDF is still images: unsearchable, and inert to a
  screen reader. The inversion pass argued that is the more valuable defect to fix, and
  it is untouched here.
