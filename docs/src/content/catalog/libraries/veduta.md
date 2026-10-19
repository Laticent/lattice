---
kind: library
name: Veduta
order: 11
promise: A long list stays fast, because only what the reader can see exists.
intro: A slide deck, a photo set and a transcript are long lists that a reader sees a few units of at a time. Mounting all of them is slow and uses memory. Veduta decides which units each view should mount, at what quality and in what order, and you do the mounting. It has no DOM and no framework, and it costs the same at 120 units as at 100,000.
group: Showing and reading
inLattice: Decides which slides the Studio's preview and its map beside it keep alive.
mark: /veduta-mark.svg
useWhen: You show a long list through one or two views, such as a stage and a strip of thumbnails, and each view mounts more than it needs.
facts:
  - { k: Package, v: '@laticent/veduta' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: The browser and Node }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/veduta/README.md
    note: The model, the rules, every call and the cost.
  - label: The core
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/veduta/core.ts
    note: Both calls, one file, no dependencies.
  - label: The test suite
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/veduta/core.test.ts
    note: Every property, each checked against a deliberately broken version that must fail.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-16-preview-as-library-audit.md
    note: The audit, the measurements, the reviews that corrected it, and what failed along the way.
---

## The problem

You have a long list, such as 500 slides, and a big view of the one you are on, with a strip of small tiles beside it. The reader sees a handful of units. The usual code mounts all of them, or it hand-rolls a virtual list for one view and a pool for the other, and the two disagree.

- **Memory.** On Safari, a view you create and then destroy is never given back, so churning previews climbs until the tab reloads. A tile that is cheap to draw can still be expensive to keep.
- **Two lists that disagree.** The big view loads slide 40, the strip shows slide 38 as current, and a keypress moves one of them.
- **Jitter.** Scrolling a few pixels mounts and unmounts a slide each frame.
- **Nothing to show yet.** A tile far from the reader is blank until it loads, then pops in.

## The idea

- **Windows.** The stage and the map are two windows over the same list. Each has its own viewport, so a map scrolled far from the focus still loads the tiles you are looking at first.
- **Policies.** `single` mounts one unit. `multi` mounts the units near the viewport. `pip` is `single` plus a map.
- **A ladder of quality.** Every unit is asked for at one rung: `live`, `poster` (a cached picture), `wireframe` (a cheap sketch) or `placeholder`. When the live budget runs out, a unit falls one rung instead of failing.
- **Advice, not orders.** Veduta returns what to mount and in what order. Your connector says what it really holds, and only a reported capacity changes the next answer.
- **One budget.** Live views are counted across the whole page and priced per connector, because a frame in a pool costs more than a section in a list.

## How to use it

Install it:

```sh
npm install @laticent/veduta
```

> Veduta publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/veduta`.

```ts
import { createVeduta } from '@laticent/veduta';

const veduta = createVeduta();
const intent = veduta.windowFor({
  policy: 'pip',
  stage: 'paged',
  count: 5000,
  focus: 120,
  viewports: { map: { y: scrollTop, h: viewHeight, top: 0, pitch: 60, cols: 1 } },
  budget: { live: 4, stageTier: 'live', mapTile: 'wireframe' },
});

intent.stageUnits;   // [120]
intent.mapUnits;     // the tiles in and just around the map's own view
veduta.settle({ stage: intent.stageUnits, map: intent.mapUnits, cap: { map: 24 } });
```

| Call | What it does |
| --- | --- |
| `windowFor(args)` | The ranked intent for these viewports and this focus |
| `settle(intent, satisfied)` | Take what your connector really holds; only `cap` changes the next answer |
| `createVeduta()` | Keeps `previous` between calls |

Veduta guarantees these, and its tests check each one against a deliberately broken version that must fail:

| Guarantee | How |
| --- | --- |
| The focused unit is always mounted | It is a seed for the stage, even if the connector reports no room |
| The mounted count does not grow with the list | Checked from 10 to 100,000 units |
| Jitter changes nothing | The mount, keep and need band, as in the Playground's filmstrip |
| The live total stays inside one budget | Shared by stage and map, priced per connector |
| A connector is never over-asked | Capacity is reported, never guessed from a shortfall |

## Where else it fits

- **Photo sets and contact sheets**: a big photo and a strip of thumbnails, with the strip carrying thousands of units.
- **Document and PDF viewers**: pages as units, a page navigator beside the reader.
- **Test and trace viewers**: a screenshot per step with a filmstrip.
- **Storyboards, comics and design reviews**: boards as units.
- **Slide sorters** in any deck tool.
- **A transcript and its timeline**: cues as units, a segment bar as the map.

## How Lattice uses it

Lattice is building its Studio's picture-in-picture preview on it: the focused slide on the stage, and a strip of tiles beside it, driven by one focus (Fuoco). The Playground's filmstrip already uses the same band rule, and a test checks that Veduta's window equals the filmstrip's. Until the Studio's preview ships, this page is the live demo.

## What it doesn't do

- **It doesn't draw anything.** It returns which units to mount, never how. A unit can be a frame, an element or an image.
- **It doesn't hold the focus.** Focus comes from you (Lattice uses Fuoco). Veduta never remembers where the reader is.
- **It assumes units of one size.** The arithmetic is a fixed pitch. Units of different heights need measured sizes, which v1 does not do.
- **It doesn't make posters.** The `poster` rung is a slot for your cached pictures; capturing and caching them is your connector's job.
