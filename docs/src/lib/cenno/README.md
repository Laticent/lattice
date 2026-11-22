# @laticent/cenno

*Cenno* is Italian for a nod or a small sign: *fare un cenno* is to signal to someone with a nod.
A popover is that: a small sign that appears beside a thing and points to it.

Cenno opens tooltips, popovers and detail cards next to anything on the page, and refuses to show
a card anywhere but where it belongs. It places the card in the same frame it measures, so a card
is never painted at (0, 0) or at last frame's spot. It puts the card in the browser's top layer,
so it never fights a z-index and stays visible in fullscreen. It never sits between the pointer
and the thing it points at. No dependencies and no framework: the core needs only the DOM.

Lattice is the first user: the exported HTML player's chart detail cards. The design, the audit
of what Floating UI and Radix leave to the caller, and the measured spike are in
[`2026-11-16-cenno-popover-library.md`](../../../../engineering/decisions/2026-11-16-cenno-popover-library.md).

**Status: 0.1.0, unpublished.**

## Install

```sh
npm i @laticent/cenno
```

## Sixty-second start

```js
import { attach, createCenno } from '@laticent/cenno';

const cenno = createCenno(); // injects the stylesheet once

// A tooltip on hover and keyboard focus. On a phone, hover becomes tap.
attach(cenno, document.querySelector('#save'), () => 'Saves a copy to your library');

// A card you drive yourself: next to a point, a box, or an element.
const card = cenno.open({ x: 320, y: 180 }, { title: 'Revenue', value: '$4.2M', body: 'Up 12% on Q2.' }, { gap: 12 });
card.move(document.querySelector('#bar-3')); // point somewhere else, no close-and-open flash
card.close();
```

## The model

- **Anchor.** What the card points at: an element (in this document, or in a same-origin iframe
  at any depth), a box `{ x, y, width, height }`, or a point `{ x, y }`. A box or point can name
  the `frame` its coordinates belong to, and Cenno adds the frame's offset and scale.
- **Card.** Any node, a string, or the standard anatomy (below). Cenno never styles your content.
- **Placement.** `place(anchor, card, bounds, options)` is pure arithmetic: side and alignment,
  gap, flip to the other side when there is no room, shift along the edge to stay inside, the room
  left for a tall card, an arrow offset, and whether the anchor is out of view. It runs in a worker,
  in Node, or in a test with no DOM, and places a card where Floating UI's
  `offset` + `flip` + `shift` + `size` + `arrow` would.
- **Layer.** Cards go in the top layer (`popover="manual"`), above every z-index and above a
  fullscreen element. When fullscreen starts or ends, open cards move with it. Without the Popover
  API, a card is a fixed element inside the fullscreen element (or `<body>`), and Cenno corrects
  for a containing block a transformed ancestor moved.
- **Intent.** When a card opens and closes for a real trigger: `hover`, `press` or `focus`
  (`attach`, below). A card you drive yourself (`open`) has no intent: you decide.

## Opening a card

`createCenno({ document?, host?, css? })` returns `{ open, cards, destroy, document }`. Pass `host`
to mount cards inside an element (for example in a shadow root) instead of the top layer.

`open(anchor, content, options)` returns a card:

| Member | Does |
|---|---|
| `element`, `content` | The card and its scrolling content box. |
| `side`, `hidden`, `isOpen` | Where it ended up; whether the anchor is out of view; whether it is still open. |
| `set(content)` | Replace the content and re-place, in the same frame. |
| `move(anchor, options?)` | Point at a new anchor without closing. |
| `update()` | Re-measure and re-place now. Call it when you move things with a transform (see Zoom). |
| `close()` | Remove the card. |

Options: `side` (`top`, `right`, `bottom`, `left`; default `bottom`), `align` (`start`, `center`,
`end`), `gap`, `pad` (distance from the screen edge), `arrow` and `arrowPad`, `rtl`, `role`
(default `tooltip`), `label`, `live` (announce content changes), `inert` (let the pointer pass
through), `pinch` (`steady` or `follow`), `watch` (`events` or `frame`), `className`.

## Triggers: `attach`

`attach(cenno, trigger, () => content, options)` wires one element and returns the detach function.

| Intent | Opens | Closes | ARIA |
|---|---|---|---|
| `hover` (default) | a mouse or pen rests for `openDelay` (100 ms); keyboard focus at once | `closeDelay` (120 ms) after leaving, unless the pointer is on its way to the card | tooltip: `aria-describedby` on the trigger |
| `press` | click or tap toggles | another press, a press outside, Escape | dialog: `aria-haspopup`, `aria-expanded`, `aria-controls` |
| `focus` | focus | blur | tooltip |

**The grace corridor.** Leaving the trigger toward the card does not close it: while the pointer
stays in the triangle between where it left and the card's near edge, the card waits. Leave the
corridor and it closes.

**Touch.** On a device whose primary pointer cannot hover (a phone), `hover` behaves as `press`:
tap to open, tap again or elsewhere to close. A touch never opens a hover card by accident.

**Focus.** `open` never moves focus. A `press` card opened from the keyboard (Enter or Space) takes
focus, so its contents are reachable; leaving it closes it. If focus was inside a card when it
closes, it goes back to the trigger. Escape closes an open card, and stops there only when it came
from that card or its trigger, so a tooltip never swallows a host dialog's Escape.

## Styling: tokens, parts, anatomy

Cenno paints no color of its own. Every visual property reads a token, with the browser's system
colors as the fallback, so an unstyled card already follows light and dark mode. Set tokens
anywhere above the card:

```css
:root {
  --cenno-bg: var(--surface);
  --cenno-fg: var(--ink);
  --cenno-border: var(--rule);
  --cenno-radius: 10px;
}
```

| Token | Default |
|---|---|
| `--cenno-bg`, `--cenno-fg`, `--cenno-border` | `Canvas`, `CanvasText`, `GrayText` |
| `--cenno-border-width`, `--cenno-radius`, `--cenno-shadow` | `1px`, `.5rem`, a soft drop shadow |
| `--cenno-pad`, `--cenno-gap`, `--cenno-max-width` | `.625rem .75rem`, `.375rem`, `20rem` |
| `--cenno-line-height` | `1.45` (the card takes the page's font; set `font` on `.cenno` to change it) |
| `--cenno-arrow-size`, `--cenno-motion` | `.625rem`, `120ms` (none under reduced motion) |

Every element carries a part name, as `data-cenno-part` and as `part` (for `::part()` when the
card lives in a shadow root): `card`, `arrow`, `content`, `header`, `lead`, `title`, `value`,
`body`, `footer`. The names are public API. Every rule in Cenno's stylesheet is wrapped in
`:where()`, so any rule of yours wins.

**The anatomy** is optional. Pass `{ lead, title, value, body, footer }` instead of a node and Cenno
builds a header row (a lead mark, the title, a trailing value), a body and a footer, rendering only
the parts you give. Strings become text, never markup.

## Zoom

| Zoom | What Cenno does |
|---|---|
| Page zoom (Ctrl/Cmd and +) | Nothing special: everything grows, the card included, as the reader asked. |
| Pinch zoom (two fingers, or a trackpad pinch) | Keeps the card's size on screen (`pinch: 'steady'`, the default) and keeps it on the part of the page the reader can see. `pinch: 'follow'` lets it zoom with the page. |
| Your own zoom (a CSS transform on a stage) | The browser fires no event, so call `card.update()` on each step, or open with `watch: 'frame'`. |

An anchor zoomed or scrolled out of view hides the card until it comes back.

## Sizes

Every module states what it buys. There is no byte budget; a change that grows a row says why.

<!-- cenno-sizes:start (generated by tools/build-cenno-sizes.js; npm run build) -->
| Module | What it buys | Minified | Gzip |
|---|---|---:|---:|
| `place.ts` | Where the card goes: flip, shift, size, arrow, hide. Pure arithmetic. | 1490 B | 0.7 KB |
| `measure.ts` | Reads anchors (elements, points, iframes at any depth), the visual viewport and clipping ancestors. | 1799 B | 0.8 KB |
| `cenno.ts` | Opens, moves and closes cards: top layer, fullscreen, steady size under pinch, tracking. | 4452 B | 2.0 KB |
| `intent.ts` | Hover with a grace corridor, focus, press, Escape, outside press, the ARIA wiring. | 3759 B | 1.3 KB |
| `card.ts` | The optional anatomy (header, body, footer) and the part names. | 805 B | 0.4 KB |
| `styles.ts` | The one stylesheet: tokens with system-color fallbacks. | 2723 B | 0.9 KB |
| **All of it** | One bundle of `index.ts` | **14744 B** | **5.4 KB** |
<!-- cenno-sizes:end -->

## Tests

- `place.test.ts`: worked examples, then seeded properties (a card that fits stays inside its
  bounds, never flips away from a side it fits on, never overlaps its anchor, keeps its arrow on
  the edge; right-to-left mirrors left-to-right). `CENNO_SEED` and `CENNO_RUNS` replay or widen a run.
- `cenno.test.ts`: the lifecycle, the layer, fullscreen, steady size under pinch, the containing
  block correction, the anatomy and every intent.
- `docs/e2e/cenno-parity.spec.ts`: placement against Floating UI on seeded cases in Chromium,
  WebKit and Firefox, plus pinch zoom, transformed containers, clipping and iframes in a real
  browser.

## Boundaries

Cenno imports nothing outside this folder (gated by `checkCennoBoundary` in
`tools/check-ownership.js`, and by `npm run check:cenno`, a standalone typecheck with DOM types
only). Lattice's chart reveal, which reads chart marks and builds their cards, lives outside it.
