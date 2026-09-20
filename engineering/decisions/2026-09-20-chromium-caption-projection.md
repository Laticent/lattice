---
status: shipped
summary: >
  The CLI's `--captions` projection now runs in the Chromium the export already launched,
  not in three jsdom windows. Measured on `examples/read-along-captions.md`, whose render is
  2.9 MB of self-contained HTML, medians of five fresh processes: 536ms to `require('jsdom')`
  cold, 122ms for the DOMPurify window, 1715ms to parse the document and 124ms for the nine
  per-slide windows — 2529ms, against 323ms for the same work inside a page, scratch page
  opened and closed included. Across the nine decks that ship a committed `.vtt`, measured
  with the two arms alternating over four rounds, a full `--captions` export fell from 47.99s
  to 27.36s (-43%), and all 99 artifacts — PDFs, deck `.vtt`, per-slide `.vtt`, notes — are
  byte-identical to the jsdom arm.
  TWO things the bake-off note got wrong, both found by trying to build this. Its premise
  that the jsdom windows run "while a puppeteer page is open in the same process" is FALSE:
  every output branch calls `closeBrowser()` as soon as it has its pixels, hundreds of lines
  before the caption path runs, so the first working version projected nothing and warned
  "Protocol error: Connection closed". The projection is hoisted to the last line where all
  five branches still have a browser. And the path was already BROKEN for everyone but us —
  jsdom is a devDependency, so `require('jsdom')` threw in a published install and
  `--captions` wrote no caption track at all: measured with node_modules/jsdom moved aside,
  2 cues against 27. The fix is therefore a bug fix that happens to be 7.8x faster, not only
  a perf change.
  The projection kernel is untouched: a new build step bundles the same
  `prose-projection.mjs` and `createSlideSanitizer` the Studio's Present path already runs in
  a browser into a 39 KB IIFE, evaluated on a scratch `about:blank` page. An independent
  check re-ran both kernels over 31 rendered documents (~460 sections) and found every
  projected script identical; it also found three failure-path defects, all fixed here.
---

# The caption projection moves into the browser we already opened

## The answer

**`--captions` projects in Chromium now.** `lattice-emulator.js`'s
`projectDeckSpeechFromHtml` used to build three jsdom windows — one to host DOMPurify,
one for the whole rendered document, and one more per slide to re-parse each sanitized
section. It now evaluates one bundle on a scratch page of the export's own browser and
takes the finished script back across a single CDP call.

This is the follow-up `2026-09-20-dom-library-bakeoff.md` scoped and declined to smuggle
in. Its reasoning held; two of its facts did not, and both are below.

## What it costs today, measured

**The machine, and how many runs.** One sandbox container — 4 cores, Node 22.22.2,
15 GB, `Intel(R) Xeon(R) @ 2.10GHz`, the same fingerprint `test/benchmark/baseline.json`
is blessed on. Wall clock on a shared runner is noise-prone, which
`2026-08-03-performance-guard.md` settled and `2026-09-20-dom-library-bakeoff.md` repeats,
so **every number below is a median or a mean of repeated runs and carries its spread**.
An earlier draft of this note printed single-run figures with no run count, no machine and
no caveat, and an independent check could not reproduce the "after" column. **The ratios
are the durable part; the absolute seconds are this box's.**

`examples/read-along-captions.md`, whose `cleanDocHtml` is **2.9 MB** — a self-contained
render carrying ~2 MB of inlined `lattice.css` and base64 fonts. Five fresh processes for
the jsdom arm (so each pays its own cold `require`), five runs for the in-page arm:

| step | jsdom, median | range |
|---|---:|---|
| cold `require('jsdom')` + `dompurify` | 536.0ms | 404.7–1182.7 |
| window 1 — host DOMPurify | 121.5ms | 60.3–137.0 |
| window 2 — parse the document, query 9 sections | **1715.0ms** | 1617.2–1942.4 |
| window 3 ×9 — sanitize + re-parse each section | 123.6ms | 112.2–163.4 |
| `projectDeckToScript` | 36.6ms | 34.1–43.5 |
| **whole operation** | **2528.7ms** | 2243.0–3460.0 |

| | in the page, median | range |
|---|---:|---|
| open the scratch page, inject, project, close | **323.3ms** | 307.3–704.2 |

**7.8x**, and the in-page figure is the honest one: it includes opening and closing the
scratch page, not just the projection.

The bake-off measured its "whole deck" fixture at 321 KB and jsdom at ~202ms. The real
input is nine times that, because a deck's rendered document is mostly stylesheet and
jsdom builds CSSOM for all of it. That is where the extra ~1.5s was hiding.

End to end, one `--captions` export per deck. **Four rounds, the two arms alternating
inside each round** so machine drift lands on both, one discarded warm-up pair first; the
figures are means of four and the per-deck spread was under 0.9s on every row:

| deck | before | after | Δ |
|---|---:|---:|---:|
| chart-narration | 4.52s | 2.20s | −2.32s |
| diagram-narration | 6.98s | 4.08s | −2.91s |
| emphasis-narration | 3.70s | 1.71s | −1.99s |
| locale-guard | 3.86s | 1.85s | −2.01s |
| radar-narration | 5.84s | 3.67s | −2.17s |
| read-along-captions | 3.94s | 1.88s | −2.07s |
| sequence-narration | 6.61s | 3.99s | −2.62s |
| typed-diagram-narration | 6.62s | 4.12s | −2.50s |
| xychart-narration | 5.91s | 3.86s | −2.05s |
| **total** | **47.99s** | **27.36s** | **−20.63s (−43.0%)** |

Per deck the saving is 2.0–2.9s, which is the ~2.2s difference above plus whatever each
deck's larger document costs jsdom — consistent across all nine, which matters more than
any single row.

**The bench now covers this path** — `cli · captions (deck projection)`, the only dataset
in `test/benchmark/engine-bench.mjs` that passes `--captions` (HARD RULE #19(c)). Same
deck, three iterations, this box:

| | before | after | Δ |
|---|---:|---:|---:|
| `cli · captions (deck projection)` | 4.07s | **1.93s** | **−52.6%** |
| `cli · portrait-roadmap (1 nav)` *(control, no captions)* | 1.95s | 1.87s | −4% |
| `cli · cover-paginate (4 nav)` *(control)* | 2.21s | 2.21s | 0% |

**Only the new row is blessed into `baseline.json`.** `--bless` re-measures the render and
edit tiers unconditionally — `renderTier()` sits behind no flag — and on this sandbox the
two navigation rows read +23.7% and +12.4% against the committed numbers while the
image-set row read −5.2%. That is noise on a shared box, inside the browser tiers' ±50%
band, and none of it is caused by code that only runs under `--captions`; ratcheting it
would bury someone else's drift in this PR. So the committed diff is one added row.

**`bench:check` is already red on `main`, and not because of this.** Four rows report a
WORKLOAD change on the current tree: `charts` 22 → 23 slides, and the CLI page counts
5 → 15, 9 → 33, 30 → 43. The baseline has gone stale against the decks it measures. Off
the path of this change, so it is logged below rather than absorbed here; the gate is
on-demand, not a merge gate, which is why nobody has noticed.

## The premise the bake-off note got wrong

The note says, and `tools/dom-bakeoff/chromium.mjs`'s header repeats:

> `lattice-emulator.js:5311-5316` builds three jsdom windows **while a puppeteer page is
> open in the same process**.

It does not. `renderBody` closes the browser the moment each output branch has what it
needs — the vector PDF right after `page.pdf()`, the raster PDF after its screenshots,
image-set after reading the slide titles, `.html` after the page count, PNG/PPTX after
their screenshot loop. `writeCaptionsSidecar` runs at the tail of `renderBody`, after all
five. The jsdom windows were built in a process whose Chromium had already exited.

The first working version of this change was written against the note's premise and
failed exactly as you would expect: `warning: caption projection failed (Protocol error:
Connection closed.); no caption track will be written for this deck`, and a `.vtt` with
two authored captions instead of nine narrated slides. It is the fifth false claim this
bake-off has produced, after the four its own independent checks found, and it has the
same shape as the others: a sentence nobody re-derived, sitting next to numbers that were.

So the projection is **hoisted** to just before the `OUT_FORMAT` branch — the last line
where all five branches still have a browser — and its result is passed down to
`writeCaptionsSidecar`. `cleanDocHtml` is final there: the Fit-Spine split and the rails
pass are the only writers and both have run.

## The other thing: this path was broken in every published install

`jsdom` is in `devDependencies`, not `dependencies`. The old code's first line was
`require('jsdom')`, inside a `try` whose `catch` warns and returns `[]`. So for anyone who
`npm install`ed the package and passed `--captions`, the projection threw on module
resolution, the warning scrolled past, and the deck shipped with only its authored caption
overrides — silently missing the generated narration that is the whole feature.

Nothing measured that, because every test and every gate runs from this repo, where the
devDependency is present. **So it was measured directly**: move `node_modules/jsdom` aside
and export `examples/read-along-captions.md` with `--captions` on both arms.

| arm | result |
|---|---|
| before (`git HEAD`) | `MODULE_NOT_FOUND`, the warning, and a `.vtt` with **2 cues** — the deck's two authored caption overrides, nothing generated |
| after (source) | **27 cues**, byte-identical to `examples/read-along-captions.vtt` |
| after (`dist/lattice-emulator.js`, which is the package `bin`) | **27 cues**, byte-identical to the same golden |

Two cues, in a file named after the deck, is the worst version of this: not a crash, a
caption track that looks delivered. The fix removes the last `require('jsdom')` from
`lattice-emulator.js`; a test arm now asserts the file constructs no jsdom window, so it
cannot come back without a red.

**The bundle still resolves jsdom, and that is the `--player` path, not this one.**
`dist/lattice-emulator.js` inlines `lib/export/html-player.js`, whose `require('jsdom')` is
lazy and inside a function — so it costs a published install nothing until `--player` is
passed, at which point it hits the same wall. Recorded as a follow-up below rather than
fixed here.

## How it is built

`tools/build-speech-projection-bundle.js` → `lib/export/speech-projection-bundle.generated.mjs`,
an esbuild IIFE string exposing `window.__latticeSpeechProjection.projectDeckSpeech(docHtml)`.
39 KB minified. It mirrors `tools/build-anima-player.js` exactly — same packaging reason
(the consumer is a `page.evaluate`, which takes source text), same freshness gate, same
generated-module shape.

**The kernel is not duplicated** (HARD RULE #1). The bundle holds the same
`lib/transformers/prose-projection.mjs` the Studio's Present path already runs in a
browser, and the same `createSlideSanitizer` dependency-injection seam — with the page's
own `window` supplied where a jsdom one used to be. That seam is why this was a packaging
change rather than a port: `lib/core/sanitize-slide-html.mjs` was already written to take
its DOMPurify and its window from the host.

**One round-trip for the whole deck.** An empty CDP call costs ~0.5ms, so the parse, the
sanitize and the projection all happen inside a single `evaluate`; only the finished
script crosses the boundary. Projecting section-by-section would pay the floor nine times
for no gain.

**A scratch `about:blank` page, not the render page.** Deck-authored script runs in the
render page and could have shadowed `DOMParser` or patched `Object.prototype`, where jsdom
always handed the projection a clean realm; and injecting a global into the page that
produced the deliverable is a side effect on an artifact-bearing surface. A scratch page
is what this file already does for the SVG raster and look-diagram passes. It is closed in
a `finally`.

**And it has a cost of its own, which those two reasons read as if it does not.** Opening
a second page **backgrounds the render page** for as long as the projection runs. Measured
on the repo's own Chromium 131: `document.visibilityState` flips to `hidden`,
`document.hidden` to `true`, `hasFocus()` to `false`, and a `requestAnimationFrame`
callback registered on the render page does not fire. The vector-PDF path already did this
to itself — `rasterizeSvgImagesInPage` opens a scratch page before `page.pdf()` — but with
`--captions` it now reaches `.html`, `--player`, PNG, PPTX and image-set as well. The
projection is awaited, so the page is visible again before any pixel is taken, and it moves
no bytes: `.pdf`, `.html`, every PNG of the set and every member of the `.zip` are
identical with and without `--captions`. It is recorded rather than argued away, because a
deck listening on `visibilitychange` would see a hide/show cycle that is ours.

**A crashed or wedged Chrome rethrows rather than degrading.** The projection's `catch`
turns any failure into a warning and an empty script — right for a projection bug, wrong
for a dead browser, and wrong *silently* on exactly one family of branches. After
`.html` / `--player` / `--fluid` read their page count, the only remaining CDP call sits in
a bare swallowing `try`, and `closeBrowser` swallows too; so a browser this projection
killed would have exited 0 with no `.vtt`, a possibly-wrong page count and **no hardened
retry**, where the PDF and raster branches were already covered by their next guarded call.
`isTargetGone(e)` now rethrows before the warning. Two smaller ones from the same review:
the scratch page is closed **through the watchdog** (a `try/catch` answers a rejected
promise and does nothing for one that never settles — that is what `guard` is for, #502),
and because `guard` races rather than cancels, a `newPage()` the watchdog gave up on is
closed when it arrives instead of holding a page open for the rest of the run.

## Evidence

**Byte-identity, not "tests pass".** Every deck in the repo that ships a committed `.vtt`
golden was exported both ways with `--captions`:

- 9 decks × {`.pdf`, deck `.vtt`, per-slide `.vtt` ×N, `.notes.txt`} = **99 artifacts,
  zero differences** between the jsdom arm and the Chromium arm.
- **Only the deck-level `.vtt` has a committed anchor.** There are no committed per-slide
  `.NN.vtt` goldens, so 72 of those 99 files are a comparison between my two arms and
  nothing else. What anchors them is the deck `.vtt` they are cut from, plus the 31-document
  Chromium-vs-jsdom sweep below.
- Every deck-level `.vtt` also matches the file committed in `examples/`, on both arms —
  so the comparison is anchored to the repo's own goldens, not only to itself.
- The PDF and the intermediate `.html` are byte-identical too, which they must be: this
  change touches a sidecar producer, not the render.

**The test arms are mutation-proved.** `test/unit/export/speech-projection-bundle.test.js`
drives the shipped bundle in a jsdom window and compares its output entry-for-entry against
the Node kernel call it replaced. Three mutations were applied and each turned an arm red:
a selector that matches nothing, a bypassed sanitizer, and a reintroduced `new JSDOM(`.

**What the unit file structurally cannot check, and who does.** It drives the bundle in a
jsdom window, so it compares the kernel against itself rather than against Chromium, and
it asserts an absence (`no new JSDOM(`) plus, now, the call site itself — because deleting
`const captionScript = …` left every other arm green. The behavioral guard is one tier up:
`test/integration/export/html-player.test.js` drives the real emulator with `--captions`
and asserts narrated text in a real `.vtt` (32/32).

**The independent check widened the parity sweep well past those nine decks.** It ran the
jsdom kernel call and the shipped bundle — in a real Chromium page, which this file's
tier cannot — over **31 rendered documents**, the 116-section
`test/integration/baseline-decks/gallery.md` plus 30 component galleries, roughly 460
sections spanning code, Mermaid diagrams, team-profile, compare-table, quadrant,
split-panel, list-tabular, kpi, waterfall and quote. Every script array was identical. It
also measured the inert-document claim rather than assuming it: the shipped bundle run
against a deck carrying a `<link rel=stylesheet>`, an `@import`, a CSS `url()`, a
`<script src>`, an `<img src>`, an `<img onerror=fetch(…)>`, an `<iframe src>`, a
`<video poster>` and a `<source src>`, all pointed at a local HTTP server, produced **zero
server hits and zero CDP-seen requests** — `DOMParser.parseFromString` builds a document
with no browsing context, so there is no new fetch channel off the exporting author's
machine.

That second mutation is worth recording, because the first version of that arm **passed it**.
It probed with `<script>steal()</script>` and an `onerror` handler — and the projection's own
`SKIP_SELECTOR` drops `script` and `style`, while the projection reads text rather than
attributes, so the narration is identical whether the sanitizer ran or not. Five payload
shapes were measured; only `<svg><foreignObject>` moves the output, because DOMPurify removes
it *with its contents*. That is the payload the arm uses now. A sanitizer probe that cannot
fail is precisely the defect this bake-off keeps producing, and it was reproduced here in the
change that documents it.

## What this does NOT claim

**It does not make Chromium a general DOM provider.** `withDom` is still synchronous and
CDP is still not; `lib/core/dom-provider.js` is untouched. This is scoped to the one caller
that already runs beside a browser.

**It does not speed up any other export.** A run without `--captions` never built these
windows and is unchanged — measurably so: the PDFs are byte-identical and the non-caption
decks were not re-timed.

**It does not remove jsdom from the repo.** `lib/export/html-player.js` still requires it
for the `--player` path, and that path has the same published-install problem this note
describes. It is off the path of this change and is recorded here rather than fixed
(HARD RULE #18) — see the follow-up below.

## Follow-up

- **`lib/export/html-player.js` requires jsdom for `--player`.** Same devDependency
  problem: a published install passing `--player` hits it. Not fixed here — it assembles a
  whole document rather than reading one, so it is a larger change with HARD RULE #22
  stylesheet-sink obligations of its own.
- **`test/benchmark/baseline.json` is stale on four rows** (see above): `charts` renders 23
  slides against a blessed 22, and the three CLI navigation rows render 15, 33 and 43 pages
  against a blessed 5, 9 and 30. Those rows have been recording nothing. A re-bless is one
  command; it belongs in a change that is about the baseline, not this one.
- **`.filter(Boolean)` on the sanitized sections drops a section that fails to re-parse**,
  which misaligns every later slide's caption. The Studio's `projectSectionsToScript` yields
  an empty script at that index instead, deliberately, for exactly this reason. The CLI's
  behavior is preserved byte-for-byte here; the divergence is pre-existing and off-path.
