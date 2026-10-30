---
status: proposed
summary: >
  A measured audit of what each Studio activity costs the main thread and memory, beyond startup (which
  2026-10-22/23 already cover). At 4x CPU, export is the worst: a 40-slide PDF keeps the main thread busy
  69 s with a 4.0 s longest task, and the renderer peaks at 1.6 GB (sampled during the export, two runs at 1x). Every keystroke is a long task (163-206 ms
  of main thread), and most of it is React re-rendering the toolbar chrome, not the engine. So an engine
  worker would save about 4 ms per key, and a narrower re-render about 60 ms. First opens of panels freeze
  340-790 ms. The slide map's frame pool adds 280-315 MB on a gallery deck. No leak was found across repeated
  open/close cycles. The service worker deletes the on-device model caches on every update. Ranks fixes by
  measured or bounded impact and names the ones that are the owner's call.
---

# What each Studio activity costs (2026-10-29)

**The answer.** Startup is no longer the Studio's worst moment. These are, in order:

1. **Export.** On the 4x profile, a 40-slide PDF export keeps the main thread busy for 69 s, with a 4.0 s
   longest task. PowerPoint takes 60 s. The page is frozen for most of it. The renderer peaks at 1.6 GB, which is
   in the range where a phone browser kills the tab. The cost is the per-slide capture on the page, not the
   PDF or PPTX worker.
2. **Typing.** At 4x, every keystroke is a long task: 163 ms of main thread per key on the welcome deck and
   206 ms on a 40-slide gallery deck. The largest JavaScript share is React re-rendering the shell and its
   toolbar (Radix, icons, tooltips). The engine and markdown-it together are about 4 ms per key.
3. **First open of a panel.** The Inspector, reading view, slide map, Present and command palette each freeze
   for 340-790 ms the first time.
4. **Memory.** Opening the slide map on a 40-slide gallery deck adds 280-315 MB, and the pool keeps it after the
   map closes, by design.

Two things look like wins and are not. Moving the engine to a worker would save about 4 ms of 163-206 ms per key
on this profile. Precaching or preloading more would not fix the warm start either: a service-worker load with
every chunk cached still takes 3.5 s to the first slide on the phone profile, because the cost is script
execution.

## How this was measured

- **Build:** `main` at `692ec28`, `npm run build` in `docs/` (the production shape), served by
  `docs/scripts/serve-h2.mjs` (HTTP/2, gzip).
- **Browser:** Playwright Chromium (the sandbox's `chromium-1243`), service worker blocked unless a row says
  warm. The Studio opens in the Craft posture (`lattice-studio-settings.posture = 'craft'`, the e2e fixture's
  seed), so the editor and the activity bar are on screen.
- **Profiles:** 1440x900 at **1x** CPU, and 1440x900 at **4x** CPU slowdown as the stand-in for a mid-range
  phone's CPU. The phone *layout* (390 px) was measured only for startup, with `npm run perf:startup`.
- **Per activity:** `Performance.getMetrics` deltas (TaskDuration, ScriptDuration, RecalcStyle, Layout, heap,
  nodes, documents, frames), long tasks from a `PerformanceObserver`, frame gaps from a `requestAnimationFrame`
  sampler, and requests. One run per profile. The CPU profiles (200 µs sampling) and one Chrome trace
  attribute the costs.
- **Memory:** renderer PSS (proportional set size, from `/proc/<pid>/smaps_rollup`) at each stage, and JS heap
  after forced GC for the leak probe.
- **Decks:** the Studio's welcome deck, and the first 40 slides of `test/integration/baseline-decks/gallery.md`,
  loaded through a real `paste` event.
- **Not committed:** the activity harness lives in a session scratchpad. Section 6 proposes committing it as a
  bench.

**One correction made during the run.** The first cut loaded the gallery deck with Playwright's
`keyboard.insertText`. Chrome splits that into one trusted `input` event per line on a contenteditable (1,095
events, each forcing a layout), and it showed a 1.3 s freeze that a real paste does not have. A real `paste`
event costs 34 ms in its handler, then two long tasks of 62 and 96 ms. Every row below uses the real paste.

## 1. What each activity costs

| Activity | Main thread, 1x | Main thread, 4x | Long tasks, 4x | Longest, 4x | Requests |
|---|---|---|---|---|---|
| Boot to first slide (cold) | 1.26 s | 4.31 s | 15 | 378 ms | 233-247 |
| 5 s after the first slide | 0.38 s | 1.08 s | 2 | 271 ms | 83-96 |
| Idle 10 s | 0.14 s | 0.34 s | 0 | — | 0 |
| Type 40 characters, welcome deck | 1.57 s | 6.52 s | 42 | 192 ms | 0 |
| Type 40 characters, 40-slide gallery deck | 2.09 s | 8.24 s | 46 | 176 ms | 4-5 |
| Next slide x10 (welcome) / x20 (gallery) | 0.18 / 0.28 s | 0.58 / 1.07 s | 0 | — | 0 |
| Paste the 40-slide gallery deck | — | 3.31 s | 15 | 451 ms | 38 |
| Command palette, open and search | 0.26 s | 1.33 s | 3 | 344 ms | 3 |
| Slide map, open and close | 1.65 s | 2.81 s | 13 | 573 ms | 191-234 |
| Inspector (deck settings), open | 1.03 s | 3.99 s | 12 | 791 ms | 60-93 |
| Present: open, 10 slides, close | 1.20 s | 5.76 s | 24 | 542 ms | 39-93 |
| Reading view: open, scroll, close | 2.31 s | 3.90 s | 10 | 745 ms | 93 |
| **Export PDF, 40 gallery slides** | **16.0 s** | **69.0 s** | **103** | **4,027 ms** | 86 |
| **Export PowerPoint, 40 gallery slides** | **14.2 s** | **59.9 s** | **113** | **1,548 ms** | 54-75 |

Navigation is cheap: the whole-deck memo in `single-slide-render.ts` hits and nothing is re-rendered. Idle is
quiet: the 2026-10-19 frame-loop fix holds.

## 2. Where the time goes

### Export: the capture runs on the page, slide by slide

> **Corrected 2026-10-30 (§7).** The export's LONGEST tasks are not the per-slide capture below: they are the vector
> PDF writer reading every slide in one task and then writing the file on the page. The costs below are real but
> spread across many shorter tasks.

The CPU profile of the 1x PDF export puts 2.1 s in `deck-export`, 0.95 s in the Compose chunk, 0.64 s in the runtime
and 7.3 s of native time the profiler could not attribute (its `(program)` bucket, which holds style, layout,
image decode and raster among other things). The largest named costs are:

- copying computed styles (`getPropertyValue`, 401 ms; `sweepWebRefsForCapture`, `deck-export.js:1211-1250`,
  reads computed style for every element and its two pseudo-elements);
- building blobs (525 ms) and bitmaps (`createImageBitmap`, 381 ms);
- garbage collection (855 ms);
- regexes run once per slide over the same CSS text: the XML-illegal-character strip (217 ms), and the
  `@font-face`, `unicode-range` and `font-stretch` matchers (240 ms together).

The reason is `lib/core/slide-camera.mjs:495-516`. For each slide, the camera serializes the clone **with the
whole deck stylesheet** (`style.textContent = sheet`) into XHTML, wraps it in an SVG `foreignObject`,
base64-encodes it with `readAsDataURL`, and decodes it into an `Image`. The comment there says a slide's SVG is
megabytes. So the same stylesheet is serialized, encoded, parsed and thrown away 40 times. The PDF and PPTX
workers only assemble the file at the end.

The memory follows: the renderer goes from 640-678 MB before the export to a **1,631-1,663 MB peak during it**
(sampled every 250 ms), and settles at 897-905 MB about 18 s after the download.

### Typing: React re-renders the chrome

The CPU profile of 40 keystrokes at 4x attributes the named JavaScript like this:

| Code | Time over 40 keys | Per key |
|---|---|---|
| `react-dom` (`client.*.js`) and `react`, `jsx-runtime` | ~1.62 s | ~40 ms |
| CodeMirror (`dist.CKlL4NEx`) | 0.49 s | 12 ms |
| Radix primitives (`dist.BJzYL1QI`) | 0.42 s | 11 ms |
| The preview runtime (`lattice-runtime.js`) | 0.38 s | 9 ms |
| The Studio island | 0.33 s | 8 ms |
| `lucide-react` icons, tooltips, dropdown menu | 0.35 s | 9 ms |
| DOMPurify (`sanitize-slide-html`) | 0.13 s | 3 ms |
| The engine (`engine.js`) and `markdown-it` | 0.15 s | 4 ms |
| Lint | 0.05 s | 1 ms |

Another 4.1 s, about 100 ms a key, is native time the profiler could not attribute (its `(program)`
bucket; style, layout and paint fall there, but the profile does not split it).

Icons, tooltips and dropdowns re-rendering on a keystroke means the toolbar is inside the subtree that re-renders.
The source text is state at the top of `StudioShell.tsx`, so every keystroke re-renders the shell. Item 6 of
`2026-10-22-studio-performance-audit.md` §3 proposed a source store for this. This profile is the first
measurement that puts a number on it: React and the chrome it re-renders are about 60 ms of the per-key JavaScript at 4x.

One smaller find from the same profile: `tts-voice-catalog` functions run during the shell's render on every
keystroke (about 50 ms over 40 keys). The shell derives a voice choice in its render body instead of memoizing it.

### The preview runtime forces one layout per section

`lattice-runtime.js` spends 238 ms of self time over the 40 keys in one minified function. Its body matches
`patchSectionGeometry` (`lib/runtime/index.js:2406-2455`); the build has no source map, so the match is by
reading, not by mapping. For each `<section>` it reads `offsetWidth`, runs the orientation and family stamps
(which read size and may write attributes), writes `--_wide-gutter` and `--_sec-1cqi` when they changed, then
reads `offsetHeight`. Whenever one section's write lands, the next read forces a fresh layout. A `MutationObserver`
on the whole body (`:2399`, subtree, characterData and attributes) re-runs it after every patch, over every section
in the document. The profile does not split the 238 ms into forced layouts and the loop's own work.

### First opens of panels

The 340-790 ms freezes at 4x are the first evaluation and render of a lazy chunk. The warm-ups
(`studio-warm.ts`, `lazy-panel.tsx`) fetch and evaluate these after the first slide and a pause. A panel opened
before that pays the full cost in one task. The slide map also boots up to ten preview frames on open
(191-234 requests, 16 more documents), each loading its own copy of the runtime.

## 3. Memory

Renderer PSS from a clean start, 1x:

| Stage | Renderer PSS (four runs; the peak, two) |
|---|---|
| Booted, 8 s settled | 246-251 MB |
| 40-slide gallery deck loaded | 354-363 MB |
| Slide map open on that deck | 640-678 MB |
| **Peak during the PDF export, sampled every 250 ms** | **1,631-1,663 MB** |
| 3 s after the download | 1,346-1,643 MB |
| About 18 s after the download | 897-905 MB |

JS heap is a small part of this. After GC it is 29 MB at boot and about 47 MB after the slide map. The rest is
documents, style, layout and decoded images.

**No leak was found.** Five open/close cycles each of Present, the slide map and the reading view leave the
heap after GC, the document count and the listener count flat (two runs: heap 34.7-34.8 to 36.5 MB over five Present
cycles, 46.6-46.7 to 47.0-47.1 MB over five slide-map cycles).

**What stays resident, by design or by omission.** Each item was read in the code; only the pool was measured:

- **Preview pools** (`preview-pool.tsx:280-289`). Six surfaces each own a pool of up to 28 frames, and a pool
  never releases one (the file says this avoids a WebKit leak). Measured in two runs: the slide map's pool keeps 8-9
  frames and 15-16 documents after the map closes. A shared pool with one global cap, releasing idle frames on Chromium, would
  bound this.
- **Export data.** `deck-export.js:1383-1413` caps its data-URI memo at 24 M characters and clears it at the
  *start* of the next export (`:1058`), so up to that much stays live between exports. The Print drawer keeps
  its slide rasters and last PDF while mounted (`PrintOptionsPanel.tsx:260-279`; `keep-mounted.tsx` keeps it
  mounted).
- **On-device AI workers** (`ai/architect-model.js:648-649`, `:775-776`) are terminated only on a load failure.
  A model that loaded stays resident for the life of the tab.
- **Narration audio** (`lib/suono/stage.ts:16-18`) caps decoded PCM at 256 MB.
- **markdown-it ships twice** to the Studio: `docs/` resolves 14.3.0 and the repository root 14.1.1, so the build
  emits `markdown-it.16wiROwl.js` and `markdown-it.BoALm8s3.js` (about 100 KB each), and the engine carries a
  third copy.

## 4. Workers: what to move, and what not to

| Work | Measured | Verdict |
|---|---|---|
| Export capture (style copy, serialize, encode, decode) | 16 s at 1x, 69 s at 4x | Mostly DOM-bound and cannot move to a worker. Cut it instead (section 6, item 1). The string work around it (regexes, font-face filtering, base64) can move, or be done once per export. |
| Lint, review and scorecard | 15 ms per pass on 40 slides, 51 ms on 123 slides, at 1x in Node. Two passes per pause: the editor's linter and the Coach (`Editor.tsx:545`, `coach-core.ts:76`) | Move to one lint worker that runs once per text version and serves both. About 400 ms of long tasks per pause on a 123-slide deck at 4x. Pure code (HARD RULE #7). |
| Engine render on a keystroke | about 4 ms per key at 4x, with markdown-it | **Not now.** The obstacles are real (themes, KaTeX and highlight.js register through page globals, `lib/playground/index.js:200,326`), and the saving is small next to the React re-render. |
| DOMPurify, the runtime's fit and geometry passes, Mermaid label measuring | — | Need a DOM or layout; they stay on the page. |
| Workspace backup and restore (JSZip, `workspace-backup.ts`) and image import re-encode (`media-import.ts`) | not measured | Pure; reuse the PPTX worker's JSZip and `picture-encoder-pool.js`. Low priority: they run on a click. |
| Chat streaming | not measured here | Fixed for the common case on 2026-10-19 (`2026-10-19-studio-main-thread-jank.md`). |

## 5. The PWA

Measured on the phone profile with `npm run perf:startup`: cold load **4.29 s** to the first slide (5 runs,
4.07-4.34), warm service-worker load **3.48 s** (3 runs, 3.44-3.50). Both make 196 requests by the slide. The warm
load is CPU-bound like the cold one, so caching more does not move it much.

Read in `docs/public/sw.js`, not measured:

- **`activate` deletes caches it does not own** (`sw.js:113-115`). It deletes every cache not in
  `ALL_CACHES`, which includes `transformers-cache` and `webllm/model-cache` (names from
  `governance.test.ts:66`). Any change to `sw.js` installs a new worker, which then deletes the downloaded
  on-device models (the voice alone is about 80 MB). `governance.ts` already scopes its own deletes by prefix.
  This is a correctness fix.
- **No navigation preload, and HTML is network-first with no timeout** (`sw.js:216-230`). A warm load waits on the
  network before the Studio paints. On a slow-but-connected network it waits indefinitely.
- **Every cache write lists the whole cache** to trim it (`sw.js:185-201`). The comment there measured 11.5 ms per
  versioned write on a full cache (#1930), and a cold visit makes a couple of hundred writes.
- **Nothing is precached**, by design (`2026-07-02-docs-pwa.md`). The first visit's startup chunks load before
  `clients.claim()` and never reach Cache Storage, so a first-visit-then-offline session has holes. The offline
  specs are already red on main (`followups.d/2964-p2-studio-offline-warmup-red.md`).
- **Production cannot cache `/_astro/` for long.** GitHub Pages ignores `_headers` and sends `max-age=600`, so the
  service worker is the only long-lived cache. Brotli on either host is unmeasured.
- **The manifest** has `id`, `start_url`, `launch_handler` and maskable icons. It lacks `file_handlers` (open a
  `.md` in the Studio), `share_target`, `screenshots` (Chromium's richer install dialog) and
  `display_override`.

## 6. What to do, ranked

Each item says what it would buy and whether the number is **measured**, **bounded** (a limit measured another
way) or **estimated**. **Owner's call** marks the ones CLAUDE.md routes to the owner.

1. **Make export stop freezing the page and stop peaking at 1.6 GB.**
   - (a) Yield between slides, so input and paint get a turn. *Bounded:* the longest task falls from 4.0 s to
     one slide's capture; the total is unchanged. **Done 2026-10-30, re-aimed (§7):** the capture loop already
     yielded; the yield and a worker went into the vector writer instead. Longest task 4,326 ms to 1,673 ms.
   - (b) Do the per-export work once: parse the stylesheet's font faces once per export, so only the check
     against each slide's text runs per slide, and strip illegal XML characters from the shared stylesheet once
     instead of from every slide's serialized copy. *Measured ceiling:* 0.46 s of regex at 1x, about 1.8 s at 4x.
   - (c) Prune the stylesheet each slide's SVG carries to the rules that slide can match, so each `foreignObject`
     image is not megabytes. *Estimated:* most of the base64, decode and GC cost (1.8 s at 1x).
   - (d) Release rasters, data URIs and the capture frame when the export finishes. *Measured:* 897-905 MB
     resident about 18 s after export, against 640-678 MB before. **Investigated 2026-10-30 (§7):** no
     application reference holds the capture frame; the excess is mostly native and partly reclaimable. Not built.

   **Owner's call:** this is the export pipeline. CLAUDE.md requires the owner to sign off on dark and light
   renders if the exported bytes change. (a) and (d) should not change them.
2. **Stop re-rendering the shell on a keystroke.** Put the source text in a store that the editor, the preview
   and the lint subscribe to, and keep the toolbar out of the keystroke path. *Bounded:* React, Radix, icons
   and tooltips are about 60 ms of 163-206 ms per key at 4x. This is item 6 of the 2026-10-22 audit, now with a
   number. It is a large refactor of `StudioShell.tsx` and needs a design note first.
3. **Fix the runtime's per-section layout thrash.** Read every section's width and height first, then write
   the variables; skip sections that did not change. *Measured:* 238 ms of self time over 40 keys at 4x,
   forced layouts included. **Owner's call:** `lattice-runtime-min.js` ships inside exports, so the export
   sign-off applies.
4. **One shared preview pool with a global cap that releases idle frames on Chromium.** *Measured:* +280-315 MB for
   the slide map on a gallery deck, still resident after close. Also consider drawing the map's tiles in one
   document instead of one frame per tile.
5. **Make first opens of panels yield.** Render the panel shell first, then its contents in a transition
   (`startTransition`) or after a frame; warm the next likely panel on hover. *Measured cost today:* 340-790 ms
   longest task at 4x.
6. **One lint worker** serving the editor and the Coach. *Measured:* removes one of two passes and moves the
   other off the page; about 400 ms of long tasks per pause on a 123-slide deck at 4x.
7. **Service worker fixes.** Scope `activate`'s delete to `lattice-` caches (correctness); enable navigation
   preload; serve the Studio's HTML from cache with a background refresh, or race the network against a 2-3 s
   timeout; trim the cache in one pass after a burst of writes. *Estimated:* tens to hundreds of milliseconds on
   a warm load, more on a poor network; none of it was measured.
8. **Hygiene.** Align markdown-it to one version (about 100 KB less to load and parse); clear the export
   data-URI memo when an export ends; terminate on-device model workers when the user leaves that tier; memoize
   the voice-catalog derivation in the shell. *Estimated.*
9. **Manifest:** add `file_handlers` for `.md`, `share_target` and `screenshots`. App integration, no speed change.
10. **Commit the activity harness as a bench** (`npm run perf:activities`) so the next audit is the same run,
    and so items 1-6 can each show before and after numbers (HARD RULE #19). A CI time budget stays the owner's
    call, as `2026-10-22-studio-startup-regression.md` already says.

**Not recommended:** an engine worker (about 4 ms a key, with real obstacles); more precaching to speed the
warm start (the warm load is CPU-bound).

## 7. Follow-up, 2026-10-30: what the first fixes found

The owner approved items 1-3 and a nightly bench on PR #2984. Working them corrected three things above.

**The bench's server broke diagrams.** `docs/scripts/serve-h2.mjs` sent no `access-control-allow-origin`, so the
sandboxed Mermaid draw frame (origin `null`) could not load its modules and every diagram errored under it. Every
HTTP/2 number in this note, and in `2026-10-23-startup-bake-off.md`, was taken that way. The server now sends `*`, as
GitHub Pages does. Re-measured with it: the PDF export's longest task at 4x was 4,326 ms, close to the 4,027 ms in §1.

**Item 1(a) was aimed at the wrong loop.** The capture loop already yields between slides
(`deck-export.js`, the `setTimeout` after each capture). A CPU profile of the 4x export split by unbroken busy runs
found the three longest elsewhere:

| Run | Where |
|---|---|
| 5.5 s | `readSlide` over every slide in one task (`lib/core/pdf-compose/compose.mjs`, the read loop; hit-testing with `elementsFromPoint` and `getBoundingClientRect`) |
| 4.0 s | the capture frame's runtime booting and fitting all 40 sections (item 3's per-section geometry pass) |
| 3.8 s | `writeDeckPdf`: pdf-lib laying out every word with fontkit, on the page |

`composeDeckPdf` now takes `host.betweenSlides` (the Studio yields after each read) and `host.writePdf` (the Studio
writes in `pdf-write-worker.js`; the CLI passes neither). Measured, before against after on one machine, 4x CPU:
longest task 4,326 ms to 1,673 ms; total main-thread time unchanged (63 s against 66 s, inside the run-to-run
spread). A frozen-clock Studio export and the CLI's gallery PDF are byte-identical before and after.

**Item 1(d) found no application leak.** After an export, Chrome counts one more document than before, and the
renderer stays about 300 MB higher. A heap snapshot traced two retainers: a font-gate promise left on the live
preview's host, and a `ResizeObserver` callback that shares a scope with the reveal poll's previous-document local.
Fixing the first (a `WeakRef`) moved nothing measurable, so it was not shipped. The held document is small; the
heap after GC grows only 15 MB across an export. Simulated critical memory pressure gives back about 100 MB, and
the rest is native (decoded images, Blink's caches, the allocator) plus the Mermaid draw frame, which is kept for
reuse by design. Not a leak to fix in this code.

**Measured and not changed:** the activity table's other rows, before against after, sit inside the spread of one
run each (§1).

## What was not measured

- A real phone, Safari or Firefox. The 4x profile is emulated Chromium, so every 4x number is UNVERIFIED on a
  real device (HARD RULE #23). The 1.6 GB export peak is the number most likely to differ, and to matter, on iOS.
- The phone layout (390 px) for anything but startup.
- One run per profile for the activity table. The startup rows in the 2026-10-23 bake-off show a spread of about
  0.1 s; the activity rows were not repeated.
- The chat agent, Compose, Fabricate, image import, live collaboration and the on-device models.
- The memory items in §3's list other than the slide-map pool were read in code, not measured.
- The renderer PSS stages ran four times (the export peak twice), the leak probe twice, the CPU profiles and the trace once.
- Navigation preload, cache-first HTML and the cache-trim cost were not prototyped.
