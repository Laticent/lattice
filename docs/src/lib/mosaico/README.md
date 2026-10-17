# Mosaico

**Pack boxes into a container: every photo keeps its exact shape, the gutters come out exact, and
the same input gives the same layout, byte for byte.**

Mosaico takes a list of items and a container and returns one rectangle per item. This version
ships two strategies: `rows` (below) and `tree`.

The `tree` strategy tries every guillotine layout of up to six fixed-shape items (a layout
where every cut runs all the way across the region it divides) and keeps the one that leaves
the least empty space and crop, with a penalty on any tile under 0.4 of the largest one's area
(`weights` tunes both). Each tree node stores its width as a line in its height,
so a tile that spans several grid tracks keeps its exact aspect and the gutters need no rounding.
The method is BRIC, Blocked Recursive Image Composition (C. Brian Atkins, ACM Multimedia 2008).

It has **no dependencies** and touches no DOM, file system or clock, so it runs the same on a
server, in a browser and in a worker. The design contract, including the strategies still to
come (`rows`, `template`, items with a range of shapes), is
[`engineering/decisions/2026-10-16-mosaico-layout-library.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-16-mosaico-layout-library.md).

**Status: 0.1.0, unpublished.** Lattice's `collage` and `logo-wall` both run on it now, which is
what the first npm release waited for (design note §9, decision 8); the release itself is the
owner's to trigger.

## 60-second start

```ts
import { pack, toGrid } from '@laticent/mosaico';

// Three photos (width / height), a 16:9 box, a gutter of 1.2% of the box height.
const result = pack([1.5, 0.67, 1], { aspect: 16 / 9 }, { gap: 0.012 });
if (result.ok) {
  result.rects;       // [{ x, y, w, h }, …] per photo, in written order; the layout is 1 tall
  result.aspect;      // the layout's natural width / height
  result.empty;       // share of the box the layout leaves empty (a matte)
  result.arrangement; // 'V(0,H(1,2))': photo 0 beside photo 1 stacked over photo 2

  const { cols, rows, areas } = toGrid(result);
  // grid-template-columns: cols.map((c) => `minmax(0, ${c * 1000}fr)`).join(' '), rows likewise
  //   (scaled: the tracks sum to 1 minus the gutters, and fr factors under 1 leave space empty)
  // photo i: grid-area: areas[i].join(' / ')   (rowStart / colStart / rowEnd / colEnd)
}
```

The grid adapter emits `fr` tracks, so the browser fits the grid to whatever box it gets. Mosaico
needs only the container's shape, not its size. To draw boxes yourself (canvas, SVG, absolute
positioning), read `result.placed` instead: see the next section.

## Spacing, padding and units

```ts
// The same three photos in a 1280 × 720 box, in pixels: 24 px of padding, 12 px across, 20 px down.
const r = pack([1.5, 0.67, 1], { width: 1280, height: 720 }, {
  padding: 24,           // or { top, right, bottom, left }
  columnGap: 12,         // between boxes side by side
  rowGap: 20,            // between boxes stacked (gap sets both)
  align: 'start',        // where the layout sits in the space it leaves: start | center | end
});
r.frame;   // { x, y, w, h }: where the layout sits in the container, in pixels
r.placed;  // [{ x, y, w, h }, …]: each box in pixels, ready to draw
```

**The unit rule.** Give the container a size (`width` and `height` for `tree`, `width` for `rows`)
and every length option is read in that unit: `gap`, `columnGap`, `rowGap`, `padding`, and for
`rows` `heightCap`, `minHeightCap`, `maxHeight`, `minCell` and `area` (squared). Without a size,
lengths are fractions, as before: of the container's height for `tree` (the container is `aspect`
wide and 1 tall), of its width for `rows` (the container is 1 wide). Units are only a scale: the same
box in fractions or in pixels gives the same layout.

**Two kinds of rectangle.** `placed` and `frame` are in the container's units, padding and
alignment applied: draw these. `rects` (and `rows`' `cells`) are in layout units, the layout 1 tall
for `tree` and 1 wide for `rows`, inside the padding: `toGrid` reads them. `result.columnGap` and
`result.rowGap` are the gaps in those layout units.

**Exact gutters at any size.** When a `tree` layout is wider than its box, `placed` shrinks it to the
width by solving the tree's width line for its height, so each gutter keeps its size rather than
shrinking with the boxes.

**Under `fit: 'fill'`** the frame stretches to close the margin, by up to `stretch`. A placed box is
then the visible part of its item, and the item overflows it by at most that much: crop it, e.g.
with `object-fit: cover`.

## Rows: equal visual weight

The `rows` strategy breaks an ordered list into centered rows and gives every item the same area,
unless that would stand it taller than a cap. It is the logo wall's layout. The container is 1 wide
and grows downward, so pass `{}` and read every length as a fraction of its width.

```ts
const wall = pack([4, 1, 0.5, 3], {}, {
  strategy: 'rows',      // goal 'equal-weight' is its default and only goal
  gap: 0.0556,           // between cells, and between rows unless rowGap is set
  // align: 'justify',   // spread each row across the width; the last row starts at the left
  heightCap: 0.127,      // the tallest an item may be
  minHeightCap: 0.09,    // how far the cap may fall before every area shrinks
  // area: 0.0081,       // the area to start from, when the host already knows it
  maxPerRow: 4,
  maxRows: 1,
  maxHeight: 0.34,       // rows and row gaps together
  minCell: 0.208,        // the narrowest cell: keeps a column rhythm
});
wall.rows;   // [[0, 1, 2, 3]]
wall.rects;  // each item's box, centered in its cell, each row placed by align (centered by default)
wall.cells;  // each item's cell, as tall as its row
wall.placed; // the boxes in the container's units, padding applied
```

The area is the largest at which an item of aspect max(narrowest, `aspectFloor`, default 0.5) is
exactly `heightCap` tall, and never more than a square at the cap; a host that knows the size it
wants passes `area` instead (the logo wall passes the size its marks had before). An item narrower than
`aspectFloor` stands at the cap and gets less area, so one 1:5 crest cannot shrink every item. When
the rows exceed `maxRows` or `maxHeight`, the cap falls toward `minHeightCap` first, then every
area shrinks. Breaks come from dynamic programming over break points: the fewest rows, then the
most even ones. Forty items pack in under a millisecond.

`rows` refuses with `'too-wide'` when even the smallest items cannot fit the limits.

## Options

Options for both strategies:

| Option | Default | Meaning |
|---|---|---|
| `gap` | `0` | gutter between items, across and down |
| `columnGap` | `gap` | gutter between items side by side |
| `rowGap` | `gap` | gutter between items stacked, or between rows |
| `padding` | `0` | space inside the container's edges: one length, or `{ top, right, bottom, left }` |
| `align` | `'center'` | where the layout sits in the space it leaves: `'start'`, `'center'`, `'end'`; `rows` also takes `'justify'`, which spreads each row's leftover width into its gaps |
| `lastRow` | `align` | `rows`: how the last row sits; `'start'` when `align` is `'justify'` |

Lengths follow the unit rule above. Options for `tree`:

| Option | Default | Meaning |
|---|---|---|
| `order` | `'free'` | `'free'` may reorder items; `'ordered'` keeps them in written order, read left to right, top to bottom |
| `fit` | `'tight'` | `'tight'` never crops; `'fill'` may stretch the layout by up to `stretch` to close empty space, and the stretch is reported as `crop` |
| `stretch` | `0.08` | the most a `'fill'` layout may stretch |
| `hero` | `-1` | index of an item that must hold the largest tile |
| `weights` | `DEFAULT_TREE_WEIGHTS` | `{ empty, smallTile, smallTileFloor, hero }`: the score is `empty·empty + crop + smallTile·max(0, smallTileFloor − smallest/largest area) + hero` (when the hero is not largest) |

An item is a number or `{ aspect }`. An aspect that is missing, not finite, or outside (0.05, 20)
is read as 1:1, the stand-in for an item whose shape is not known yet.

`pack` refuses with `{ ok: false, reason }` instead of throwing: `'empty'` for no items,
`'too-many'` for more than `MAX_TREE_ITEMS` (6), and `'no-valid-layout'` when every arrangement
would leave a grid track of zero size. A `tree` container without a positive finite `aspect` (or `width` and `height`) is a caller
error and throws a `RangeError`, and so does padding that leaves no room, or an `align` the strategy
does not take (`tree` has nothing to justify).

## Speed

The search is exhaustive, and each item multiplies the work by about eight. Measured with
`node` 22 on the repo's 4-core cloud sandbox, median of 40 runs after 10 warm-ups, items
`[1.5, 0.67, 1, 1.78, 0.75, 2]` cut to n, gap 0.012:

| Items | Free order | Ordered |
|---|---|---|
| 4 | 0.2 ms | 0.04 ms |
| 5 | 0.7 ms | 0.15 ms |
| 6 | 9 ms (p95 14 ms) | 0.5 ms |

The budget is one re-pack inside one 60 Hz frame (16 ms) for six items, so a host can re-lay out
as image sizes arrive. Three things make it fit, none of which changes a result:

- **Mirrors only where they can matter.** `B beside A` has the same outline as `A beside B` and the
  same tile areas up to the last bits, so its dedupe key repeats the original's, except when a key
  term sits on a rounding boundary. The search builds a mirror only there.
- **No allocation for a duplicate.** Keys are packed integers, and a node is allocated only when kept.
- **Bounds before work.** Empty space and crop are known from the outline alone, and they bound
  the score from below; an arrangement that already loses on that bound is never laid out.

`result.work` reports how many arrangements the search kept and how many it scored, and Lattice's
benchmark (`npm run bench`, the collage pack tier) gates on those counts.

## Build

```sh
npm run mosaico-lib:build   # dist/index.{mjs,cjs} + dist/*.d.ts
npm run mosaico-lib:check   # fails if dist/ is stale
npm run test:mosaico        # the unit tests
```

## License

AGPL-3.0-only.
