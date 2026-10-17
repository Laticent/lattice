---
kind: library
name: Mosaico
order: 10
promise: Every box keeps its shape, and every gutter comes out exact.
intro: Give Mosaico a list of boxes of any shape and a container, and it returns one rectangle per box. Every box keeps its own shape, the gutters come out exact, and the same input always gives the same layout. It is plain math with no DOM, so it fits anything that draws rectangles.
group: Drawing and parsing
inLattice: Lays out every collage, and sizes the marks on every logo wall.
mark: /mosaico-mark.svg
useWhen: You need to fit boxes of different shapes into one container, without cropping them, stretching them or letting the wide ones dominate.
facts:
  - { k: Package, v: '@laticent/mosaico' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: 'The browser, Node and workers' }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/mosaico/README.md
    note: Both strategies, every option, and the speed numbers.
  - label: The tree search
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/mosaico/tree.ts
    note: Every guillotine arrangement of up to six boxes, with the gutters solved inside the tree.
  - label: The rows strategy
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/mosaico/rows.ts
    note: Equal area under a height cap, balanced rows by dynamic programming.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-16-mosaico-layout-library.md
    note: The model, the measurements, and what the checker caught on the way.
---

## The problem

You have a handful of boxes, each with its own shape (photos, video stills, logos, cards, charts),
and one container to fit them in. The easy answers each give something up:

- **A grid of equal cells** crops every box to the cell, or leaves bands of empty space around it.
- **Justified rows** keep each box's shape, but only in rows, and the container's height comes out
  wherever it lands.
- **Equal cells for marks of different shapes** look fair and are not: a wide box fills its cell's
  width, a tall one only its height, so the wide one gets several times the area.

## The idea

Mosaico treats layout as a search over arrangements, and makes the arrangement exact.

- **`tree`** tries every guillotine layout of up to six boxes, where each cut runs all the way
  across the region it divides. Every node of the tree stores its width as a straight line in its
  height, so a tile that spans several grid tracks keeps its exact shape and the gutters need no
  rounding. It keeps the arrangement that leaves the least empty space and crop.
- **`rows`** breaks a list of any length into balanced, centered rows and gives every item the
  **same area**, unless that would make it taller than a cap. A wordmark, a badge and a crest then
  carry the same weight.

Both are pure functions: numbers in, rectangles out, no DOM, deterministic to the byte.

## How to use it

```ts
import { pack, toGrid } from '@laticent/mosaico';

// A collage: three photos (width / height) in a 16:9 box, with a small gutter.
const collage = pack([1.5, 0.67, 1], { aspect: 16 / 9 }, { gap: 0.012 });
if (collage.ok) {
  const { cols, rows, areas } = toGrid(collage); // CSS grid tracks in fr, one area per photo
}

// A logo wall: four marks at equal area, at most four a row.
const wall = pack([4, 1, 0.5, 3], {}, {
  strategy: 'rows', gap: 0.05, heightCap: 0.12, maxPerRow: 4,
});
// wall.rects: each mark's box, as fractions of the container's width
```

The grid adapter emits `fr` tracks, so the browser fits the result to whatever box it has. Mosaico
needs only the container's shape.

## Where else it fits

- A photo gallery, a product grid or a dashboard whose tiles arrive in any shape.
- A sponsor or partner page, a "trusted by" strip, a wall of crests or app icons.
- Print layouts, canvas and SVG composition, PowerPoint shapes: the rectangles are plain numbers,
  and the CSS grid output is only one adapter.

## How Lattice uses it

Every `collage` slide packs its photos with `tree`. The move into Mosaico made the search about six
times faster (six photos: 58 ms down to 9 ms) without changing one byte of any layout, which a
golden file of 4,128 cases checks. Every `logo-wall` slide sizes its marks with `rows`: beside a 1:2 crest,
the wordmarks come down to a square badge's area, so the crest, held to the row's height, gets half of
theirs rather than about a quarter. The CLI and the live preview call the same
functions, so both draw the same layout.

## What it doesn't do

- **No more than six boxes in `tree`.** The search grows about eight times per box; past six,
  use `rows`.
- **Not ink.** Equal area is measured on each box, not on what is drawn inside it. A logo with
  empty margin in its file looks smaller than its neighbors; crop the file to the logo.
- **Not yet: boxes with a range of shapes,** panes that grow, or layouts you draw yourself and
  only want sized. Those are the next strategies in the design note.
