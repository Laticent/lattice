# Mosaico

**Pack boxes into a container: every photo keeps its exact shape, the gutters come out exact, and
the same input gives the same layout, byte for byte.**

Mosaico takes a list of items and a container and returns one rectangle per item. This version
ships three strategies: `rows` (below), `tree` and `template`.

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

## Measuring in a browser

Mosaico takes shapes, never pixels from the DOM. The host side of reading them lives in
[`lib/core/measure-kit.js`](https://github.com/Laticent/lattice/blob/main/lib/core/measure-kit.js):
`aspectOfImage` (a loaded or loading `<img>`), `remember` (one shape per URL, kept for the life of
the document), and `run`, which holds a list as `measuring` until every shape is known or a 4 s cap
passes, then calls your `finish` once. A list packs once and never again as a late item arrives.
`doc.__latticeMeasure.idle(ms)` and `.settle()` let a caller outside the page, such as an export,
wait for the lists. Design note §8.5.

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

**Under `fit: 'fill'`** the frame closes the margin the way a CSS grid of `fr` tracks would: the
tracks along the short axis grow by one factor, up to 1 + `stretch`, and the gutters keep their size.
A placed box is then the visible part of its item, and the item overflows it by at most `stretch`:
crop it, e.g. with `object-fit: cover`. `empty`, `crop` and `score` are the search's figures, read at
the layout's natural height; `frame` is what is drawn.

A layout whose gutters are nearly as wide as the box is the one exception to exact gutters: when a
box would get no room at the drawn height, `placed` scales the layout down whole instead.

## Template: you give the arrangement, items give their size rules

`template` does no search. You name the arrangement, in the string a `tree` result reports
(`V(0,H(1,2))` is item 0 beside items 1 over 2; a join may take more children, `V(0,1,2)`), and mosaico
sizes it. Items are size rules, not just shapes:

```ts
// A 16:9 image beside a text pane, in a 1280 x 720 slide, 20 apart.
const r = pack(
  [
    { aspect: 16 / 9, fit: 'contain', weight: 3 }, // the image: any cell shape, the picture sits inside it
    { minWidth: 400 },                             // the text pane: at least 400 wide
  ],
  { width: 1280, height: 720 },
  { strategy: 'template', template: 'V(0,1)', gap: 20 },
);
r.placed; // the two cells, tiling the container: the pane 400 wide, the image's cell 860 wide, both 720 tall
r.fitted; // the visible rectangles: the pane's cell, and the largest 16:9 inside the image's cell
```

An item takes `aspect` (a number, or `[min, max]`), `minWidth`, `maxWidth`, `minHeight`, `maxHeight`
(in the container's units), `weight`, and `fit`.

- **Shape.** With `fit: 'exact'` (the default) an item fills its cell, so a fixed `aspect` makes the cell
  that shape and the layout can only be one size per height. With `fit: 'contain'` the cell may be any shape
  and `fitted` holds the largest rectangle of the item's shape inside it, centered. Use `contain` for a
  picture beside text.
- **Sharing.** Each join hands its width (or height) to its children the way CSS flex does: in proportion to
  `weight` (default 1), except that a child stops at the edge of the sizes it allows at the shared height (or
  width), and the rest share what it leaves. A child that is itself a join counts as one child, so
  `V(0,H(1,2))` is two equal columns whatever items 1 and 2 weigh.
- **Floors.** An item with no stated `minWidth` or `minHeight` gets 2% of the container's short side
  (`DEFAULT_MIN_ITEM`), so a flexible pane is never squeezed to nothing. State `0` to opt out.
- **Fit.** When the container is exactly a size the layout allows, it is filled. When it is not, the layout is
  the largest size that fits inside, placed by `align`, and `empty` says how much is left. A container below the
  floors, or a layout that would leave an item no visible size, returns `{ ok: false, reason: 'does-not-fit' }`;
  items whose own limits conflict return `'no-valid-layout'`; more than `MAX_TEMPLATE_ITEMS` (64) items return
  `'too-many'`. Bad input (a template that does not name each item once, an aspect that is not positive) throws a
  `RangeError`.
- **Width only.** With a `width` and no height, the height is an output: the shortest the layout can stand at
  that width, which the floors keep above zero.
- **Units.** "No upper bound" is a size larger than the container, in whatever units it uses.

Under the hood every item and every join is a convex region of the (width, height) plane, and a join is the sum
of two regions. `leafRegion`, `joinSideBySide`, `joinStacked`, `regionContains`, `sliceAtH`, `sliceAtW` and
`isConvex` are exported for a host that wants to ask whether a layout fits before it packs. **They are
experimental and may change before 1.0.** A text pane whose height depends on its width is not a convex region
and is not supported yet. `tree` and `rows` read a range `aspect` as its geometric mean.

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
| `lastRow` | `align` | `rows`: how the last row sits; `'start'` when `align` is `'justify'`, so a one-row wall needs `lastRow: 'justify'` to spread |

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
would leave a grid track of zero size, or, wider than the box, no height once its gutters span the
box's width. A `tree` container without a positive finite `aspect` (or `width` and `height`) is a caller
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
