---
status: shipped
summary: The Playground mounts only the slides in view, a newcomer's first preview document is baked at build time and adopted by the app, and a live preview waits only for the fonts its slides use
---

# Playground — a virtual filmstrip, a baked first slide, and fonts on demand

**Date:** 2026-09-28 · **Status:** SHIPPED in #2456 · **Owner direction:** "a virtual list like
virtuoso", "a pre-rendered real first slide", "best in class" for the first experience.

This note records three changes that share one goal: the Playground's preview should cost what a
reader is looking at, not what the deck contains, and a first-time visitor should see a real slide
before the app has finished loading.

## 1. The virtual filmstrip

**Before.** The preview frame held every slide of the deck. The slide runtime transformed all of
them, the engine sheet styled all of them, and the browser laid all of them out before the first one
showed. `content-visibility: auto` (2026-06-10 note) skipped paint for off-screen slides but none of
that work. The Jargon gallery (58 slides) built 2.6k nodes in the frame; a 522-slide deck took 8.5s
to its first slide.

**Now.** Only the slides near the view are real `<section>`s. Every other slide is an empty
`<div data-lv-ph>` that carries the slide's number, anchor id and sketch flag, and nothing else. The
fit agent scales a placeholder exactly like a slide, so the filmstrip's height, order and slide count
never change — every consumer that finds a slide by position (the walk bar, section numbers,
sketch-ink seeds, debug labels) reads the same answer mounted or not.

- **Why a `div`, not an empty `section`.** The runtime treats every `section` as a slide and built
  backdrops, rails and watermarks into the first version's placeholders. Its whole-document pass
  then re-ran over all of them on every mount: a 522-slide deck scrolled at a 417ms median frame on
  a 4x-slowed CPU, worse than mounting everything.
- **The window.** A move is triggered when the slide one past the view is not mounted, mounts three
  ahead, and unmounts only past five behind (`deck-render.js`). A steady scroll pays one mount every
  few slides, and scrolling back and forth over a boundary does not churn.
- **A scroll that moves nothing costs nothing.** `syncVirtual` caches slide 0's position and the
  pitch on the frame's window; a scroll that stays inside the mounted run is answered by arithmetic,
  with no query and no rect read.
- **A mount costs no fit pass.** The fit agent's loop visits every slide. A mounted slide instead
  takes the transform the placeholder it replaces already had.
- **Scroll seek** (react-virtuoso's name). A fling that crosses the viewport in under 150ms mounts
  nothing until it slows or rests for 90ms; the placeholders ride through.
- **Mounts are stamped `reflow`**, never `in-place` — a mount is a different slide arriving
  (`lib/core/swap-kind.mjs`).
- **Whole-deck facts come from the whole deck.** Asset flags (KaTeX, Mermaid, dagre) and the
  web-image CSP list are computed from every slide, not from the mounted window, so scrolling onto a
  diagram never finds its library missing.

The controller lives in `docs/src/playground/deck-render.js` (Playground only), which also keeps it
out of the Studio's eager bundle; the pure window arithmetic and placeholder builder live in
`preview-virtual.js`. Kernel follow-through: `section-index` keeps the engine's
`data-lat-section` stamp, rough ink seeds from `data-lv-i`, and the runtime installs sketch ink when
a sketch placeholder exists.

### Measured — `deck-cost.mjs`, same machine, 1440×900, Edit view

"Fling" is 150 wheel steps of 500px, 16ms apart; "read" is 150 steps of 60px. `main` is 9237268.

| Deck | CPU | | First slide | Load: style recalc | Frame nodes | Fling p95 / >50ms | Read p95 / >50ms |
|---|---|---|---|---|---|---|---|
| Jargon (58) | 1x | main | 3754ms | 461ms | 2,618 | 33 / 2 | 33 / 0 |
| | | virtual | **2060ms** | **69ms** | **258** | 17 / 1 | 33 / 1 |
| Jargon (58) | 4x | main | 10111ms | 2331ms | 2,618 | 50 / 11 | 33 / 1 |
| | | virtual | **9535ms** | **351ms** | **258** | 17 / 2 | 67 / 17 |
| Jargon ×9 (522) | 1x | main | 8537ms | 2886ms | 25,494 | 50 / 11 | 33 / 1 |
| | | virtual | **3408ms** | **68ms** | **722** | 17 / 1 | 33 / 1 |
| Jargon ×9 (522) | 4x | main | 38382ms | 17441ms | 25,494 | 117 / 153 | 67 / 41 |
| | | virtual | **17090ms** | **328ms** | **722** | 50 / 14 | 83 / 34 |

The one row that got worse is reading-speed scroll on the 58-slide deck at 4x: the fully mounted
deck paid for every slide up front (a 15s load task) and scrolled for free, and the virtual one pays
as slides arrive. Its worst frame is the first render of a Mermaid diagram scrolling into view: the
runtime's theme reader forces one style recalculation per token, 166 of them, per diagram group
(`openSectionReader` in `lib/runtime/index.js`). A remount replays from the SVG cache, so each
diagram pays once. That reader is shared with the Studio and is logged as a follow-up rather than
widened into this change.

## 2. The newcomer bake

**The problem.** A first-time visitor saw an empty pane for as long as it took to download ~70 page
chunks, the engine, the theme CSS and the runtime, render, and fit — 1.4s on a fast desktop link,
5.9s on fast 4G at 4x CPU.

**What the Studio learned.** It shipped a build-time welcome slide and retired it
(`2026-07-21-studio-preview-one-skeleton.md`): it was a second surface drawn beside the live iframe,
in its own coordinates, and the edge between them was a seam.

**The design.** The bake is not a second surface. `docs/scripts/bake-newcomer-frame.mjs` runs after
`astro build` and produces the document the app's own first render would write for a first-time
visitor — the first component's walk, default palette, one file per mode — by running the page's own
modules: the engine bundle the browser loads (in jsdom), and the bridge, plan reader and
`renderDeck` (through Vite's SSR loader). It embeds the render state `renderDeck` keeps after writing
(`#pg-bake`: signature, restyle key, section list). The page's head decides, from the same boot
resolution it already makes, whether the boot will show exactly that deck; if so the body loads the
bake into the preview iframe during parse. The app's first render then **adopts** it
(`newcomer-bake.ts`): it takes the embedded state and renders as an ordinary patch. A current bake
changes nothing; a stale one is patched or restyled in place; only a changed slide size forces a new
document, and the app hides the frame before writing it.

Details that each came from a measurement:

- **Served beside its runtime**, in the content-hashed `v/<hash>/` directory, so a bake cached past
  a deploy still finds the runtime it names.
- **A directory index** (`newcomer/light/`), not `newcomer-light.html`: the runtime reads a document
  ending in `.html` as an export and fetches the `.md` beside it.
- **Nothing is warmed from the head.** A browser does not share an in-flight request between
  documents, so a head `fetch` of the bake or the runtime is a second download. Measured on slow 4G:
  the bake twice and the runtime three times on the wire. For the same reason the page's runtime
  prefetch (`RuntimeWarm` elsewhere) runs only when no bake is in play.
- **It lands where the app will.** On a phone the app pinned slide 1 16px below the top, 20px from
  where a document opens, so the filmstrip jumped when the app went live. Slide 1 in the pinned
  regime now lands at the document top. On the desktop stage the loader marks the frame
  `data-stage` before it loads and centers slide 1 exactly as `scrollWalk` will, while it is still
  hidden.
- **Not on a constrained link.** Under Save-Data, or an effective connection of 3G or worse, the
  page skips the bake (below).

### Measured — `first-paint.mjs` over HTTP/2 (GitHub Pages serves h2), fresh profile, 1440×900

First slide visible, in ms; `main` is 9237268.

| Network | CPU | main | bake |
|---|---|---|---|
| none | 1x | 1373 | **618** |
| none | 4x | 5427 | **2426** |
| fast 4G | 1x | 2455 | **1795** |
| fast 4G | 4x | 5909 | **3126** |
| slow 4G | 1x | 8655 | 9601 |
| slow 4G | 4x | 12016 | **10319** |

On slow 4G the bake's ~560KB (document, runtime, faces) competes with the app's own JS for a
saturated link: the first slide lands about a second later at 1x and the app becomes interactive
later too. That is the case the Save-Data / effective-connection gate exists for.

The hand-off is verified pixel-identical: the preview pane captured the moment the baked slide
shows and again once the app is live differs by 0 pixels, in both modes, at 1440, 820 and 390
(`handoff-shots.mjs`). The e2e spec asserts both halves on the real page: the bake shows before the
app goes live, and the frame still holds the baked document afterwards
(`playground-first-paint.spec.ts`, "the newcomer bake").

## 3. A preview waits only for the fonts it uses

The runtime's boot overflow sweep and card-tag equalizer called `settleFonts`, which force-loads
every `@font-face` the document declares — 17 in the engine sheet, four in a plain deck. In a live
preview that put Caveat, Shantell Sans and the italic cuts on the wire for every visitor of every
deck: ten unused faces, about 250KB, landing after the first slide and holding the app's engine
bundle back.

A preview does not need them: the virtual filmstrip has no off-screen text to measure. A document
built with `previewFonts` (the Playground's) is marked `data-lattice-preview`, and there the runtime
flushes layout and waits on `document.fonts.ready` instead (`settleLaidOutFonts`,
`lib/core/font-settle.js`), and re-measures on `loadingdone` for a face a later-mounted slide brings.
Everything else — the export capture frames, a static export — keeps `settleFonts` unchanged. On the
slow-4G trace, font requests fell from 20 to 10 and the app went interactive 2.2s sooner.

## What this does not do

- **Mermaid first render** — see §1. Follow-up: batch the theme reader's probes into one recalc.
- **The bake duplicates the theme CSS** the app then fetches for its engine (~100KB gzipped, once).
  Reading it back out of the baked document would couple the app to the builder's output shape.
- **The page HTML is 130KB gzipped**, most of it the island's catalog props, so on slow 4G nothing in
  the frame can start before ~4.2s. Moving the catalog out of the HTML is a separate change.
- **Only the newcomer's deck is baked** — the first component, default palette. A returning visitor
  keeps the snapshot replay (`snapshot-cache.js`).

## Files

`docs/src/playground/deck-render.js`, `preview-virtual.js`, `newcomer-bake.ts`, `deck-preview.js`
(placeholders in the fit agent, `deck` and `previewFonts` options), `docs/scripts/bake-newcomer-frame.mjs`,
`docs/src/pages/playground.astro`, `docs/src/components/playground/PlaygroundApp.tsx`,
`lib/core/font-settle.js`, `lib/runtime/index.js`, `lib/core/section-index.js`,
`lib/core/rough-ink-dom.js`.
