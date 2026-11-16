---
status: proposed
summary: Chart detail cards come to the exported HTML player (Present and Read views, a `details:` front-matter key for the starting state, an export toggle and CLI flag that override it, and a reader button that can always turn them off), drawn by Cenno (`@laticent/cenno`), a new zero-dependency popover library in the sibling family. A spike places cards identically to Floating UI on 5,000 seeded cases in Chromium, WebKit and Firefox at 1.0 KB gzipped against 6.9 KB, and at least 3 times faster per placement (speed varies by run and engine; WebKit is the slowest case). Floating UI and Radix leave the hard part (intent, top layer, fullscreen, focus, touch) to the caller, and every popover bug we have logged lives there. Reverses the 2026-07-07 player non-goal for this one interaction.
---

# Cenno: our popover library, and chart detail cards in the player (2026-11-16)

**Status: proposed.** The owner asked for this on 2026-11-16 and settled the first round of
decisions the same day (§10). This note is the design. Nothing in the player changes until the
owner has seen it, and every slice that changes exported bytes stops for sign-off (QUALITY BAR).

*Cenno* is Italian for a nod or a small sign: *fare un cenno* is to signal to someone with a nod
or a gesture. A popover is that: a small sign that appears beside a thing and points to it. The
owner picked the name on 2026-11-16 over *Fumetto* (a speech balloon, but also the everyday word
for comics) and *Cartiglio* (the painted scroll that names a figure), partly because the family
already has several names starting with F (Filo, Fluido, Fuoco).

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

`2026-11-16-cenno-popover-library/spike/place.mjs` is a synchronous placement kernel: side and
alignment, gap, flip to the opposite side (Floating UI's `bestFit`), shift along the cross axis,
the room left for a tall card, an arrow offset, a visual-viewport-aware measure, and a
rAF-coalesced tracker for scroll, resize, zoom and fullscreen. `spike/harness.mjs` builds it and
Floating UI with the same features through esbuild, then runs both on the same 5,000 seeded cases
in a real browser. Half the anchors are cursor points (a chart reveal), half are boxes (a button).
Run it with `node engineering/decisions/2026-11-16-cenno-popover-library/spike/harness.mjs
[--engine chromium|webkit|firefox] [--seed N] [--cases N]`.

Measured on 2026-11-16, seed `20261116`:

| | Floating UI 1.8.0 | Cenno spike |
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

## 6. Cenno: the design

### The refusal

**A card never appears anywhere but where it belongs.** Cenno measures and places in the same
frame, so a card never paints at (0, 0) or at last frame's spot. It never sits between the pointer
and the thing it points at. It never fights for a z-index: it uses the browser's top layer, which
sits above everything, fullscreen included.

### The model

- **Anchor.** An element, a rect, or a point. A rect can carry a `frame` (an iframe) and Cenno
  adds the frame's offset and scale, so the Studio's cross-iframe case is a first-class input, not
  a caller's chore.
- **Card.** Any element. Cenno never styles content; it sets position, `max-height`/`max-width`
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
  `aria-expanded`/`aria-controls` to match. Cenno never moves focus unless the caller asks
  (`trapFocus` for a dialog-like card), and on close it returns focus only if it took it.
  Reduced motion turns off its enter and exit transitions.

### API sketch (to be finalized in the build slice)

```js
import { place } from '@laticent/cenno';        // pure geometry
import { createCenno } from '@laticent/cenno';  // the DOM layer

const cn = createCenno();                       // one per page; owns the layer
const card = cn.open(anchor, cardEl, { side: 'bottom', align: 'start', gap: 12, pad: 8, intent: 'hover' });
card.move(nextAnchor);                          // re-anchor without a close/open flash
card.close();
```

`@laticent/cenno/react` wraps the same calls in a hook and a component, with React as an
optional peer.

### What it owns that the stack we use now does not

| Problem | Floating UI DOM | Radix Popover | Cenno |
|---|---|---|---|
| Collision geometry (flip, shift, size, arrow) | yes | via Floating UI | yes, synchronous |
| Hover intent and a safe corridor | React package only | no | yes |
| Tap-to-pin on touch | no | partly (click) | yes |
| Top layer, above fullscreen | no | no (portal + z-index) | yes |
| Anchor inside an iframe | caller maps it | caller maps it | `frame` on the anchor |
| Pointer never caught by the card's own wrapper | n/a | no (our gotcha) | no wrapper exists |
| Focus never moved unless asked | n/a | moves on open and close by default | yes |
| No framework | yes | React | yes |
| Styling by tokens and named parts, and an optional card anatomy | caller's job | Tailwind classes on our copy | yes (§6, Styling and structure) |
| Card keeps its screen size under pinch zoom; hit radius in screen pixels | no | no | yes (§7a) |
| Dependencies | `@floating-ui/core`, `utils` | Floating UI and Radix internals | none |

### Every byte and every microsecond is accounted for, not capped

No byte budget. The owner ruled a ceiling premature on 2026-11-16: a number picked before the
library exists either pinches a feature that earns its bytes or invites padding up to the line.
The target is that **every part is load-bearing and its cost is known**:

- **The build prints a size table per module** (`place`, `measure`, `track`, layer, intent,
  access, structure, the React adapter): minified and gzipped bytes. The README carries the same
  table, regenerated and freshness-gated like every other built artifact (HARD RULE #2).
- **Each PR that grows a module states the growth and what it buys** in its body. A module with
  no user-visible job is deleted, not kept "just in case".
- **Speed is measured, not asserted** (HARD RULE #19): a `bench` scenario times placement,
  re-placement under `track`, and open-to-painted for a card, so a regression shows in
  `npm run bench:check`. No pass/fail test ever asserts milliseconds (HARD RULE #32).
- **The spike is the reference point**: 1.0 KB gzipped for geometry and tracking at Floating UI
  parity. The library's size table starts from that line.

### Styling and structure: the host skins it, Cenno never paints it

The owner asked that the library be designed around how a host styles its popups, and possibly
the structure inside them, so the Studio and the player can look and behave alike. Three layers,
each optional:

1. **Tokens.** Every visual property Cenno owns is a CSS custom property on the card, with a
   neutral default: `--cenno-bg`, `--cenno-fg`, `--cenno-border`, `--cenno-radius`,
   `--cenno-shadow`, `--cenno-pad`, `--cenno-max-width`, `--cenno-gap` (anchor distance),
   `--cenno-arrow-size`, `--cenno-motion` (duration; zero under reduced motion). A host maps its
   own theme onto them in one rule: the Studio maps its app tokens (`--popover`, `--border`), the
   player maps the deck theme's tokens, so the card is palette-blind the way `lattice.css` is
   (HARD RULE #3). Cenno ships no colors of its own beyond the neutral fallback.
2. **Parts.** The card's own elements carry stable names, `[data-cenno-part="card|arrow|header|
   body|footer"]`, and the same names as `part=` when the card lives in a shadow root, so
   `::part(header)` styles it from outside. Names are a public API: renaming one is a breaking
   change.
3. **Structure (opt-in).** `cenno.card({ header, body, footer })` builds the standard anatomy
   (a header row with a lead mark, a title and a trailing value; a body; a footer) from nodes the
   host supplies. A host that wants its own structure passes any element instead and keeps only
   positioning and lifecycle. The chart detail card is one recipe on that anatomy: the color dot,
   the label and the value in the header; the description in the body; the meta line in the
   footer.

**Parity follows from one recipe.** The shared reveal kernel (§7) builds the chart card through
`cenno.card` on every surface, so the Studio, Present and the player show the same structure,
the same behavior and the same parts. Only the token mapping differs, because each host owns its
own theme. A parity test renders the same chart detail on each surface and compares structure and
part names, not pixels.

### Non-goals

- Menus, selects, comboboxes and dialogs as full widgets. Cenno is the positioning and lifecycle
  layer under them. shadcn stays the Studio's widget kit; its Popover may move onto Cenno later,
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

- **The player** inlines the kernel and Cenno's built IIFE string, the way
  `anima-player-bundle.generated.mjs` ships Anima.
- **The Studio and Playground** call the same kernel. `chart-detail-layer.tsx` becomes a thin
  adapter, and its card moves onto `@laticent/cenno/react` in the same slice that proves it in
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
- **The deck sets the starting state: `details: on | off`.** A new front-matter register, default
  `on`, shaped like `callout: on | off` (`lib/base/base.registers.docs.md`). It sets whether
  detail cards start enabled when the player opens. It goes through the register machinery and
  its lint like every other key (HARD RULE #7), and the generated front-matter reference lists it.
- **The export can override it.** The Studio's export dialog shows a toggle that starts at the
  deck's value, and the CLI takes `--details on|off`. Either one sets the exported file's
  starting state without editing the deck. Precedence: export setting, then front matter, then
  `on`.
- **The reader always has the last word.** The viewer button can always turn cards off, whatever
  the file's starting state. When the file starts them off, the same button turns them on: the
  cards are in the file either way, so `off` means "start hidden", not "removed". The reader's
  choice is remembered in `localStorage` under a key that includes the deck's identity, because
  every `file://` player shares one origin, and a choice made in one deck must not leak into
  another.
- **Removing the detail text from a file is a separate need**, not planned. If an author asks to
  ship a player that cannot show draft detail text, a `--strip-chart-details` flag, beside
  `--strip-notes`, is the shape.

### What stays the same

- **A deck without detail cards exports byte-identical.** The kernel and Cenno are inlined only
  when the deck has `template.chart-detail`, so the `html-player` golden holds. Same rule as
  narration and Anima.
- **The no-JavaScript floor** (`2026-09-29-player-no-js-controls.md`) is unchanged: without
  script there is no card, and the slide still reads.
- **Print** hides the card.

## 7a. Zoom: three kinds, each touching hit, size and placement

The owner flagged that a reader can zoom into a slide, and that this reaches all three things a
popover gets right or wrong: which mark the pointer hits, how big the card is, and where it lands.
There are three kinds of zoom, and they behave differently.

| Zoom | Where it happens today | What moves |
|---|---|---|
| **Page zoom** (Ctrl/Cmd and + or −) | any browser, any surface | CSS pixels get bigger; the page lays out again and fires `resize` |
| **Pinch zoom of the page** (two fingers, or a trackpad pinch in Safari) | the player on phones and tablets. Its `<meta name="viewport" content="width=device-width,initial-scale=1">` allows it, and must keep allowing it (blocking zoom fails accessibility) | the *visual* viewport scales and pans over a *layout* viewport that does not move |
| **Slide zoom** (our own gesture) | the Studio, through `createZoomGesture` in `lib/core/present-transport.mjs` (`2026-08-10-preview-pinch-zoom.md`). The player has none yet; `player-core.mjs` names it as the sequel | a CSS `transform` on the slide; nothing fires `resize` or `ResizeObserver` |

### Hit detection

- **Pointer coordinates are already right.** Pointer events report layout-viewport coordinates,
  and `elementFromPoint` and `getBoundingClientRect` use the same space and include every CSS
  transform. So a mark is found correctly at any zoom of any kind.
- **The touch target must stay a screen size, not a CSS size.** A heatmap's 69 px cell is about
  19 px on a phone's scaled slide. The reveal kernel takes a hit radius in *screen* pixels (44 by
  default) and converts it to CSS pixels by dividing by the combined scale (slide transform times
  `visualViewport.scale`), then picks the nearest mark inside it. Zooming in makes marks easier
  to hit, never harder.
- **A zoom gesture is never a tap.** A gesture that ever held two pointers, or panned past the
  threshold while zoomed, opens no card. This is the rule `createZoomGesture` already applies to
  swipes, and the reveal reads it from the same kernel rather than restating it (HARD RULE #1).

### Card size

- **The card stays a constant size on screen.** The reader zoomed to see the chart, not to enlarge
  the card. Under pinch zoom, Cenno sets `scale(1 / visualViewport.scale)` on the card, anchored at
  its arrow, so text keeps its size. Under slide zoom, the card lives outside the zoomed stage and
  never scales with it. This matches the Studio's existing readable-first rule
  (`chart-detail-layer.tsx`: the card is not shrunk with a scaled preview).
- **Page zoom is the exception, on purpose.** A reader who presses Ctrl and + wants everything
  bigger, the card included, so Cenno leaves page zoom alone.

### Placement

- **The bounds are what the reader sees.** `measure` uses the visual viewport (offset, width and
  height) as the boundary, so a pinch-zoomed card flips and shifts to stay on the visible part of
  the page, not the whole layout. The spike already does this.
- **The card follows the zoom.** `track` already listens to `visualViewport` `resize` and
  `scroll`, which fire on pinch and pan. Slide zoom fires nothing, so Cenno exposes
  `card.update()`, and the zoom kernel calls it on each step. While a card is open, an opt-in
  `watch: 'frame'` re-measures every animation frame for hosts that cannot call `update()`. It
  costs one measurement per frame, and only while open.
- **A mark that leaves the view hides the card.** When the anchor is panned or zoomed out of the
  visual viewport, the card hides and comes back with it.

### How it is verified

The parity harness gains zoom cases: Chromium's `Emulation.setPageScaleFactor` (through the
DevTools protocol) sets a real visual-viewport scale in a real browser, and a CSS transform on a
wrapper stands in for slide zoom. A harness is not a finger (HARD RULE #23), so slices 2 and 3
also drive a real pinch on the iOS Simulator suite by dispatch, and on the Studio's own zoom at
three widths.

## 8. The mark (logo brief)

Built to `2026-07-18-sibling-brand-system.md`, three assets
(`docs/public/cenno-{mark,mark-min,lockup}.svg`):

- **Metaphor.** A nod toward the ringed hub. The hub is the anchor. A rounded card sits beside
  it, tilted a few degrees toward the hub, with a short pointer closing the gap: the card nods at
  what it describes. Around the hub, three faint ghost cards on the other sides: the places flip
  considered and rejected. The one solid card is the choice.
- **Palette.** One new primary and accent, at least 0.069 OKLab from every sibling in light and
  dark (§ Palette diversity), measured when the mark is built and recorded in that note.
- **Min mark.** The tilted card and hub alone, legible at favicon size.

## 9. Risks and open questions

- **Deck CSS in the card** (§7). If slide-unit rules can't resolve outside the slide, the fallback
  is to measure the slide's unit and set it on the card's chain copy. Proven in slice 2 before
  anything else depends on it.
- **Popover API coverage.** `popover="manual"` landed in Chrome 114, Safari 17 and Firefox 125. An
  exported file is frozen and may open years from now on an older browser, so the fixed-element
  fallback is not optional.
- **Fullscreen order.** A top-layer card opened before fullscreen starts sits under the fullscreen
  element. The layer re-shows the card on `fullscreenchange`; tested on the real player.
- **Size.** No cap (§6). The player's added bytes are measured on the demo deck in each slice and
  reported in the PR, with what they buy.

## 10. Owner decisions

Settled 2026-11-16:

1. **Bring detail cards to the player**, in both the Present and Read views.
2. **Our own library**, generic and zero-dependency, minified, documented, with a mark. Not
   Floating UI underneath.
3. **A viewer button, on by default, and an author switch.** Refined on 2026-11-16: the deck
   sets the starting state with a `details:` front-matter key; the Studio export toggle and the
   CLI's `--details` override it per file; the reader can always turn cards off (§7).
4. **The name Cenno** (`@laticent/cenno`), private until the family's release. The record was
   drafted as *Fumetto* and renamed before merge.

5. **No byte budget.** Premature; instead every part is load-bearing and its cost is measured
   and reported (§6).
6. **The Studio's chart card moves onto Cenno in slice 3**, retiring its z-index and pointer
   overrides, and the library is designed around how a host styles the card and its structure,
   so every surface reaches parity (§6, Styling and structure).
7. **Zoom is a first-class input** (§7a): a reader zooming into a slide must not break which mark
   is hit, how big the card is, or where it lands.

Nothing is left open for the owner before slice 1.

## 11. Order of work

Each slice is one commit in one PR for the line of work (HARD RULE #17). Every slice that changes
exported bytes stops for the owner's sign-off with dark and light players (QUALITY BAR).

| # | Slice | Proves | Gate |
|---|---|---|---|
| 1 | **Cenno core** in `docs/src/lib/cenno/`: `place`, `measure`, `track`, layer, intent, access; README; the spike's harness as its parity suite (Chromium, WebKit, Firefox) plus clipping, transform, RTL, hide and zoom cases; tokens, parts and `cenno.card`; the per-module size table | the library stands alone | unit + parity suites; size table fresh; bench scenario |
| 2 | **Shared reveal kernel** in `lib/runtime/chart-reveal/`, and the player wired to it in the Present view | deck CSS reaches the card; scaled stage; fullscreen; browser pinch and page zoom | real player in Chromium and WebKit, phone and desktop; owner sign-off |
| 3 | **Studio, Playground and Present** moved onto the kernel and `cenno/react`, mapping app tokens onto Cenno's | one reveal everywhere, same structure and parts; the two Radix workarounds deleted; the Studio's own slide zoom (`createZoomGesture`) | `docs/e2e/chart-detail-reveal`, `chart-popup-dismiss` and `present-chart-card` specs, at three widths |
| 4 | **Read view, viewer button, the `details:` register, the Studio export toggle and `--details`**, demo deck `examples/player-chart-details.md` | the remaining surfaces | owner sign-off; the html-player golden unchanged for decks without details |
| 5 | **The mark** and the docs page | the family look | brand note updated with the measured palette distance |

Novel work with real blast radius, so the adversarial trio (red team, inversion, checker) reviews
what ships at the end of slice 4, not each draft (HARD RULE #25).
