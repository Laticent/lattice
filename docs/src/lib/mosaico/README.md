# Mosaico

**Pack boxes into a container: every photo keeps its exact shape, the gutters come out exact, and
the same input gives the same layout, byte for byte.**

Mosaico takes a list of items and a container and returns one rectangle per item. This version
ships one strategy, `tree`: it tries every guillotine layout of up to six fixed-shape items (a
layout where every cut runs all the way across the region it divides) and keeps the one that
leaves the least empty space and crop. Each tree node stores its width as a line in its height,
so a tile that spans several grid tracks keeps its exact aspect and the gutters need no rounding.
The method is BRIC, Blocked Recursive Image Composition (C. Brian Atkins, ACM Multimedia 2008).

It has **no dependencies** and touches no DOM, file system or clock, so it runs the same on a
server, in a browser and in a worker. The design contract, including the strategies still to
come (`rows`, `template`, items with a range of shapes), is
[`engineering/decisions/2026-10-16-mosaico-layout-library.md`](https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-16-mosaico-layout-library.md).

**Status: 0.1.0, unpublished.** The first npm release follows once Lattice's `collage` and
`logo-wall` both run on it (design note §9, decision 8). The API below may still change before then.

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
  // grid-template-columns: cols.map((c) => `minmax(0, ${c}fr)`).join(' ')
  // photo i: grid-area: areas[i].join(' / ')   (rowStart / colStart / rowEnd / colEnd)
}
```

The grid adapter emits `fr` tracks, so the browser fits the grid to whatever box it gets. Mosaico
needs only the container's shape, not its size.

## Options

| Option | Default | Meaning |
|---|---|---|
| `order` | `'free'` | `'free'` may reorder items; `'ordered'` keeps them in written order, read left to right, top to bottom |
| `fit` | `'tight'` | `'tight'` never crops; `'fill'` may stretch the layout by up to `stretch` to close empty space, and the stretch is reported as `crop` |
| `stretch` | `0.08` | the most a `'fill'` layout may stretch |
| `gap` | `0` | gutter between items, as a fraction of the container height |
| `hero` | `-1` | index of an item that must hold the largest tile |
| `weights` | `DEFAULT_TREE_WEIGHTS` | `{ empty, smallTile, smallTileFloor, hero }`: the score is `empty·empty + crop + smallTile·max(0, smallTileFloor − smallest/largest area) + hero` (when the hero is not largest) |

An item is a number or `{ aspect }`. An aspect that is missing, not finite, or outside (0.05, 20)
is read as 1:1, the stand-in for an item whose shape is not known yet.

`pack` refuses with `{ ok: false, reason }` instead of throwing: `'empty'` for no items,
`'too-many'` for more than `MAX_TREE_ITEMS` (6), and `'no-valid-layout'` when every arrangement
would leave a grid track of zero size. A container without a positive finite `aspect` is a caller
error and throws a `RangeError`.

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
