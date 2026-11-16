---
status: proposed
summary: Chart detail cards come to the exported HTML player (Present and Read views, a viewer toggle on by default, an author switch to ship without them), drawn by Fumetto (`@laticent/fumetto`), a new zero-dependency popover library in the sibling family. A spike places cards identically to Floating UI on 5,000 seeded cases in Chromium, WebKit and Firefox at 1.0 KB gzipped against 6.9 KB, and at least 3 times faster per placement (speed varies by run and engine; WebKit is the slowest case). Floating UI and Radix leave the hard part (intent, top layer, fullscreen, focus, touch) to the caller, and every popover bug we have logged lives there. Reverses the 2026-07-07 player non-goal for this one interaction.
---

# Fumetto: our popover library, and chart detail cards in the player (2026-11-16)

**Status: proposed.** The owner asked for this on 2026-11-16 and settled the first round of
decisions the same day (§10). This note is the design. Nothing in the player changes until the
owner has seen it, and every slice that changes exported bytes stops for sign-off (QUALITY BAR).

*Fumetto* is Italian for a comic strip's speech balloon: a card with a tail that points at who is
speaking.

## 1. The ask

The owner, on 2026-11-16:

- An exported HTML player shows charts but not their detail cards. In the Studio you can hover or
  tap a mark and read what is behind the number. In the player you cannot, and that "diminishes
  the experience". Charts are where a reader digs deeper, so the player needs this, with a button
  to turn it off and **on by default**.
- The Studio draws the card with shadcn's Popover, and popovers "are an incredibly hard thing to
  place". The owner is open to our own popover library, **private now and published later**, like
  the rest of the family.
- On the library, the owner asked us to understand first: *who we are and how we build libraries*,
  whether Floating UI has real gaps and jank, and why ours would be bigger. The answer must be
  **generic** (useful outside slides), **zero-dependency**, minified, documented, with a logo, and
  fast.

## 2. What exists today (the audit)

**The player carries the data and ignores it.** `node dist/lattice.js
examples/chart-detail-reveal.md out.html --player` writes a 1.25 MB player that holds all 13
`<template class="chart-detail" data-mark>` payloads and 51 `data-mark` targets. The export's
DOMPurify pass keeps them. The only code that reads them is the narration Guide
(`guide-player-bundle.generated.mjs`), which ranks their text for captions. No code opens a card.

**That was a decision, not a bug.** `2026-07-07-html-lattice-player.md` § Non-goals lists "live
interactivity inside an exported deck beyond presentation transport + reading". This note
reverses that for one interaction, chart detail cards, and nothing else.

**The Studio's reveal can't be reused as it is.** It has two halves:

- `docs/src/playground/chart-interact.js` (992 lines) finds the mark under the pointer, reads its
  template, dims the other marks, and binds digits 1 to 9. It lives in the docs site, not `lib/`,
  and it is built to reach across a same-origin `srcdoc` iframe from the parent page. The player
  has no iframe: its slides sit inline in the document.
- `docs/src/components/chart-detail-layer.tsx` draws the card with the Radix Popover behind shadcn.
  The player is one inline `<script>` locked by a Content Security Policy hash. It cannot import
  anything and has no React (`player-core.mjs`, which inlines kernels with `.toString()` for this
  reason).

**The player's page is hostile to popovers.** Each slide is scaled with `transform: scale()`
(`player-core.mjs`, `--lp-fit`). Fullscreen is requested on an element, so anything attached to
`<body>` disappears in fullscreen. The Read view moves charts into a scrolling article. On a phone
there is no hover.

## 3. Who we are: how we build libraries

We have 18 `@laticent/*` packages in `docs/src/lib/`. Read together, they share these habits:

| Habit | Where it shows |
|---|---|
| **No third-party dependencies.** 16 of 18 depend on nothing. `cadenza` and `vetrina` depend only on `@laticent/ltt`, our own format. `tavola` lists four third-party packages (`yjs`, `y-protocols`, `lib0`, `trystero`) as **optional** peers, used only by its adapters | each `package.json` |
| **Framework-free core.** The core needs the DOM at most, often not even that. React is an optional `./react` entry with React as a peer | Vetrina, Fuoco |
| **One package shape.** Source `index.ts`; `dist/` built with the in-tree esbuild, committed, and freshness-gated; `exports` points the docs toolchain at source; `sideEffects: false` | `2026-07-08-library-shape-cadenza-vetrina.md` |
| **A refusal at the center.** Each library is defined by what it will not do. Squadra refuses a rule it cannot prove works; Segno refuses a grammar it cannot prove is linear; Trama refuses a line through a box | each README's first paragraph |
| **General first, Lattice is the first user.** Mosaico packs boxes for anyone; `collage` and `logo-wall` happen to use it | Mosaico, Veduta, Fuoco |
| **The README opens with the Italian word and its meaning**, then the model in a few bullets, then a start on a plain page | Squadra, Vetrina |
| **A mark.** 128 viewBox, a ringed center hub with a pale halo, one palette at least 0.069 OKLab from every sibling, a Fraunces lockup, and a metaphor that *is* the library | `2026-07-18-sibling-brand-system.md` |
| **Private until released.** Publish-shaped now, released through the changesets plan | `2026-08-09-changesets-multi-package-release.md`, `2026-10-07-first-npm-release.md` |

So a zero-dependency popover library is the house rule, not a stretch.

## 4. Floating UI and Radix: what they do and what they leave to us

Floating UI is good software, so the honest finding is narrower than "it has jank".

**It does geometry, and only geometry, outside React.** `@floating-ui/dom` 1.8.0 exports
`arrow autoPlacement autoUpdate computePosition detectOverflow flip getOverflowAncestors hide
inline limitShift offset platform shift size`. Hover intent, the safe corridor between anchor and
card, dismissal, focus and touch live in `@floating-ui/react`. A page without React gets none of
them.

**Every popover bug we have logged sits outside the geometry:**

| What went wrong | Where it lives | Evidence |
|---|---|---|
| A swept pointer opens the chart card for one frame and shuts it. Radix wraps the card in its own positioning div that keeps catching the pointer, and the chart reads that as "the pointer left" | Radix wrapper | `engineering/gotchas/studio-playground.md`, the chart-card sweep entry; fixed in `chart-interact.css` with a `:has()` override |
| A popover opened from a menu item shows for about 23 ms, then closes. The menu moves focus as it closes and the popover reads that as the user leaving | Radix focus handling | `studio-playground.md`, "An editor opened from a menu item closes within a frame" |
| The card renders behind Present: the popover portals to `<body>` at z-50, Present sits at z-100 to 130 | z-index stacking | `chart-detail-layer.tsx`, `z-[140]` and its comment |
| The card misses its anchor while a slide's transform or a loader settles late | our anchor tracking | `chart-interact.js`, `chartRO`, `frameMO` and the coalesced reflow |
| Deck CSS (pills, sparks) doesn't reach a card portaled out of the slide | content isolation | `chart-detail-layer.tsx` copies the slide's ancestor chain and every custom property into a shadow root |

**Its API costs something.** `computePosition` returns a Promise because Floating UI supports
platforms that measure asynchronously (React Native, canvas). On the DOM, that forces every caller
to hide the card, wait, then show it. A synchronous engine measures and places in one step.

**So owning it costs about 300 lines of geometry,** and the spike (§5) shows those lines can match
Floating UI's output. The interaction layer is ours to write either way, because Floating UI's DOM
package doesn't ship one.

## 5. The spike: does a zero-dependency engine hold up?

`2026-11-16-fumetto-popover-library/spike/place.mjs` is a synchronous placement kernel: side and
alignment, gap, flip to the opposite side (Floating UI's `bestFit`), shift along the cross axis,
the room left for a tall card, an arrow offset, a visual-viewport-aware measure, and a
rAF-coalesced tracker for scroll, resize, zoom and fullscreen. `spike/harness.mjs` builds it and
Floating UI with the same features through esbuild, then runs both on the same 5,000 seeded cases
in a real browser. Half the anchors are cursor points (a chart reveal), half are boxes (a button).
Run it with `node engineering/decisions/2026-11-16-fumetto-popover-library/spike/harness.mjs
[--engine chromium|webkit|firefox] [--seed N] [--cases N]`.

Measured on 2026-11-16, seed `20261116`:

| | Floating UI 1.8.0 | Fumetto spike |
|---|---|---|
| Minified | 17.1 KB | **2.2 KB** |
| Gzip -9 | 6.9 KB | **1.0 KB** |
| Same side and position (within 0.5 px), Chromium 153 | — | **5000 / 5000** |
| Same side and position, WebKit 26 | — | **5000 / 5000** |
| Same side and position, Firefox 142 | — | **5000 / 5000** |
| 5,000 placements, Chromium | 240 ms (48 µs each) | **33 ms (6.5 µs each)** |
| 5,000 placements, WebKit | 429 ms (86 µs each) | **135 ms (27 µs each)** |
| 5,000 placements, Firefox | 1,251 ms (250 µs each) | **58 ms (12 µs each)** |

**It can fail.** Changing the flip test from "spills by more than 0 px" to "more than 1 px" makes
the harness report 4995 / 5000. The file was then restored byte for byte.

**What the spike does NOT show:**

- Speed is a printed measurement, not a fair benchmark. Floating UI also walks the card's
  offset parent and clipping ancestors, which the spike skips because it places in the viewport.
- The spike handles one boundary, the visual viewport. The library must also handle a clipping
  ancestor (`overflow: hidden`), a containing block made by a transformed ancestor, right-to-left
  writing, and an anchor that scrolls out of view (hide the card). Floating UI handles those today;
  each one becomes a parity case before it ships.

## 6. Fumetto: the design

### The refusal

**A card never appears anywhere but where it belongs.** Fumetto measures and places in the same
frame, so a card never paints at (0, 0) or at last frame's spot. It never sits between the pointer
and the thing it points at. It never fights for a z-index: it uses the browser's top layer, which
sits above everything, fullscreen included.

### The model

- **Anchor.** An element, a rect, or a point. A rect can carry a `frame` (an iframe) and Fumetto
  adds the frame's offset and scale, so the Studio's cross-iframe case is a first-class input, not
  a caller's chore.
- **Card.** Any element. Fumetto never styles content; it sets position, `max-height`/`max-width`
  and an arrow offset as CSS custom properties.
- **Placement.** `place(anchor, card, bounds, options)`, the pure kernel from the spike. Runs in a
  worker, in Node, or in a test with no DOM.
- **Layer.** Where the card lives. `popover="manual"` (top layer) where the browser supports it;
  otherwise a fixed element inside `document.fullscreenElement ?? document.body`. When fullscreen
  changes, the layer moves the card so it stays visible.
- **Intent.** How a card opens and closes. `hover` (a short open delay, and a grace corridor
  shaped like the triangle between pointer and card so moving toward the card never closes it),
  `press` (tap or click to pin; tap outside or Escape to close), `focus`, and `manual`. On a
  coarse pointer, hover falls back to press.
- **Access.** The card gets an id and a role; the anchor gets `aria-describedby` or
  `aria-expanded`/`aria-controls` to match. Fumetto never moves focus unless the caller asks
  (`trapFocus` for a dialog-like card), and on close it returns focus only if it took it.
  Reduced motion turns off its enter and exit transitions.

### API sketch (to be finalized in the build slice)

```js
import { place } from '@laticent/fumetto';          // pure geometry
import { createFumetto } from '@laticent/fumetto';  // the DOM layer

const fm = createFumetto();                          // one per page; owns the layer
const card = fm.open(anchor, cardEl, { side: 'bottom', align: 'start', gap: 12, pad: 8, intent: 'hover' });
card.move(nextAnchor);                               // re-anchor without a close/open flash
card.close();
```

`@laticent/fumetto/react` wraps the same calls in a hook and a component, with React as an
optional peer.

### What it owns that the stack we use now does not

| Problem | Floating UI DOM | Radix Popover | Fumetto |
|---|---|---|---|
| Collision geometry (flip, shift, size, arrow) | yes | via Floating UI | yes, synchronous |
| Hover intent and a safe corridor | React package only | no | yes |
| Tap-to-pin on touch | no | partly (click) | yes |
| Top layer, above fullscreen | no | no (portal + z-index) | yes |
| Anchor inside an iframe | caller maps it | caller maps it | `frame` on the anchor |
| Pointer never caught by the card's own wrapper | n/a | no (our gotcha) | no wrapper exists |
| Focus never moved unless asked | n/a | moves on open and close by default | yes |
| No framework | yes | React | yes |
| Dependencies | `@floating-ui/core`, `utils` | Floating UI and Radix internals | none |

### Size and speed are gated

The library ships with a byte budget in its build, the way the player has a size ceiling. Proposed:
**the whole DOM entry at or under 4 KB gzipped**, the geometry kernel at or under 1.5 KB. A
`bench` scenario (`npm run bench`, HARD RULE #19) records placement cost so a regression shows up.
These are proposals for the owner (§10).

### Non-goals

- Menus, selects, comboboxes and dialogs as full widgets. Fumetto is the positioning and lifecycle
  layer under them. shadcn stays the Studio's widget kit; its Popover may move onto Fumetto later,
  but that is not this work.
- Virtual lists or anything that scrolls inside the card. The card sets `max-height` and the
  content scrolls itself.
- Animation choreography beyond a fade and a short scale.

## 7. Chart detail cards in the player

### One reveal kernel, three hosts

Move the framework-free half of `chart-interact.js` into `lib/runtime/chart-reveal/`: the chart
and mark selectors, the hit test, `infoFor` (label, value, color, body, meta), dimming, and the
digit keys. It must be inlinable the way `present-transport.mjs` is: self-contained functions,
pinned by `test/unit/export/inlinable-kernels.test.js`. Then:

- **The player** inlines the kernel and Fumetto's built IIFE string, the way
  `anima-player-bundle.generated.mjs` ships Anima.
- **The Studio and Playground** call the same kernel. `chart-detail-layer.tsx` becomes a thin
  adapter, and its card moves onto `@laticent/fumetto/react` in the same slice that proves it in
  the player. That deletes the `z-[140]` stacking fix and the pointer-wrapper override.
- **Present** in the Studio rides along with the Studio.

That is HARD RULE #1 (one source for every render path) and #15 (one widget, not one per surface).

### What the viewer does

| Input | Present view | Read view |
|---|---|---|
| Mouse | hover a mark: card opens near the pointer; move off: it closes | same |
| Touch | tap a mark: card pins; tap elsewhere: closes. A swipe still turns the slide | tap to pin; scrolling closes |
| Keyboard | `1`–`9` open mark *n*, `0` or `Escape` closes; `Tab` reaches each mark | `Tab` reaches each mark; `Enter` opens |
| Screen reader | the card is announced from the mark it describes | same |

The digit keys are free in the player today: `PRESENT_KEYMAP` holds arrows, space, page keys,
Home and End, and the lightbox only reads digits while it owns the keyboard (`digitAction`).

### The card's content

Each mark's `<template>` content is cloned as DOM nodes (`importNode`) into the card. Nothing is
parsed from a string, and the content was sanitized at export (HARD RULE #22). If
`checkRuntimeMarkupSinks` counts the clone, it enters `SANCTIONED_RUNTIME_MARKUP_SINKS` with that
justification.

The deck's own CSS has to reach the card, because a description can hold pills and sparks. The
Studio does this by copying the slide's ancestor chain and custom properties into a shadow root.
The player has a simpler route: the card lives in the same document as the deck CSS. It still
needs the chain copy, because deck rules are scoped `article.lattice > section …` and the card
lives outside the scaled slide. That helper moves into the shared kernel. **This is the riskiest
part of the work**: rules sized in slide units (`cqi`, `--_sec-1cqi`) resolve against the card,
not the slide. Slice 2 proves it first on the real player.

### The on/off controls

- **Viewer button.** An icon-only button in `#lp-bar` beside Notes, drawn with a `--mark-*` mask
  (HARD RULE #29, no typed glyph), `aria-pressed`, **on by default**. The choice is remembered per
  viewer in `localStorage`, every read and write wrapped in `try`/`catch`, so a private window
  simply starts on. The button appears only when the deck has detail cards.
- **Author switch.** `--strip-chart-details` on the CLI, and the same option in the Studio's
  export dialog, named and placed like `--strip-notes`. It removes the templates **and** the
  reveal runtime, so a board pack with draft detail text ships without it. The owner's answer named
  a CLI or front-matter switch. This note recommends the export option only: whether a shipped
  file carries detail text is a choice about that file, like notes, not about the deck. A front
  matter key can follow if an author asks for it.

### What stays the same

- **A deck without detail cards exports byte-identical.** The kernel and Fumetto are inlined only
  when the deck has `template.chart-detail`, so the `html-player` golden holds. Same rule as
  narration and Anima.
- **The no-JavaScript floor** (`2026-09-29-player-no-js-controls.md`) is unchanged: without
  script there is no card, and the slide still reads.
- **Print** hides the card.

## 8. The mark (logo brief)

Built to `2026-07-18-sibling-brand-system.md`, three assets
(`docs/public/fumetto-{mark,mark-min,lockup}.svg`):

- **Metaphor.** A speech balloon whose tail lands on the ringed hub. The hub is the anchor, the
  tail is the placement, the balloon is the card. Behind it, three faint ghost balloons on the
  other sides: the places flip considered and rejected. The one solid balloon is the choice.
- **Palette.** One new primary and accent, at least 0.069 OKLab from every sibling in light and
  dark (§ Palette diversity), measured when the mark is built and recorded in that note.
- **Min mark.** The balloon and hub alone, legible at favicon size.

## 9. Risks and open questions

- **Deck CSS in the card** (§7). If slide-unit rules can't resolve outside the slide, the fallback
  is to measure the slide's unit and set it on the card's chain copy. Proven in slice 2 before
  anything else depends on it.
- **The narration Guide reads the templates.** `--strip-chart-details` must not quietly change the
  Guide's captions. Either the Guide takes what it needs before the strip, or the strip keeps the
  text the Guide reads. Decided in slice 4 with a test.
- **Popover API coverage.** `popover="manual"` landed in Chrome 114, Safari 17 and Firefox 125. An
  exported file is frozen and may open years from now on an older browser, so the fixed-element
  fallback is not optional.
- **Fullscreen order.** A top-layer card opened before fullscreen starts sits under the fullscreen
  element. The layer re-shows the card on `fullscreenchange`; tested on the real player.
- **Size.** Proposed budget for the player's added script, kernel plus Fumetto: at or under 8 KB
  gzipped, measured on the demo deck.

## 10. Owner decisions

Settled 2026-11-16:

1. **Bring detail cards to the player**, in both the Present and Read views.
2. **Our own library**, generic and zero-dependency, minified, documented, with a mark. Not
   Floating UI underneath.
3. **A viewer button, on by default, and an author switch.**

Proposed here, for the owner to confirm before slice 1:

4. The name **Fumetto** (`@laticent/fumetto`), private until the family's release.
5. The byte budgets: Fumetto's DOM entry at or under 4 KB gzipped, the player's added script at or
   under 8 KB gzipped.
6. The author switch as an export option (`--strip-chart-details` plus the Studio export dialog)
   rather than front matter.
7. The Studio's chart card moves onto Fumetto in slice 3, retiring its z-index and pointer
   overrides.

## 11. Order of work

Each slice is one commit in one PR for the line of work (HARD RULE #17). Every slice that changes
exported bytes stops for the owner's sign-off with dark and light players (QUALITY BAR).

| # | Slice | Proves | Gate |
|---|---|---|---|
| 1 | **Fumetto core** in `docs/src/lib/fumetto/`: `place`, `measure`, `track`, layer, intent, access; README; the spike's harness as its parity suite (Chromium, WebKit, Firefox) plus clipping, transform, RTL and hide cases; byte budget in its build | the library stands alone | unit + parity suites, budget |
| 2 | **Shared reveal kernel** in `lib/runtime/chart-reveal/`, and the player wired to it in the Present view | deck CSS reaches the card; scaled stage; fullscreen | real player in Chromium and WebKit; owner sign-off |
| 3 | **Studio, Playground and Present** moved onto the kernel and `fumetto/react` | one reveal everywhere; the two Radix workarounds deleted | `docs/e2e/chart-detail-reveal`, `chart-popup-dismiss` and `present-chart-card` specs, at three widths |
| 4 | **Read view, viewer button, author switch**, demo deck `examples/player-chart-details.md` | the remaining surfaces | owner sign-off; the html-player golden unchanged for decks without details |
| 5 | **The mark** and the docs page | the family look | brand note updated with the measured palette distance |

Novel work with real blast radius, so the adversarial trio (red team, inversion, checker) reviews
what ships at the end of slice 4, not each draft (HARD RULE #25).
