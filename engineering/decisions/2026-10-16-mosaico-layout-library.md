---
status: proposed
summary: Design for mosaico, a general box-packing library grown out of the collage packer. Each item is a size rule (fixed shape, a shape range, one-axis stretch, a flexible pane, or not-yet-measured), the container may be fully known, width-only, shape-only or not laid out, and three strategies (tree, rows, template) serve three goals (fill, equal visual weight, equal size). Proves the exact-gutter math still holds when items have ranges instead of one shape, measures today's packer (92-113 ms at six photos, half of it in one function), maps six Lattice surfaces onto it, and lists the owner decisions still open.
---

# mosaico: a box-packing library grown from the collage packer (2026-10-16)

**Status: proposed.** The owner settled four forks on 2026-10-16 (§9). Nothing is built. Slice 1 (§8) is
the first code.

## 1. The answer first

`lib/core/collage-pack.js` becomes the first strategy of a library, **mosaico** (`@laticent/mosaico`), that
packs any set of boxes into a container. "Any" means three things the collage never needed:

1. **An item is a size rule, not an aspect ratio.** A photo has one shape. An SVG may stretch on one axis, a
   component pane takes any size above a floor, and a remote image has no known shape until it loads.
2. **The container may be unknown.** It may be fully sized, sized on one axis (a web page whose height grows),
   known only by its shape, or a `<div>` that is not laid out yet.
3. **The search depends on the job.** A collage searches every arrangement. A logo wall breaks a list into
   rows. A pane layout or a mosaic takes an arrangement the author picked and only computes the sizes.

The library stays pure and synchronous: numbers in, rectangles out, with no DOM, no fs and no dependencies.
Measuring (image headers, `naturalWidth`, `ResizeObserver`) lives in separate adapters, so the core runs the
same on the CLI, in the browser and in a worker (HARD RULE #1).

Speed is a claim to earn with a benchmark, not one to state up front. Today's packer takes about 100 ms at six
photos (§3), and most of mosaico's speed comes from choosing the cheap strategy for the job, not from a faster
exhaustive search.

## 2. What exists, and what is not new

**Ours.** `packCollage` (`lib/core/collage-pack.js:215`) enumerates every guillotine layout of up to six
photos. A guillotine layout is one where each cut runs all the way across the region it divides, so the layout
is a binary tree of side-by-side and stacked joins. Each tree node stores its width at height `h` as the line
`p·h + q` (`leaf`, `joinV`, `joinH` at `:83-91`), so gutters are exact and a photo spanning several grid tracks
keeps its exact aspect. The output is CSS grid tracks in `fr` units plus one grid area per photo, so the
browser does the final fit and the packer needs only the container's shape. It is deterministic, supports a
fixed order, a hero, a `fill` stretch, a full-bleed weighting and a check that rejects zero-size tracks.
Only `collage.transform.js:35` imports it, and it requires nothing.

**Prior art.** The tree and its aspect arithmetic are BRIC, Blocked Recursive Image Composition (C. Brian
Atkins, ACM Multimedia 2008), used by tools such as `imgwrench`. On npm, `diorama` searches the same kind of
tree with a heuristic in a Web Worker, and Flickr's `justified-layout` packs fixed-aspect photos into justified
rows. Rectangle packing and floorplanning in general are NP-hard. This exact problem has no hardness proof we
know of, so this note does not call it NP-complete.

**What would be new** is the combination: exact search where it is affordable, exact gutters, size rules
beyond a single aspect, CSS grid output, determinism, and one model across tree, rows and template layouts.

## 3. Measured today

Timings from `node` on this sandbox, mean of five runs after a warm-up call, aspects
`[1.5, 0.67, 1, 1.78, 0.75, 2]` cut to n:

| Photos | Free order | Ordered |
|---|---|---|
| 4 | 1.4 ms | 0.2 ms |
| 5 | 13.8 ms | 1.6 ms |
| 6 | 113 ms | 5.0 ms |

Each photo multiplies the free-order cost by about 8, so seven photos would take about a second. That growth is
why `MAX_PHOTOS` is 6 (`:33`).

**Where the time goes.** Deleting the `signature(...)` term from the dedupe key (`:145`) cuts six free-order
photos from 92 ms to 47 ms. (The deletion changes which layouts survive, so it is a cost probe, not a fix.)
`signature` runs a full `layout` of every candidate node to compute its tile-balance key (`:113-124`). Most of
the remaining time is string keys (`key2`, `canon`) and short-lived objects. All of this is fixable, but a
large speedup is a hypothesis until slice 1 measures it.

**Ordered mode already does less work than it pays for.** It only ever splits off a prefix of the written
order (`:141`), so every reachable subset is a contiguous run. It still loops over all `2^n` subset masks.
Interval dynamic programming over the `n(n+1)/2` runs gives the same answers.

## 4. The model

### 4.1 Items are size rules

**Status:** proposed; the closure argument below is a sketch that slice 2 owes as a property test.

| Item | Size rule in the (width, height) plane | Example |
|---|---|---|
| Fixed shape | a ray from the origin: `w = a·h` | photo, video, SVG with a `viewBox` and the default `preserveAspectRatio` |
| Shape range | a wedge: `a₁·h ≤ w ≤ a₂·h` | a logo allowed a little stretch, a chart with a preferred shape |
| One-axis stretch | a band: `h` fixed (relative), `w ≥ w_min` | SVG with `preserveAspectRatio="none"` at a set height |
| Flexible | a quadrant above a floor: `w ≥ w_min`, `h ≥ h_min` | a component pane |
| Not measured yet | a stand-in rule (§4.5) until it resolves | a remote image, an image with no size metadata |
| Height depends on width | a curve | a text pane, a `team-profile` card. **v2, not v1** (§9) |

Every rule except the last is a **convex region**: the segment between any two allowed sizes is also allowed.

**Joins keep convexity.** A side-by-side join of regions A and B is
`{(w₁ + w₂ + g, h) : (w₁, h) ∈ A, (w₂, h) ∈ B}`, with `g` the gutter. That is a linear image of the
intersection of two convex sets, so it is convex. A stacked join is the same with the axes swapped. So every
node of a tree, however mixed its leaves, is a convex region, and the container fits exactly when its own size
lies inside the root's region.

The fixed-shape case collapses to today's math. A ray joined to a ray is a line `w = p·h + q`. That is why
`collage-pack.js` can store two numbers per node, and it stays the fast path. A wedge joined to a wedge is a
wedge with offsets: lower and upper lines, four numbers. Floors add corners, so the general region is a
polygon whose corner count grows with the joins. That is fine at the sizes in §6, and slice 2 measures it.

**The curve case breaks this.** A text pane's height falls as its width grows, and the allowed sizes are a
curve, not a convex region. The workable answer is to sample it at a few widths and treat each segment as a
line, which is why it waits for v2.

**Freedom means a sizing step.** With only fixed shapes a tree has one size per container. With ranges it has
many, and the goal (§4.3) picks one. For a series-parallel tree with linear bounds and a linear or convex
quadratic goal, that is a small convex program solved bottom-up. Slice 2 owes the solver and its worst case.

**Absolute sizes break scale-freedom.** Today everything is in units of the stage height, so the layout depends
only on the container's shape. A floor in pixels (a pane at least 240 px wide, a logo at least 24 px tall)
makes the answer depend on the real size. Items may carry absolute floors only when the container size is
known. Otherwise the floors are read as fractions and the result says so.

### 4.2 The container

| Container | What mosaico does |
|---|---|
| Width and height known | fit exactly, report empty space and crop |
| Shape known, size not | today's mode: steer by shape, emit `fr` tracks, the CSS grid fits the real box |
| Width known, height grows | rows strategy, or a tree scored on width only; the height is an output |
| Height known, width grows | the same on the other axis |
| Nothing known (a `<div>` not laid out) | use the layout's natural shape; the live adapter re-runs when `ResizeObserver` reports a size |

### 4.3 Goals

| Goal | Meaning | First user |
|---|---|---|
| `fill` | least empty space and crop, with a penalty on very small tiles | `collage` (today's score, `:248-250`) |
| `equal-weight` | every item at about the same visual weight, not the same box | `logo-wall` |
| `equal-size` | every item at the same size | `team-profile` |
| custom | per-item weights | hosts |

Hero (one item must hold the largest tile) and fixed order are constraints on any goal, not goals of their
own. **`equal-weight` needs a definition**, and §9 leaves it open. The common one in logo walls is equal area
with a height cap; optical density is out of scope.

### 4.4 Strategies

| Strategy | Search | Cost | Exact? |
|---|---|---|---|
| `template` | none: the caller gives the arrangement, mosaico computes sizes | linear in items (fixed shapes), one small convex program (ranges) | yes |
| `rows` | where to break an ordered list into rows: dynamic programming over break points | about n² (n × max-per-row with a cap) | yes, for the goal |
| `tree` | every guillotine arrangement (today's search) | grows about 8× per item | yes up to about 6 items; a bounded heuristic above |
| `grid` | uniform cells; choose columns × rows | trivial | yes |

`rows` comes in two kinds. **Justified** rows share one height and fill the width, as in `justified-layout`.
**Ragged** rows take item sizes from the goal and center each row, which is what a logo wall or a team roster
wants.

**The pinwheel.** Four panes spiraling around a center one is the smallest layout no guillotine tree can
produce, and it has exactly five panes. CSS grid draws it as a 3 × 3 grid. v1 ships no pinwheel (§9), but the
output (§4.6) is plain rectangles, so a pinwheel template can arrive later with no API change.

### 4.5 Items that are not measured yet

The core never waits. An unmeasured item enters with a stand-in rule: the host's prior if it gave one (a
`3:2` hint, an oEmbed thumbnail's shape), otherwise a wedge around 1:1. The adapters resolve it:

- **Bytes:** `lib/core/image-dimensions.js` reads PNG, JPEG, GIF, WebP and SVG headers. A remote image's size
  is usually in its first few kilobytes, so a range request could size it before the download ends. That is an
  untested claim here, and JPEG files with large EXIF blocks put the size later.
- **Browser:** `naturalWidth` / `naturalHeight` once the image loads; `viewBox` plus `preserveAspectRatio`
  for SVG.
- **Container:** `ResizeObserver`.

When a late item lands, a visible jump is the failure to avoid (`engineering/jank.md`). The live adapter keeps
the arrangement it chose and only re-runs the sizing step, which is cheap. It searches again only if the fit
gets worse than a set threshold. The current collage instead waits up to 4 s before its one stamp
(`PENDING_CAP_MS`, `collage.transform.js:259`); whether a host waits or shows a provisional layout is the
host's choice, and the adapter supports both.

### 4.6 Output

One neutral result: a rectangle per item in container units, plus the empty space, crop and score, plus the
arrangement as data. Two adapters turn it into markup:

- **CSS grid:** tracks and one grid area per item, as `collage` emits today. It works when the container is
  not laid out yet.
- **Absolute:** pixel rectangles, for canvas, SVG, PPTX shapes and anything else that is not CSS.

Determinism stays a property of the core: the same input gives the same output, byte for byte, so PDFs stay
reproducible.

## 5. Package and API shape

Mosaico follows the house pattern `@laticent/segno` set: a workspace package under `docs/src/lib/mosaico`,
zero dependencies, ESM and CommonJS builds, `sideEffects: false`, with `lib/core` importing it. Three entry
points:

- `@laticent/mosaico`: the pure core (`pack(items, container, options)`).
- `@laticent/mosaico/measure`: byte and SVG measuring.
- `@laticent/mosaico/dom`: the live adapter (measure, observe, re-pack with the stability rule in §4.5).

The exact signature is slice 1's to settle against real callers. This note fixes only the parts above:
items as rules, container as optional, strategy and goal as options, and output as rectangles plus adapters.

**Lattice constants stay in Lattice.** `STAGE_ASPECT` and its `beside` / `above` / `bleed` rows, `DEFAULT_GAP`
and `FILL_MAX` (each pinned to a CSS custom property in `collage.styles.css`) are collage's, not the
library's. `collage` passes them in.

## 6. Lattice surfaces

**Status:** proposed. "Today" cites the code. The logo-wall sizes are arithmetic from the CSS, not a render.

| Surface | Today | With mosaico |
|---|---|---|
| `collage` | `packCollage` | `tree` + `fill`, same output byte for byte |
| `logo-wall` | equal cells (`--logo-cols` 4 or 6) and a fixed mark height (`logo-wall.styles.css:27-31, 47-57`). From the CSS, a 4:1 wordmark gets about 3× the area of a 1:2 mark | ragged `rows` + `equal-weight`, measured from each SVG's `viewBox` (`image-aspect.js:50`) |
| `columns` / `rows` panes | the author's ratio, 25–75 in 5% steps (`lib/core/panes.js`) | `template`: a flexible pane beside a fixed-shape image or chart takes the width that ends the matte |
| future mosaic | none | `template` with named arrangements; the pinwheel later |
| `team-profile` | hand-measured column counts per composition (`team-profile.docs.md` §Agent contract) | ragged `rows` + `equal-size`, with the `lead` hero. Its card is the curve case, so **v2** |
| several images on a plain slide | the engine keeps only the last `![bg]` (`background-image.js:127-129`); #2727's D3 shows the CLI drops `![bg]` on a plain slide entirely | `tree` + `fill`, **after #2727's `image` plugin lands**: under its rule that the layout places what a plugin describes, a plain slide packs several image records. That rule is #2727's to adopt |

Surveyed and left out, because every item has one shape or the layout crops on purpose: print N-up
(`print-sheet.mjs`), the Studio slide grids, the media library, `cards-grid`, `heatmap`, `kanban`.
`word-cloud` places free shapes on a spiral, a different problem.

## 7. Options not taken

- **Keep the packer inside `collage`.** No other surface could use it, and the logo-wall defect stays.
- **Put mosaico in `lib/core`.** It works for Lattice, but a library anyone can reuse needs its own package,
  and `segno` already proves the workspace route.
- **One search for everything.** A full tree search for a 30-logo wall is unaffordable, and rows are what a logo
  wall should look like anyway.
- **Non-guillotine search in v1.** The pinwheel is the only five-pane case, and it can be a template.

## 8. Build order

Each slice ships on its own, with its own gates.

1. **Package and `tree` + `fill` for fixed shapes.** Create the workspace package and port `packCollage`,
   rewritten for speed (no string keys, no per-candidate re-layout, interval DP for ordered).
   **Byte-identical gate:** a golden file of today's output over a few hundred random 1–6 photo sets, in both
   orders, both fits, with and without hero and bleed. `collage` switches its import. Bench: add the scenario
   to `test/benchmark/engine-bench.mjs` and compare with `justified-layout` and `diorama` on the same machine
   (HARD RULE #19). Also fix two stale comments: `collage-pack.js:38` names the wrong test file, and the header
   says "4 to 6 photos" though `MIN_PHOTOS` is 1. Maker-checker (an engine kernel).
2. **Range items and `template`.** The region type, the sizing step and a property test of the join closure
   in §4.1. First user: `columns` / `rows` panes, with a demo deck (HARD RULE #9).
3. **`rows` and `equal-weight`.** First user: `logo-wall`, with a demo deck.
4. **Adapters.** `measure` and `dom`, with the stability rule, checked on the real Studio (HARD RULE #23).
5. **v2:** height-depends-on-width items, then `team-profile`.
6. **Later:** the pinwheel and named mosaic templates; several images on a plain slide after #2727.
7. **Publish to npm.** The owner's call (§9).

## 9. Decisions

**Settled (owner, 2026-10-16):**

1. **v1 items:** fixed shape, shape range, one-axis stretch, flexible, and not-measured. Height-depends-on-width
   items wait for v2.
2. **v1 strategies:** `tree`, `rows` and `template` (plus the trivial `grid`). The output is plain
   rectangles so a pinwheel template can come later.
3. **Name:** mosaico.
4. **This note first, as a docs-only PR, before any code.**

**Open:**

5. **License.** `segno` is `AGPL-3.0-only`. A library meant for anyone to reuse reaches far fewer projects
   under the AGPL than under MIT or Apache-2.0. This decides who can adopt it.
6. **`equal-weight`'s definition** for logos: equal area with a height cap (recommended, and measurable), or
   something optical.
7. **Waiting versus provisional layout** for unmeasured items on live surfaces (§4.5): keep `collage`'s wait
   with a 4 s cap, or show a provisional layout and resolve it without a jump.
8. **When to publish to npm.** After two Lattice callers have shaped the API (recommended), so the first public
   version is not the one that has to change.
