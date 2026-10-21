# Veduta

**A long list that stays fast: only what the reader can see exists.**

A slide deck, a photo set, a transcript and a page-by-page document all show the same shape: many
units, one or two views onto them, and a reader who looks at a few at a time. Mounting all of them
is slow and uses memory, and every app that needs to avoid it ends up writing the same glue by hand:
a virtual list for the scrolling view, a pool for the thumbnails, a rule for what to load next, and
another rule for what to show while it loads. Veduta is that glue, without the drawing.

*Veduta* is Italian for "a view": a vista, or a view through a window. It is **headless**. It
holds no DOM, no framework and no idea what a unit is. You tell it where the reader is and what each
view can see; it tells you **which units to mount, at what fidelity, in what order**. Your code does
the mounting. It has zero dependencies and costs the same at 120 units as at 100,000.

Design and measurements: `engineering/decisions/2026-10-16-preview-as-library-audit.md`.

## Install

```sh
npm i @laticent/veduta
```

Veduta publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at
`docs/src/lib/veduta`.

## Sixty-second start

```ts
import { createVeduta } from '@laticent/veduta';

const veduta = createVeduta();

// One stage (a big view of the focused unit) and a map beside it (a strip of small tiles).
const intent = veduta.windowFor({
  policy: 'pip',              // 'single' | 'multi' | 'pip'
  stage: 'paged',             // 'paged' (re-point one view) | 'scrolled' (native scroll)
  count: 5000,
  focus: 120,                 // from any focus source, such as Fuoco's hub
  viewports: { map: { y: scrollTop, h: viewHeight, top: 0, pitch: 60, cols: 1 } },
  budget: { live: 4, stageTier: 'live', mapTile: 'wireframe' },
});

intent.stageUnits;            // [120]
intent.mapUnits;              // [98 … 112]: the tiles in and just around the map's own view
intent.tiers.map.get(98);     // 'wireframe'
intent.rank;                  // every unit, nearest its own view first

// …mount them however you like, then say what you really hold:
veduta.settle({ stage: intent.stageUnits, map: intent.mapUnits, cap: { map: 24 } });
```

## The model

| Word | Meaning |
|---|---|
| **Unit** | One thing in the list, addressed by its index. Veduta never looks inside it. |
| **Stage** | The window the reader looks at. |
| **Map** | A second window over the same units: pills, segments, wireframes, posters or live thumbnails. |
| **Policy** | `single` mounts one unit. `multi` mounts the units near the stage viewport. `pip` is `single` plus a map. |
| **Stage kind** | `paged` re-points one view as focus moves. `scrolled` is native scrolling. |
| **Tier** | The fidelity ladder, richest first: `live`, `poster`, `wireframe`, `placeholder`. A unit that misses a rung's budget falls to the next. |
| **Intent** | What `windowFor` returns: the units to mount in each window, their tiers, and a ranking. It is **advice**; your connector may mount less. |
| **Connector** | Your code that mounts: a pool of frames, a one-frame list, a plain list of elements. |

## The rules

| Rule | What it means |
|---|---|
| Each window is ranked by its own viewport | A map scrolled far from the focus still ranks its own visible tiles first. Focus is a seed, not the only center. |
| Capacity is reported, never inferred | A connector that mounts fewer than asked and says nothing is not believed to be full: it may be slow, or outside its observer band. Tell Veduta with `cap`. |
| A connector holds at least one stage unit | The focused unit is always asked for, even if you report a capacity of 0. |
| One live budget for the whole page | Live views are expensive (on WebKit a destroyed frame is never given back). The budget is shared by stage and map, and priced per connector with `budget.cost`. A unit over budget falls down the ladder before your connector sees it. |
| Moves are damped | The band rule (`need`, `mount`, `keep`) mounts ahead and unmounts behind, so scroll jitter changes nothing. It is the Playground filmstrip's rule, unchanged. |
| The core is inlinable | `windowFor` and `settle` are self-contained functions, so `fn.toString()` can be put into a page that cannot `import`. |

## The calls

| Call | What it does |
|---|---|
| `windowFor(args)` | The ranked intent for these viewports and this focus. Pure; cheap enough to call every frame. |
| `settle(intent, satisfied)` | Take your connector's report (`{ stage, map, live, cap }`) and return the `previous` for the next call. Only `cap` changes what is asked next. |
| `createVeduta()` | A small stateful wrapper that keeps `previous` between calls. |

## Cost

Per call, measured in Node 22: about 0.6 µs for `single`, about 15 to 16 µs for `multi` with a map and
for `pip`, **the same at 120 and at 100,000 units**. Nothing in the core loops over the list.

## Tests

`core.test.ts` states each property once against the real core and once against a deliberately
broken variant (a failing arm) that must go red: the focused unit is always on the stage; the mounted
count is bounded independent of the list size; `multi` equals the Playground's `visibleRange` and
`windowRange` (imported, not restated); `single` is exactly one unit; `pip` leaves the stage alone;
jitter inside the band changes nothing; ranking is monotone per window; the live total never exceeds
the budget, priced per connector; a connector that reports its capacity converges and is never
over-asked; an unreported shortfall never lowers what is asked; the stage cap is never below one; cost
does not grow with the list; and the functions rebuild from `toString()`. Raise the run count with
`VEDUTA_RUNS=3000` and change the seed with `VEDUTA_SEED`.

## Boundaries

The core imports nothing outside this folder (`checkVedutaBoundary` in `tools/check-ownership.js`).
`npm run veduta-lib:build` builds the package; `npm run check:veduta` (in `docs/`) typechecks it on its
own. Lattice's connectors live outside this folder: the Playground's filmstrip (`docs/src/playground/deck-render.js`, the `multi` policy), the slide map rail (`docs/src/components/map-rail/MapRail.tsx`, the map window over live, wireframe and spacer tiles), and the Studio's frame pool (`docs/src/components/studio/preview-pool.tsx`), which reports its capacity (`onSettle`) so the rail can pass it to `settle` as `cap.live`. The rail also has a poster tile (`poster`, `posterBudget`) over a content-addressed cache with pinned windows (`map-rail/poster-cache.ts`). The Studio map fills it: the pool captures a tile once its live picture has rendered and the rail has been still for 300 ms (`PooledThumbFace`'s `onPicture`; the capture itself is a lazy chunk, `studio/pool-capture.ts`, so the other pool hosts do not load it), and a poster also sits under a live tile, so a fast scroll shows the last picture while a frame is re-pointed. The Playground's rail captures none, so its poster rung stays at 0. No shipped host lowers that capacity yet, so both rails learn the pool's ceiling of 28. In the Studio the rail also prices the focused preview as the stage (`stage: { cost: 1 }`); it adds the same cost to the cap, so the price does not take a tile from the map. Where the map sits beside the Studio's slide it is the slide navigator (its tiles carry the number, the Live dots and, outside the Read stop, the component class), and the pill navigator hides; where it stacks under the slide, the pills stay.

## Why the Studio's stage is one frame

The Studio asks for `pip` with a `paged` stage: one preview frame, re-pointed as the focus moves. It does not mount a neighbor ahead (a `multi` stage), and that is the whole stage story, for three reasons:

- **A neighbor ahead buys little.** The frame renders one slide with the deck as context, so a step takes the patch path in a frame that is already loaded (`single-slide-render.ts`: the `.lattice` body is swapped, about 2 ms against 485 ms for a full write, and a slide seen before comes from its slice cache). A second frame would save that one patch. No step latency has been measured that says the reader waits on it.
- **It costs a resident document.** A neighbor frame would be kept and re-pointed, as the pool's are, so it is one more live engine document for as long as the Studio is open: about 11 MB on WebKit (`preview-pool.tsx`). Under the rail's arithmetic today it takes no tile from the map, because the stage's cost is added to the cap as well as charged to it; it costs memory, not tiles.
- **With the map open, the neighbors are already live tiles**, so the reader sees what is next without the stage mounting it. The map is off by default, so this reason only holds once a reader opens it.

So `stageUnits` is always the focus. The stage's price (`stage: { cost }`) is charged and then added back to the cap, so in production it binds nothing: it is core API with no caller that proves it, and must be proven or removed before the package is published. A host whose stage is `scrolled` (the Playground's filmstrip) is the `multi` caller, and it is in production.
