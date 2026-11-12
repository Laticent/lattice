---
status: in-progress
summary: >
  Why a deck with many Library photos hung Present on a phone and slowed every full-deck surface, and the fix.
  Present built the Stage document on open, through the export render, which writes every photo into the markup
  as base64; 18 phone photos made a 32.8 MB document that ~40 engine passes walked one by one (7.8 s, 1.1 GB in
  Node; ~13 s and ~0.5 GB per build on lattice.style). The engine now carries a large data: value as a short
  stand-in and puts the bytes back once at the end (byte-identical, with a re-render fallback). Present builds the
  Stage only while one is open, in-tab surfaces use the tab's blob: URLs, and five Studio/export scans stop reading
  photo bytes, each exactly. Every export is unchanged apart from its timestamps. Left for the owner: the
  photo-independent cost of the capture exports (print 120 s for 50 slides with no photos).
---

# Photos as stand-ins: the hang in Present, and every full-deck surface

**Date:** 2026-11-11 · **Status:** IN PROGRESS: §1–§4 shipped, §6 is the owner's decision
**Trigger:** the owner: "going to present mode in the studio is super slow and totally broken. it hangs and swiping
doesn't work for several seconds. eventually it even crashes after several swipe gestures and the page reloads."
The deck: "Yearn already has the hard parts", 50 slides, 18 Library photos (PNG, 0.56–2.6 MB each, 24 MB total).
Then: "make these fixes for all surfaces including exports … before and after metrics. no jank."

## 1. The cause

Two old pieces met a deck of photos.

- **#1816 (2026-08-25)** made Present build the Stage (the audience window) document as soon as Present opens, so
  the Stage can open instantly. On a phone, where no Stage can open, the build still ran.
- **#2640 (2026-10-12)** made the full-deck render (`share-export.ts` `buildDeckRender`) carry Library photos as
  `data:` URIs, which a file and a capture frame need.

`buildDeckRender` is the render behind the Stage, the Reading view, the narration script, the Architect's fit check
and every export. With 18 photos its HTML is 32.8 MB instead of 0.2 MB, and the engine's HTML stage (`splitSections`,
`mapSections`, the collage and QR walkers, about forty passes) walks all of it. Measured in Node, `lib/engine`
alone: 0.12 s with short URLs, 7.8 s and 1.1 GB RSS with the photos as `data:`. In the Studio a build took ~13 s on
lattice.style; a phone is several times slower, and the ~1.9 GB peak is what iOS kills a tab for. Not caused by any
change of the week before: the build just before #3114 measured the same.

## 2. The engine: stand-ins (`lib/engine/deferred-urls.js`)

`render()` swaps each `data:` value of 1 KB or more **whose header ends `;base64` and whose body is canonical base64**
in `opts.assetUrls` for `<its own header>lattice<nonce>u<n>z`,
renders, and restores every stand-in in `html`, `css`, `flatCss` and the diagnostics in one pass. The header is
kept, so every "what kind of URL is this" check (`media-sources.js` `classify`) answers as before; the token is
lowercase alphanumerics, which survive escaping and lowercasing. A stand-in that a pass changed instead of copying
leaves its token outside a whole stand-in, `restore` returns null, and the deck renders again with the bytes in
place. The host's `imageSize` is asked about the URL it minted, never a stand-in.

**Why only canonical base64** (the checker's finding). A stand-in hides the body from every pass, and the fallback
only catches a pass that changes the TOKEN. A pass that would have escaped, refused or rewritten the BODY sees an
innocent token instead, and the restore pastes the raw body back. The first cut deferred any long `data:` value,
and a raw `data:image/svg+xml;utf8,<svg …>"><img src=x onerror=…>` came out as live markup where the engine had
escaped it; a body of parentheses got past the `url()` refusal; line breaks skipped the custom-property escape. No
pass escapes, refuses or rewrites the base64 alphabet, so only that is deferred; every other body passes through.
The Studio's photos are always canonical base64 (`blobToDataUri`), so the gain is unchanged. The test carries all
three shapes and fails if the rule is loosened.

`test/unit/core/deferred-urls.test.js` renders every image-bearing deck in `examples/` plus the gallery both ways
and requires identical output with no fallback taken; a third test drives the fallback. Node, this deck:
7.8 s / 1.1 GB → 0.19 s / 260 MB.

## 3. The Studio: build less, and only what the surface needs

- **The Stage is built while Present is open and a Stage is open or offered** (`PresentOverlay.tsx` `stageBuild`):
  `stageWanted` holds from the press that opens a Stage to the teardown that ends it (a write that throws leaves the
  window open, so it does not end it); `stageOffered` is the launcher's own `md` breakpoint. A laptop builds at
  idle, so the Stage still opens on the deck at once; a phone never builds; an `S` on a narrow window builds on
  open, behind the holding page. Building only on open was tried first and cost a laptop presenter ~1.8 s of
  "Preparing the stage…"; with §2 the idle build blocks ~0.4 s. The effect keys on the one boolean, so opening the
  Stage does not rebuild, and its cleanup drops the built document, so a Stage never opens on a deck that changed.
  The fill now waits for the deck document (`stage-window.js` `whenDeckWritten`): a write replaces
  `documentElement`, and fullscreen leaves with it (`stage-placement.spec.ts` caught it). The second build seen in
  dev was React StrictMode's effect replay; production built once.
- **`buildDeckRender(…, photos)`**: `'inline'` (the default) for anything that writes a file or a capture frame;
  `'live'` for in-tab surfaces, which get the preview's own `blob:` URLs through `asset-render-hook.ts`: the Stage
  (a same-origin window this tab wrote; its rebuild keys on `extraCss`, which carries the asset stamp), the Reading
  view, the narration script (Present opened it, and it sanitized 32.8 MB each time) and the Architect's fit check
  and `render_slide` (whose camera reads a `blob:` picture's bytes itself; driven in the dev Studio on this deck's
  collage slide, all six photos drawn). `sanitize-slide-html.mjs` admits this origin's `blob:` on `img src`.
- **`blobToDataUri`** encodes with `FileReader` (native, async). Same RFC 4648 string as the chunked path; both are
  held to Node's encoder (`media-urls.test.ts`, `media-urls.encode.test.ts`).

## 4. Scans that read photo bytes, made exact and cheap

Profiling each export against the same deck with its photos removed found these, each fixed with an oracle test
that compares against the old code verbatim:

| Where | What it did with 33 MB | Fix |
|---|---|---|
| `player-prune.js` `probeGate` | held every photo in every computed-style snapshot (`background-image`) | numbers values over 256 chars; same verdict (one-to-one) |
| `player-fonts.js` subset | `[...new Set(html + …)]`: a copy and a string per character | `distinctChars`: one pass, a flag per code point, same order |
| `emoji-faces.js` `slicesFor` | `Array.from` of every code point (1.2 GB churn) | one native regex over the candidates |
| `glyph-scan-text.js` | emoji and icon scans read base64 runs | runs keep header + last 16 chars; no match can start inside one |
| `media-sources.js` `webOrigin` | lowercased each whole photo URL to read its scheme | decides from a 1 KB head when the head rules out the web |

## 5. Before and after

Production builds of `main` (9de8eb23a) and this branch, served locally, Chromium, the owner's deck. Desktop
1440×900 for exports; Present at iPhone 13 size with real touch swipes, tapped straight after opening. "Blocked" is
the sum of main-thread long tasks; "longest" the largest one; memory is the JS heap peak.

| Surface | Before: time · blocked · longest · memory | After |
|---|---|---|
| Present (phone, 6 swipes) | swipe 3 took 19.2 s · 19.8 s · 9.3 s · 1,947 MB | swipes 0.16–0.34 s · 0.4 s · 0.17 s · 68 MB |
| Present (laptop: open, 6 s, one arrow key) | key took 8.9 s · 13.6 s · 6.4 s · 1,597 MB | key 64 ms · 0.7 s · 0.19 s · 78 MB (Stage pre-built at idle) |
| Present (WebKit, iPhone size, 6 arrow keys) | opened 4.2 s · 6th key 8.0 s | opened 1.0 s · keys 42–423 ms |
| Stage window | built on Present open (~20 s blocked) · 34.2 MB `data:` doc | 1.4 s to the deck · 0.1 s · 0.1 s · 60 MB · 1.6 MB doc, `blob:` |
| Reading view | 15.7 s · 14.5 s · 9.5 s · 1,606 MB | 2.5 s · 1.5 s · 1.1 s · 165 MB |
| Captions | 12.3 s · 10.9 s · 9.1 s · 1,686 MB | 2.7 s · 1.4 s · 0.8 s · 248 MB |
| PDF | 49.8 s · 33.4 s · 10.1 s · 1,375 MB | 35.9 s · 20.9 s · 1.2 s · 299 MB |
| PowerPoint | 56.9 s · 40.5 s · 9.2 s · 1,691 MB | 43.1 s · 27.4 s · 1.3 s · 349 MB |
| LibreOffice | 54.0 s · 39.1 s · 9.1 s · 1,889 MB | 44.7 s · 29.3 s · 1.1 s · 348 MB |
| Images (.zip) | 83.5 s · 52.3 s · 9.4 s · 1,840 MB | 75.1 s · 42.3 s · 1.3 s · 345 MB |
| Webpage (.html) | 47.7 s · 24.6 s · 9.5 s · 2,150 MB | 20.7 s · 8.0 s · 1.1 s · 680 MB |
| Print (Download PDF) | 145.0 s · 118.1 s · 9.2 s · 1,692 MB | 120.7 s · 97.7 s · 2.5 s · 349 MB |
| .lattice, Marp bundle | 1.6 s, 4.6 s (no render) | unchanged |

**Every exported file is the same.** PowerPoint (267 parts), LibreOffice, captions, the webpage and print match
byte for byte or part for part; the PDF matches page by page (content and every image stream) and differs only in
`CreationDate`/`ModDate`, as two runs of `main` do; the images zip differs only in its manifest's `createdAt`.

## 6. What is left, and is the owner's

The same 50 slides with **no photos** export in PDF 28 s, images 67 s, print 120 s, with 15–98 s of main-thread
blocking. That cost is the capture pipeline itself (drawing each slide, resampling and JPEG-encoding on the main
thread), photo-independent and older than this change. With photos, about 3.4 s of the PDF's remaining overhead is
the real resample and encode of the 18 photos, which sets the output bytes. Options, measured, are in the PR.

## 7. The capture exports without photos: where 50 slides go (design, owner-confirmed scope)

The owner chose to take this on in the same PR ("Everything in this PR"). Measured on the same deck with its photos
removed (dev server, Chromium, CPU profiles and an instrumented `Blob`):

| Export | Wall | Where it goes |
|---|---|---|
| PDF | 26 s | 7.4 s before the first shot (render, capture frame, fonts, diagrams, chart flatten) · 17.5 s for 50 shots, ~350 ms each · ~1.2 s compose |
| Print (Download PDF) | 110 s | **51 s in jsPDF's own deflate**: `addImage` decodes each slide's PNG and compresses it again in script, on this thread (`assembleSheetPdf`) · the shots as above |
| Images, PowerPoint | 57 s, 34 s | the shots (`drawSlide` ~9 s of rasterizing) and idle waits between them |

**Why a shot costs ~350 ms.** The camera (`lib/core/slide-camera.mjs`) draws each slide as an SVG `foreignObject`
image, and every slide's SVG is **2.0 MB**: 1.3 MB of it is the WHOLE page stylesheet and 0.67 MB is 26 embedded
font faces (11 of them emoji slices), the same on every slide. The browser parses and matches 100 MB of CSS and
fonts per export.

**Moves, byte-identical first:**
1. Print: run jsPDF's sheet assembly off the main thread (same library, same bytes): the 51 s stops freezing the
   page. Faster still, and NOT byte-identical: hand jsPDF the already-deflated image stream, or compose sheets with
   `pdf-compose` as the PDF export does. That changes the file and goes to the owner with rendered artifacts.
2. Per-slide sheet: give each shot only the rules and faces its slide can use, with a gate that the slide's pixels
   are identical to the full-sheet shot (the same discipline as the player prune's computed-style gate).
3. The 7.4 s before the first shot: profile and cut, unchanged output.
4. Photos: resample and JPEG-encode in a worker (same kernels, same bytes); carry photos by reference to the webpage
   file's sink (680 MB toward ~250 MB).

### 7.1 Shipped: print's PNG step in the pool

`assembleSheetPdf`'s per-page jsPDF `processPNG` runs in a worker pool (`export/pdf-image-pool.js`, on
`lib/worker-pool.js`, size `poolSize()`), started as each slide is photographed (`rasterizeDeckImages` →
`startPng`), and the document's own `processPNG` returns the worker's result for that image. jsPDF still assigns the
index and alias and skips a repeated picture. A re-placed sheet (a paper change on the same pictures) runs no job.
`pdf-image-pool.test.ts` holds the worker's object equal to jsPDF's and the whole file byte-identical, with an arm.
Measured in the dev Studio on the owner's deck, pool off → on: **119 s → 58 s, 95 s → 32 s blocked, longest 2.6 s →
1.0 s**; all 50 pages and every image stream identical, only `CreationDate` differs. Before the overlap, three workers
gave 76 s against two's 84 s (4 cores here); the pool stays at its `min(2, cores − 1)` until measured on a
laptop with more cores.

Per-slide stylesheet trimming (§7 move 2) was measured and DROPPED: dropping 73 % of slide 5's rules saved 14 ms of
187 ms. A slide's cost is the browser PAINTING it (~140 ms at 2×, the same on a second draw of the decoded image),
not parsing its CSS, and this sandbox paints in software, so it overstates that cost against a laptop's GPU.

## 8. Print, audited against the past (owner: "this used to be super fast several weeks ago")

**It was not faster: it was skipping the photos.** The Studio as of 2026-10-20 (`e6cb9ed5b`), built and run here on the
owner's deck: Chromium print 113 s (96 s blocked, 7.0 s longest, 1.7 GB); WebKit print 98 s, 8.4 MB, and every photo
on the collage slide printed as an EMPTY box. `150bddab6` (2026-11-03, "iPhone photo exports: read the photo, finish the
draw") made WebKit draw them, so an iPhone print now does the photo work it used to skip.

**Where today's print goes** (timed per stage, owner's deck, Chromium / WebKit): setup 1.3 s / 13.4 s · photographing
50 slides 29.4 s / 32.3 s · **waiting for each slide's PNG before the next shot 17.4 s / 21.0 s** · jsPDF assembly
3.1 s / 5.5 s · total 60 s / 82 s. The WebKit setup is `flattenChartSvgs`: 10.8 s there, 1.1 s in Chromium (§8.2).

### 8.1 Shipped: photograph the next slide while the last one encodes

`rasterizeDeckImages` photographs a slide (`shootThenEncode`) and starts its PNG in the picture pool, then photographs
the next, holding at most three pictures waiting. Same pixels, same writer: all 50 pages and every image identical.
Chromium 60 s → 55 s and 32 s → 20 s blocked; WebKit 82 s → 73.5 s.

### 8.2 Measured, not yet shipped: `flattenChartSvgs` is an html-to-image workaround the camera does not need

Its comment says why it exists: html-to-image dropped the stylesheet from SVG charts. The slide camera lays every slide
out with the page's own stylesheet (the 2026-10-25 note says so), and skipping the flatten left the owner's print
byte-identical in Chromium AND WebKit, and the PDF export identical, while saving 11 s of a WebKit print (68.6 s →
57.6 s). Being checked across every chart kind before it changes.

## 9. Print compresses each page once (owner sign-off, 2026-11-12)

The printed sheet compressed every slide twice: the shared writer (`lib/core/canvas-encode.mjs`) wrote a size-tuned PNG,
then jsPDF's `processPNG` decoded it and deflated the pixels again. The PDF export never did: its writer carries the
PNG's compressed bytes as they are (`rgbPngXObject`). That reading now lives once, `lib/core/png-idat.mjs`
`rgbPngIdat`, used by both writers, and the sheet hands jsPDF an image built from those bytes
(`export/pdf-image-pool.js` `directPng`). A PNG with transparency still takes jsPDF's step in the pool.

Measured on the owner's deck: Chromium print 55 s → 41.6 s, WebKit 73.5 s → 63.6 s. All 50 images decode to identical
pixels (pixel comparison of every image stream, and `pdf-image-pool.test.ts` decodes both files). The file is larger,
22.19 → 22.70 MB in Chromium (+2.3 %) and 13.99 → 14.90 MB in WebKit (+6.5 %), because jsPDF's `'SLOW'` deflate
squeezes harder than the platform `CompressionStream`, which has no level. A level-9 deflate of the same filtered rows
would be 21.50 MB but costs ~0.8 s an image even in native zlib, and the browser offers none, so it would be a script
deflate in the workers: slower on a phone for ~3 %. The owner signed off on the faster, slightly larger file.
