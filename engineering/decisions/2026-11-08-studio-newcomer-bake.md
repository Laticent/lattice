---
status: in-progress
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

## Not in scope

- Unifying the shell's and the frame's font URLs (#3076 lists it as a separate item).
- The Lighthouse largest-paint item in `2026-10-23-studio-boot-order.md` §4. A does not change which element is
  largest in the main page.
