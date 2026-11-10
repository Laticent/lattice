---
status: shipped
summary: >
  Should the Studio bake a first-time visitor's first slide the way the Playground does? Yes, with a different seam.
  The Playground writes its bake into an iframe that exists in the page's HTML, before the app runs. The Studio has no
  such frame: its live frame is created inside the React tree after the island mounts, and moving an iframe to another
  parent reloads it. Measured on the phone profile, the Studio's first slide is visible at 5.49 s, and 1.75 s of that
  passes between the preview mounting (2.71 s) and the frame being written (4.46 s), while the engine evaluates and
  renders. Recommended (PR A): the renderer's FIRST write adopts a build-time document for the newcomer deck instead
  of rendering it, and the first real render patches it in place. Ceiling about 1.5 s (5.5 s to about 4 s). The
  Playground's full move, painting before the island runs, could reach about 50%. It needs a page-owned frame, which
  reverses the one-skeleton decision of 2026-07-21, so it is the owner's call and not built here.
---

# Baking the Studio newcomer's first slide

**Status: accepted, option A** (the owner, 2026-11-08, on PR #3087's decision card D1). This note decides the shape of PR A. It builds nothing. Measurements are from 2026-11-08 on
`main` d1a4704, Chromium, the phone profile in `docs/scripts/startup-bench.mjs` (390 px, 4x CPU, 80 ms latency,
6 Mbit/s), served over HTTP/2 by `docs/scripts/serve-h2.mjs`, five cold loads.

## 1. What the Playground did, and what "50% faster" referred to

`docs/scripts/bake-newcomer-frame.mjs` renders, at build time, the exact document the Playground app would write for a
first-time visitor. The page's head decides whether this visit will show that deck. If it will, the head fetches the
bake, and a script right after the island writes it into the preview iframe as `srcdoc`. That iframe is in the
server-rendered HTML. The app's first render then ADOPTS the document (`newcomer-bake.ts`): it takes the render state
embedded in it and renders as an ordinary patch, which changes nothing when the bake is current
(`2026-09-28-playground-virtual-filmstrip.md` §2).

On fast 4G at 4x CPU that took the first visible slide from 5.91 s to 3.13 s, 47% sooner. The whole gain comes from
painting **before the app runs**: the frame loads its runtime and draws while the island's ~70 chunks are still
downloading and evaluating.

## 2. Why that move does not port as-is

- **There is no frame to write into.** The Studio's live frame (`iframe.live`) is created by
  `single-slide-render.ts` › `renderInto` inside DeckPreview's host, which exists only after the `client:only` island
  mounts. The server-rendered shell holds only the Nacre loader box (`#ssr-slidebox`, `studio.astro`).
- **An iframe cannot be handed to React later.** Moving an iframe element to another parent reloads its document
  in every engine. Chromium's atomic `moveBefore` avoids that, but Safari did not ship it as of this writing. A page-made frame would
  have to stay where the page put it, so the preview's in-flow box would have to be the page's element rather
  than React's.
- **The Studio retired exactly that shape once.** `2026-07-21-studio-preview-one-skeleton.md` removed a
  build-time welcome slide drawn in the server shell. It was a second real-content surface beside the live
  iframe, in a second coordinate system, and its dismissal hung on the iframe's reveal, a signal iOS drops. That note
  makes the shell Nacre-only on purpose. A page-owned bake frame reverses it.
- **The render state lives on the host element, not in a value.** `renderInto` keeps `__latticeFrameSig`,
  `__latticeRestyleSig`, `__latticeFrameCss` and `__latticeShownSlide` as fields on the host (`type LiveHost`). The
  Playground's `renderDeck` returns a `PreviewState` that the bake can carry. The Studio has no such value yet.
- **The frame carries a per-load script nonce.** `single-slide-render.ts` stamps every frame script with
  `PREVIEW_SCRIPT_NONCE`, random per page load. A baked document would carry a fixed, public one. What the nonce
  guards, and whether a patch over a document with a different nonce works, has to be answered before PR A
  writes code (HARD RULE #22: the frame is a preview sink).

## 3. Where the Studio's first slide spends its time

Medians of five phone-profile loads on `main`, in seconds from navigation:

| Moment | Median | Range |
|---|---|---|
| Preview host mounted (`[aria-label="Live deck preview"]`) | 2.71 | 2.64-2.97 |
| Engine module downloaded | 2.85 | 2.75-2.99 |
| Base theme sheet downloaded | 2.92 | 2.81-3.06 |
| Preview runtime downloaded | 3.38 | 3.28-3.54 |
| Frame written (`iframe.live` exists) | 4.46 | 4.23-4.72 |
| Slide in the frame (`.lattice`) | 4.86 | 4.61-5.12 |
| Visible (reveal done) | 5.49 | 5.24-5.59 |

Everything the slide needs over the network has arrived by 3.4 s. The frame is written about 1.75 s after the host
mounts and 1.6 s after the engine arrives. That time is main-thread work: evaluating the engine, registering the
theme, rendering the deck, and the shell hydrating beside it on a 4x-slowed CPU. The last 1 s (frame written to
visible) is the runtime booting in the frame and the font gate. A bake removes neither of those.

## 4. The options

| | What it is | Ceiling (phone) | Cost | Risk |
|---|---|---|---|---|
| **A. Adopt at the first write** (recommended) | The build bakes the newcomer deck's frame document. The renderer's first write for that deck uses the baked document instead of rendering, and seeds the host fields from the state embedded in it. The first real render, once the engine is up, takes the existing PATCH path. | About 1.5 s: frame written at about 2.8 s instead of 4.46 s, visible about 4 s instead of 5.5 s. About 28%. | One bake script (sharing the Playground's harness), one seeding entry point in `single-slide-render.ts`, a head-side fetch, an e2e adoption spec, a handoff pixel check. | The frame-signature inputs must match exactly, or every load pays a full rewrite on top of the bake: `previewExtraCss`, `webSig`, `paneSig`, KaTeX. The nonce question in §2 also applies. |
| **B. Paint before the island** | The Playground's full move: the page's HTML holds the preview frame, the head writes the bake into it, and React adopts the element in place. | About 50%, by the Playground's numbers. Not measured for the Studio. | Rebuild the preview box as a page-owned element that React adopts, on every posture and width. | Reverses the 2026-07-21 one-skeleton decision; the iOS seam it fixed is the failure to avoid. |
| **C. A picture in the Nacre box** | A baked image of slide 1 in the shell. | Largest paint only. | Small. | Exactly the retired welcome slide. Rejected. |
| **D. Nothing** | | 0 | 0 | The newcomer keeps the 5.5 s first slide. |

## 5. Recommendation: A, as PR A

1. **Answer the nonce question first** (§2), in a short note in PR A's description, before any code is written.
2. **Bake.** Extend `bake-newcomer-frame.mjs`, or add a sibling that reuses its jsdom and Vite loader. It renders
   the `welcome` deck (`decks.ts` › `DECKS[0]`) through `createSingleSlideRenderer` as the Studio's first render
   would, slide 0, palette `cuoio`, light and dark. It writes `studio-newcomer/<mode>/index.html` beside the runtime in
   `v/<hash>/` and embeds the host state (signatures, CSS and shown-slide key) plus a fingerprint of the source. A
   failure fails the build, as the Playground's does.
3. **Gate in the head.** `studio.astro`'s seed already resolves the deck, palette, mode and posture. It fetches the
   bake only when the visit will show `welcome` slide 0 in `cuoio` with no edited source, and never under Save-Data
   or on an effective connection of 3G or worse. The Playground measured its bake as slower on slow 4G, and the same
   gate applies here.
4. **Adopt.** A new entry point in `single-slide-render.ts` takes the baked document on the renderer's first write.
   It writes that document instead of the engine's output, seeds the host fields from it, and drops it whenever
   the fingerprint, the signature or the slide size disagrees. The first engine render then patches or restyles in place.
   Keep it to one new seam: no second frame, no second coordinate system, and no wait on a reveal signal.
5. **Prove it.** The evidence that decides the merge:
   - `npm run perf:startup` against `main` on the phone profile, 7 loads per build, alternated, two rounds. "Visible"
     must move, and `requestsAtSlide` must not grow by more than the bake's one request.
   - A handoff pixel diff, ported from `playground-bench.mjs handoff`: the preview captured when the baked slide shows
     and again once the app is live, at 390, 820 and 1440, in both modes, differing by 0 pixels.
   - An e2e adoption spec: the frame keeps the baked document, the first live render patches rather than rewrites,
     a write over the bake adds no history entry, and a returning visitor never fetches the bake.
   - WebKit and Gecko runs of that spec; iOS Safari on a device is UNVERIFIED unless one is reached.

**Decided:** option A. PR A is built as above, starting with the nonce answer. B is not built.

## 6. How this meets preview-first boot for returning users

The continuation brief's P3 is a preview-first boot for a returning visitor: their last deck, drawn before the app
finishes, adopted without a second render. The `spike/preview-first` branch that measured -26% exists only in an
earlier session's sandbox and is not on the remote, so its code could not be read. A's seeding entry point is the
piece a returning-user path needs too. The difference is where the document comes from: a cached last render on this
device instead of a build-time file. So A comes first, and P3 builds on its seam.

## 7. PR A, as built (2026-11-09)

### The nonce question (§2), answered

**The bake carries no nonce, so the question does not arise.** `PREVIEW_SCRIPT_NONCE` (`page-script-nonce.js`) is
the one value every script in a preview frame must carry. The frame's policy (`previewCspMeta({ scriptNonce })`)
refuses any script without it, so an inline handler or a `<script>` that got past the sanitizer does not run. It
is random per page load so that a shared deck's markup cannot know it. A baked finished document would have
frozen it into a public file, and the guard would have stopped guarding for every visitor who got the bake.

So the bake is not a document. It is the PARTS of one full write (the sanitized-before-write slide HTML, the
engine's composed sheet, the mode, the slide box, the author CSS) plus the host state the renderer keeps after
writing them (`NewcomerBake` in `single-slide-render.ts`). `adoptBake` builds the frame's document from those
parts with the renderer's own `srcdoc()`, which stamps this page load's nonce, this origin's font policy and the
shared sheet's blob URL, exactly as a live write does. A patch over it then meets the same nonce it always
meets. The same move removes the two other values a finished file would have frozen: the Playground bake has to
patch Firefox's `font-src` origin in by string replacement (`playground.astro`), and an inline 1.2 MB sheet would
not have shared its parse with the Studio's other frames.

### What shipped

- `docs/scripts/bake-studio-newcomer.mjs` runs the Studio's renderer (`createSingleSlideRenderer`, with the
  editing preview's `scaleImages` and `liveLayout` flags) in jsdom against the staged engine and themes, with
  StudioShell's arguments for the welcome deck. Its `captureWrite` option, set only here, hands over the write's
  parts. It writes `studio-newcomer/<mode>.json` beside the runtime. The harness it shares with
  `bake-newcomer-frame.mjs` is `docs/scripts/lib/bake-harness.mjs` (the Playground's bake is byte-identical
  through the move).
- `studio.astro`'s head fetches it only for a first visit (no Studio state in storage, no query or hash, palette
  cuoio, not Save-Data or 3G or worse). `newcomer-bake.ts` hands the pending fetch to the editing preview once.
- `adoptBake` writes it the moment it resolves, when the host has no frame yet and the bake matches the source,
  slide, palette, mode, renderer flags and runtime. The outcome rides on the host as `data-lattice-bake`
  (`adopted` or `refused:<why>`). The first render waits up to 4 s for the adopted document to load, then takes
  the ordinary patch path. A mismatched signature degrades to the restyle path, and past that to a full write,
  which is srcdoc over srcdoc and adds no history entry.

### Measured

Phone profile (`npm run perf:startup`, 390 px, 4x CPU, 80 ms, 6 Mbit/s), HTTP/2 with the certificate trusted,
`main` 99009e4 against this branch, one load per build alternated, 7 loads each, two rounds:

| Round | Build | First slide (median) | Visible (median) | Requests by the slide | Main thread busy by the slide |
|---|---|---|---|---|---|
| 1 | `main` | 4244 ms | 4744 ms | 217 | 2.85 s |
| 1 | PR A | 3097 ms | 4340 ms | 215 | 1.96 s |
| 2 | `main` | 4470 ms | 4872 ms | 217 | 2.87 s |
| 2 | PR A | 3008 ms | 4302 ms | 216 | 1.99 s |

The first slide is in the frame about 1.3 s (30%) sooner, and visible moves about 0.5 s (10%). `main` has moved
since §3 was measured: its visible median is now about 4.8 s, not 5.49 s. So the 1.5 s ceiling in §4, measured
against the old baseline, was never available in full.

**Why visible moves less than the first slide.** After the bake is written, three things still stand between
the slide and the reveal, and the bake removes none of them. (1) The frame's head holds the 1.2 MB sheet ahead
of the font-gate script, so the body parses only after that sheet is parsed on a main thread that is also
evaluating the engine. Single loads put `.lattice` anywhere from 0.3 s to 1.0 s after the write. (2) The runtime
(447 KB gzipped) arrives at about 3.9 s. (3) The faces the slide uses are requested only once its text is laid
out, and they land at about 3.9 s as well. Two variants of the runtime fetch were measured and rejected:
dropping `studio-boot.ts`'s low-priority prefetch for a bake visitor (so the frame's own request is the only
one) made visible worse, 4315 to 4913 ms; raising it to a preload changed nothing, 4627 against 4607 ms.

**Evidence the merge rests on.** `e2e/studio-newcomer-bake.spec.ts` (Chromium, WebKit phone, Gecko), with the engine
held until the renderer has answered the bake so the order is the code's: a first visit adopts the bake before the engine loads, and the first render patches the same document in place (one
write in total, the frame's window unchanged, the swap stamped `in-place`, no history entry); a returning
visitor never fetches it; a bake from another build is refused and the render writes as before. 40 of 40 runs
passed at `--repeat-each=5` with no retries. The handoff check (`playground-bench.mjs studio-handoff`) holds the
engine until the baked slide is captured, then captures the live preview once the first render has patched it:
0 differing pixels at 390, 820 and 1440 px in both modes, with the bake on screen before the engine in all six
runs. iOS Safari on a device is UNVERIFIED.

### What the independent check found, and what changed

A maker-checker pass found that the bake closed the window a set of e2e specs measure: they hold the engine to study
the instant shell before the first slide, and the bake now paints that slide without the engine and takes the shell
down. `studio-instant-shell.spec.ts` "stage 1" (a per-PR `@smoke` test) failed 9 of 12. That is intended behavior for a
visitor and wrong for those specs, so `holdEngine` (`e2e/engine-glob.ts`, which every engine hold in
`studio-instant-shell`, `studio-shell-parity` and `studio-reserved-slots` goes through) now also aborts the bake;
stage 1 passes 12 of 12. The same pass found three smaller gaps, all closed: a full write that replaces a still-loading bake now releases
every render waiting on it, a render re-checks that it still owns the frame after the wait, and `dispose()` releases a
bake it wrote. Two `:252` geometry cases in `studio-instant-shell` fail on `main`'s build too
(`followups.d/2982-p3-instant-shell-slide-box-drift.md`).

### A first visit the bake misses wrote the preview twice (fixed 2026-11-10)

PR A measured a second cost on the path it rewrote, not caused by it: under load, a first visit with the bake kept out
wrote the live preview's frame twice. A scratch spec that wraps `HTMLIFrameElement` `srcdoc` (as
`studio-newcomer-bake.spec.ts` `recordWrites` does), 24 loads at 6 workers, desktop project, found the cause. Both writes
carried the same frame signature and the same 4.3 KB document, 8 to 21 ms apart. The second render started while the
first write was still loading, so the patch guard (`__latticePendingLoad`) was closed, and it fell through to a second
full write. Each full write parses the 1.2 MB sheet again and mints a new frame realm.

The fix generalizes the wait `adoptBake` already had. Every full write now publishes its load on the host
(`__latticeDocLoad`, renamed from `__latticeBakeLoad`), and a render that finds a document still loading with the same
restyle signature (frame box, Mermaid presence, web policy) waits for it, bounded by `DOC_LOAD_WAIT_MS` (4 s), then
patches or restyles it. A render that needs another box does not wait, since only a write can give it one. A frame that
never paints releases its waiters when the reveal poll gives up.

The wait releases no one and clears nothing; an independent check found the first cut did both, which would let a
render that stood down wake the waiters of the newer write that replaced it, and let a third render write over that
document. A loading document resolves its own promise, and a render that gives up and writes releases the rest at
its write site. A render that a newer one already owns stands down before it parks. A render whose document was
replaced by a newer write while it waited waits again on that one, up to three rounds, instead of writing a second
document behind it.

| Build | One write | Two writes |
|---|---|---|
| `main` 50f6f4a | 9 | 14 (one more load timed out before it could be counted) |
| the fix | 24 | 0 |

Pinned in `single-slide-render.adopt-bake.test.ts` (`a full write still loading`): the next render parks until the
write loads, writes anyway past the bound, and does not wait for a different box; a render a newer write owns stands
down and leaves that write's waiters alone; and a render whose older peer gave up and wrote waits again on that write
(this one fails with the re-wait loop removed). jsdom never loads a srcdoc. A unit
file whose renders follow each other with no load (`deck-context`, `sanitize-memo`, `cache-keys`, `pane-split`) fires
`load` with `src/test/frame-load.ts`; one that marks the frame committed by hand (`__latticePendingLoad = false`, as
`swap-stamp` does) needs nothing, because a committed frame has nothing to wait for. `reveal` asks for another box, the
case where one write supersedes another. No unit test passes through the 4 s bound except the one about the bound.

## 8. Preview-first boot for a returning visitor, on this seam: built, measured, not shipped (2026-11-09)

§6 expected a returning visitor's preview-first boot to reuse PR A's seeding seam, with the document coming from this
device instead of the build. That was built and measured in this PR's session, and it does not pay, so it was taken
out again.

**What was built.** The renderer described what a frame shows in the bake's shape (`snapshotBake`, with the deck's
web-image policy added to the parts). The Studio stored it in Cache Storage 1.5 s after the preview settled and on
`pagehide`, with the sheet under a content key so it was written only when it changed. The head seed read it back for a
returning visitor, and `adoptBake` took it as it takes the newcomer bake. It worked: on a reload the visitor's own slide 3
was adopted before the engine, as the only write, and the first render patched it `in-place`.

**What it measured.** `npm run perf:startup` with `WARM=1` (a first load, then a reload in the same profile with the
service worker allowed, which is a returning visit), `main` against the change, 5 loads each, alternated:

| Profile | Build | First slide | Visible | Editable |
|---|---|---|---|---|
| phone | `main` | 2035 ms | 2239 ms | (no editor on a phone until its pane opens) |
| phone | stored frame | 2094 ms | 2327 ms | |
| desktop | `main` | 1172 ms | 1386 ms | 1388 ms |
| desktop | stored frame | 1053 ms | 1377 ms | 1378 ms |

No difference past run-to-run spread. **Why:** on a returning visit the engine is cached, and it has loaded before the
preview mounts. One phone timeline: engine 829 ms, preview host mounted 1096 ms, frame written 1595 ms, visible 2058 ms.
A write at mount saves only the render itself, which is short once the engine is warm. The head's read of a 1.3 MB
stored frame then costs main-thread time of its own (the same load with the stored frame: host 1525 ms, visible 2426 ms).
The newcomer bake pays because a cold engine takes about 1.75 s to arrive and evaluate. A warm one does not.

**So the −26% the lost spike reported cannot come from this seam.** It has to come from painting before the island
mounts, which is option B in §4: a page-owned frame that reverses `2026-07-21-studio-preview-one-skeleton.md`. That is
the owner's call, and the owner declined it (2026-11-09, D1 B on PR #3102): work that does not add value is not
worth doing. The follow-up was retired with this decision. The instrument stays: `startup-bench.mjs` now
reports time to editable (the deck editor takes a keystroke), which is the second number a returning-visitor change
has to move.

## Not in scope

- Unifying the shell's and the frame's font URLs (#3076 lists it as a separate item).
- The Lighthouse largest-paint item in `2026-10-23-studio-boot-order.md` §4. A does not change which element is
  largest in the main page.
