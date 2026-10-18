---
status: in-progress
summary: Design for mosaico, a general box-packing library grown out of the collage packer. Each item is a size rule (fixed shape, a shape range, one-axis stretch, a flexible pane, or not-yet-measured), the container may be fully known, width-only, shape-only or not laid out, and three strategies (tree, rows, template) serve three goals (fill, equal visual weight, equal size). Proves the exact-gutter math still holds when items have ranges instead of one shape, measures today's packer (92-113 ms at six photos, half of it in one function), maps six Lattice surfaces onto it, and records the owner's eight decisions.
---

# mosaico: a box-packing library grown from the collage packer (2026-10-16)

**Status: in progress.** The owner settled all eight forks on 2026-10-16 (§9). Slice 1 (§8) is built:
`@laticent/mosaico` exists with `tree` + `fill` for fixed shapes, and `collage` runs on it (§8.1).
Slice 3 is built too: `rows` + `equal-weight`, and `logo-wall` runs on it (§8.2). Slice 2 (range items,
`template`, panes) is next.

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
In `lib/`, only `collage.transform.js:35` imports it (plus its two unit-test files), and it requires nothing.

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
`signature` runs a full `layout` of every candidate node to compute its tile-balance key (`:113-124`). A CPU profile of the probe copy puts most of the remaining time in checking every surviving root: one
`layout`, two `tracksFor` calls and a score per candidate (`:237-257`), plus garbage collection. The string
keys (`key2`, `canon`) cost under 5%. All of this is fixable, but a
large speedup is a hypothesis until slice 1 measures it.

**Ordered mode already does less work than it pays for.** It only ever splits off a prefix of the written
order (`:141`), so every reachable subset is a contiguous run. It still loops over all `2^n` subset masks.
Interval dynamic programming over the `n(n+1)/2` runs gives the same answers, if it visits splits in the same
order: the dedupe keeps the first node it sees (`:146-148`), so a different order can keep a different
duplicate and change a tie-break.

## 4. The model

### 4.1 Items are size rules

**Status:** built in slice 2 (§8.6). The closure argument below is checked by a property test, `test/unit/mosaico/template.test.js`.

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
`{(w₁ + w₂ + g, h) : (w₁, h) ∈ A, (w₂, h) ∈ B}`, with `g` the gutter. That is an affine image of the
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
own. **`equal-weight` is equal area with a height cap** (§9, decision 6): every item gets the same area unless
that would make it taller than the cap, and optical density is out of scope.

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

**Layout is an async process (owner, 2026-10-16, decision 7).** The live adapter lays out at once with what
it knows, then re-lays out each time an item's size or the container's size becomes known. That is the default
and the main path, not a fallback. It is affordable only if a re-pack is cheap, so speed is a requirement here,
not a nicety. Slice 1 proposes and measures a budget: one re-pack inside one 60 Hz frame (16 ms) for `tree` up
to six items and `rows` up to forty.

**Waiting is an option.** A host can instead hold the layout until every item is measured, with a cap, as the
current collage does (`PENDING_CAP_MS`, 4 s, `collage.transform.js:259`). The adapter takes `wait: false`
(default), `wait: true` or a cap in milliseconds.

**A re-layout must not shuffle the page.** A visible jump is the failure to avoid (`engineering/jank.md`). On
each arrival the adapter first re-runs only the sizing step for the arrangement already on screen. It searches
again only when that arrangement fits worse than a set threshold. Whether a re-layout may move items to new
places or only resize them is a host option; the threshold and the default are slice 4's to measure.

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

**Status:** proposed. "Today" cites the code. The logo-wall ratio was measured on a CLI render (a fact-check pass, 2026-10-16).

| Surface | Today | With mosaico |
|---|---|---|
| `collage` | `packCollage` | `tree` + `fill`, same output byte for byte |
| `logo-wall` | equal cells (`--logo-cols` 4 or 6) and a fixed mark height (`logo-wall.styles.css:27-31, 55-58, 75-77, 78-88`). Rendered at 1280×720, a 4:1 wordmark gets 2.7× the area of a 1:2 mark (about 1.7× in `dense`) | ragged `rows` + `equal-weight`, measured from each SVG's intrinsic size (`width`/`height`, else `viewBox`; `image-aspect.js:50`) |
| `columns` / `rows` panes | the author's ratio, 25–75 in 5% steps (`lib/core/pane-spec.js:47-49`) | `template`: a flexible pane beside a fixed-shape image or chart takes the width that ends the matte |
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
   rewritten for speed (fewer `tracksFor` checks per root,
   no per-candidate re-layout in the dedupe key, interval DP for ordered).
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
7. **Publish to npm**, after slice 3 (§9, decision 8). The owner triggers the release.

### 8.1 Slice 1, as built (2026-10-16)

**API.** `pack(items, container, options)` returns `{ ok: true, rects, aspect, empty, crop, ratio, score,
arrangement, gap, work }` or `{ ok: false, reason }` with reason `empty`, `too-many` or `no-valid-layout`.
An item is a number or `{ aspect }`; the container is `{ aspect }`. `toGrid(result)` is the CSS grid adapter.
Options: `order`, `fit`, `stretch`, `gap`, `hero`, `weights` (`empty`, `smallTile`, `smallTileFloor`, `hero`).
The collage's bleed tuning is a `weights` override it passes in, not a library mode. `rects` are in layout
units (the layout is 1 tall), not container units as §4.6 sketched: slice 1 has only the shape of the
container, and the grid adapter is what fits the real box. Container units arrive with the width-and-height
container.

**Where Lattice's side lives.** `lib/core/collage-pack.js` moved to
`lib/components/imagery/collage/collage.pack.js` and now holds only what is Lattice's: `STAGE_ASPECT`,
`DEFAULT_GAP`, `FILL_MAX`, the bleed weights, the even-grid fallback and the result shape the transform
emits. The one-photo case keeps its old shortcut (`crop: 0` even under `fill`) so the output stays the same.

**Byte-identical gate.** `test/fixtures/collage-golden/` holds an FNV-1a hash of `packCollage`'s output for
4,128 cases: 240 seeded random sets of 0 to 7 photos, 12 sets of repeated shapes and 6 sets on a rounding
boundary, each in 16 variants (order × fit × hero × bleed), captured from the packer at 69b521f. All 4,128
match. Mutations of the built library show the gate can fail: dropping the tile-balance term from the dedupe
changes 114 cases, reversing the tie-break 55 (only the repeated-shape sets reach it; with random sets alone it
changed none), over-pruning the lower bound by 1e-3 changes 10, and never building mirrors changes 16 (only the
boundary sets reach it).

**The checker's find.** The first cut skipped every mirror, on the claim that a mirror always repeats a key
already seen. The independent checker refuted it: a mirror computes its tile areas along a different chain of
additions, so they can differ in the last bits, and where a rounded key term sits exactly on a .5 boundary the
mirror gets a different key. 3:2 beside 16:9 balances at exactly 8437.5, so `packCollage([1.5, 16/9])` swapped
the two photos. It changed 480 of 37,800 two-photo and 1,807 of 567,000 three-photo cases against the old
packer, and the first golden passed because no case reached a boundary. The boundary sets are in the golden
now, and the rule below replaced the skip.

**What made it fast.** Three changes, each checked against the old packer directly as well as by the gate:
every two- and three-photo case over 15 common shapes and 7 stages (604,800 cases), 4,608 four- and five-photo
sets around the boundary pair, 1,500 random four- to six-photo sets and 81,808 edge cases (gutters from 0 to
`Number.MAX_VALUE`, odd heroes and stages) all return the same bytes.

- **Mirrors only near a rounding boundary.** In free order the subset loop visited every split twice. The
  first pass now takes only the splits holding the subset's top item, computes each candidate's two key terms
  before rounding, and queues the mirror of any candidate whose term lies within 1e-5 of a .5 boundary
  (measured error between a node and its mirror: about 1e-12 of a term). The queued mirrors are offered
  afterwards in the order the subset loop met them, so the dedupe keeps exactly the nodes it always kept. A
  gutter as tall as the box (`gap ≥ 1`) breaks that error bound, so there every mirror is queued: the old
  search, at the old cost.
- **Packed keys, no allocation for a dropped candidate.** Keys are packed integers (with the old string as
  the fallback outside their range), and a node is allocated only when kept. In `ordered` mode, which has no
  mirrors, the tile-balance walk runs only when a second node shares an outline.
- **Bounds before work at the root.** `W.empty·empty + crop` is a lower bound on the score, known before any
  layout; the full score is a lower bound before the two track passes. A root that loses on either bound by
  more than 4e-12 is skipped. At six free photos 1,114 of 5,484 roots are laid out, and about 12 reach the
  track check. The bound holds only for non-negative weights, so `pack` refuses a negative one.

`ordered` visits only contiguous runs, which is the interval DP §3 proposed with the split order kept.

**Measured.** `node` 22 on the 4-core sandbox, one harness for both columns: 10 warm-ups, then 40 timed
runs of `packCollage` with the §3 aspects, the landscape `beside` stage, the default gap and `fit: tight`
(`fill` reads the same). Before is the 69b521f packer. Median / p95, in ms:

| Photos | Free, before | Free, after | Ordered, before | Ordered, after |
|---|---|---|---|---|
| 4 | 0.76 / 1.24 | 0.20 / 0.58 | 0.12 / 0.27 | 0.04 / 0.22 |
| 5 | 4.14 / 6.60 | 0.94 / 1.50 | 0.61 / 1.04 | 0.11 / 0.29 |
| 6 | 58.0 / 95.9 | 9.1 / 12.6 | 3.31 / 3.68 | 0.37 / 0.73 |

The §4.5 budget (one re-pack ≤16 ms for `tree` at six items) holds at the median and at p95. §3's 92-113 ms
for the same packer came from a different harness (a mean of five runs after one warm-up), so compare within
this table, not across. The bench tier `collage pack` (`test/benchmark/engine-bench.mjs`) gates on the
deterministic work counts and prints the milliseconds.

**Compared on the same machine** (median ms / p95 ms, 1.41 container, gap 0.012 for mosaico):

| Items | mosaico free | mosaico ordered | diorama 2.0.18 `findSolution` | justified-layout 4.1.0 |
|---|---|---|---|---|
| 4 | 0.21 / 0.46 | 0.04 / 0.27 | 0.13 / 0.59 | 0.01 / 0.02 |
| 5 | 0.86 / 1.55 | 0.08 / 0.21 | 0.16 / 0.52 | 0.01 / 0.04 |
| 6 | 8.19 / 12.11 | 0.39 / 0.58 | 0.43 / 0.98 | 0.01 / 0.02 |
| 40 | — | — | — | 0.05 / 0.11 |

Read it as three different jobs. Below ten pictures diorama enumerates only ordered trees, with no gutters
and no dedupe, so its row compares with mosaico's ordered column, where the two are level. mosaico's free
column searches every order, which diorama does not attempt. justified-layout solves rows, the job slice 3's
`rows` strategy takes, and its speed is the bar that strategy should meet. diorama's current release (2.0.21)
ships an empty worker file and cannot run; 2.0.18 is the last release that does.

### 8.2 Slice 3, as built (2026-10-16)

Built before slice 2 because `rows` needs only fixed shapes and `logo-wall` is the second user the npm
release waits for.

**The strategy** (`docs/src/lib/mosaico/rows.ts`). Units are fractions of the container's width. Each item
sits in a cell at least `minCell` wide and centered in it; a row holds at most `maxPerRow` cells. The area is
the largest at which an item of aspect max(narrowest, `aspectFloor`) stands exactly at `heightCap`, never more
than a square at the cap, unless the host passes its own `area` (clamped at 1 / narrowest, above which a
larger area changes nothing); narrower items stand at the cap with less area. If the rows exceed `maxRows` or
`maxHeight`, the cap falls toward `minHeightCap` with the area held, then the area falls, both by bisection.
Every answer fits (a value is kept only after it passes); it is the largest fitting one when fitting is
monotone, which holds for the row count but not strictly for the height, because the most even breaks can
regroup rows as cells shrink. A layout that fits only at zero area is refused. Breaks: dynamic programming, fewest
rows then least squared slack, ties to the earliest break. Forty items: 0.7 ms median, 1.0 ms p95.

**How §4.3's rule became numbers for the logo wall** (`lib/core/logo-wall-pack.js`).
The planner passes mosaico the area, not a formula for it. The old wall drew each mark `contain` in a
column-wide cell under the band, so each mark had an old area; the shared area is kept inside the range of
those old areas. Inside the range it is two squares at the band, halved per halving of the narrowest shape
down to 1:2. A wall of one shape therefore draws every mark exactly as before, on every canvas, in every
variant. `minCell` is the old column width, `maxRows` the old row count.

**No mark stands taller than the band.** A first cut let the cap rise to band × √2 when the stage estimate
said there was room, so a crest beside wordmarks reached the area of a square at the band. The estimate
cannot see the heading: the fourth checker round wrapped a heading to two lines and a mixed wall that fits on
`main` overflowed (+1.5 px at 16:9, +113 px on a story slide). Nothing bounds a heading's length, so the only
height the plan can spend safely is the height the old wall spent. Holding every mark to the band keeps every
row at most the old row's height, so a wall that fit before fits after, whatever its heading does. The owner
chose this over keeping 1.00× with a reserve for one wrapped line (2026-10-17). The cost is equality with a
tall mark in the set: a crest stops at the band with half the others' area, a 2.0× spread against 3.6× before.
The shared area stays between the smallest and largest of the marks' old areas, so a mark can still move
either way inside that range: a mark whose old area was above two squares at the band comes down (a 2.3:1
mark beside 6:1 strips to 0.87 of its old area), and a thin wide mark grows toward it (that 6:1 strip to
2.25×, still within the band). A square beside 3:1 wordmarks keeps its old size and the wordmarks keep theirs
(1.79×, as on `main`); only a wall of one shape is guaranteed to draw exactly as before.

**Rows stand band-tall when the wall fits.** A packed row first stood at its tallest mark, which moved the rows of
every shipped wall closer together (the fifth checker round measured 8k to 214k changed pixels per wall at the same
mark sizes). Now a wall whose band-tall rows fit its stage stamps each mark padded to the band, so its rows sit
where the old rows did; only a wall that must shrink to fit stands each row at its tallest mark. The same
round found the live preview packing a wall whose list follows a lede paragraph, which the CLI leaves on the old
grid; both now pack only a list that opens the stage.

The gaps are the old wall's, which are spacing tokens (`--sp-2xl`, `--sp-xl`) times the deck's
`--canvas-scale`: 1 on a landscape slide, 1.65 square, 1.95 to 2.29 tall. The engine, the live runtime and
the planner now read that scale from one function, `canvasScaleFor` in `lib/adaptive/families.js`; before,
the engine and the runtime each carried a copy of the formula. The universal `compact` modifier redefines the
spacing scale at 0.75 of the 16:9 tokens without the canvas scale, so its gaps are the same fraction of the
list on every canvas.

Two earlier cuts got this wrong, and the checker caught both. The first anchored the area at band × √2 for
every wall (an `areaCap` option, since replaced by `area`), which doubled a wall of squares and took a third
off a 3:1 wall on tall and strip canvases, `examples/adaptive-sweep.md` among them. The second used one gap per
family for every canvas, so square canvases planned narrower gaps than they drew.

**The sweeps that pin it**, each rendered with the CLI on the base (`69b521f`) and on this branch, every drawn
mark measured. Canvases: every size the CLI offers (hd, 4K, standard, square, portrait, story, mobile,
mobile-landscape).

- *One shape:* four walls (3:1, 4:1, 1:1, 1:2) × eight variants (plain, dense, compact, dense compact,
  captioned with 8 and 12 marks, captioned compact, captioned dense), 256 walls. All 228 that fit on the base
  draw every mark within 0.5% of its old area. Of the 28 that overflowed, 10 now fit and 18 fall below the
  legibility floor and keep the old grid, drawn and flagged as before. None newly overflows.
- *Mixed shapes, short and long headings:* four sets (4:1/1:1/1:2/3:1, 3:1/1:1, 1:1/1:2, 3:1/1:2) × six
  variants × a one-line and a three-line heading, 384 walls. None newly overflows, none overflows further, and
  no mark stands taller than the base's tallest. With a crest in the set the median spread falls from 3.57× to
  2.00×; 3:1 beside 1:1 stays at 1.79×.
- *Shipped decks:* the six with a `logo-wall` slide (14 walls), compared as screenshots of each wall at
  the deck's own size. Every row and mark sits where it did and draws at its old size; what remains is edge
  anti-aliasing from rounded paddings (marks 0.03 to 0.1 px apart), about 0.1% of a wall's pixels.

The fourth round also found that a slide wider than 16:9 (mobile-landscape) shrank captioned walls, because
the planner converted the stage with the slide's own aspect while the engine keeps a 16:9 content box there,
and that a mark outside mosaico's 1:20 to 20:1 range, which mosaico reads as 1:1, drew twenty times too tall.
The planner now reads the stage at 16:9 above it, and such a mark leaves the wall on the old grid.

**A pre-existing overflow, fixed on the way.** The old wall did not fit three rows under an eyebrow: 439 px
of wall in a 400 px stage at 1280×720, on `main` too. On this PR's path, so fixed here (#18): a packed row is
as tall as its tallest mark (the CSS drops the band `min-height`), and the plan fits a stage estimated from the
slide's shape: the stage's measured share of the slide height at each canvas (0.608 at 16:9 up to 0.85 at
mobile, interpolated by aspect) less 0.06 for an eyebrow, and captions at their measured share of the slide's
short side per canvas (0.059 to 0.101, measured from the mark's foot to the item's foot). A captioned wall's
rows never stand taller than the old wall's, so the caption estimate only decides how far a wall that would
overflow shrinks. A safety margin on it only shrank walls that fit, so there is none.

**The checker's second round** (on the uncommitted slice) found the first cut of this wall unfit to ship, and
every finding was fixed before commit:

- *Overloaded walls shrank to dots and lost the overflow flag.* A 24-mark captioned dense wall packed to 5 px
  marks, silently. Now a wall that would pack below 0.35 of a square at the band keeps the old grid, whose
  overflow the export flags as before.
- *Tall and strip decks.* The plan assumed the `--sp-*` gaps scale with the list's width; on a mobile deck the
  row gap is 3× what it budgeted, which made a new overflow. A packed wall now stamps both gaps and the CSS
  reads them in `cqi` of the stage, so the plan's spacing is the drawn spacing on every canvas.
- *CLI and preview disagreed* on raster and remote marks (the preview packed them, the CLI could not). The
  preview now reads only what the CLI can: an inline or data: SVG, or a same-origin SVG URL.
- *A hidden section planned as 16:9.* The preview now reads the slide's shape from its computed size.
- Smaller: `rows` returned `ok` for zero-area layouts; a list's own style was overwritten (preview) or the
  list skipped (CLI); rounding could push an exactly full row past the width (values now round down).

Checked against the old tree on seven canvases (hd, 4K, standard, square, portrait, story, mobile) with the
checker's edge decks: no slide that rendered cleanly now overflows; walls that overflowed before and now pack
(three crest rows under an eyebrow at hd and 4K, twenty marks at square and mobile) fit; the rest fall back
to the old grid and overflow exactly as before.

**Rendering.** The CSS reads stamped fractions of the list's width: a percentage width, padding and column
gap all resolve against it. The first and last cells of a row carry the row's leftover width as inline
padding, which centers the row and fills the line, so the browser breaks exactly where the plan does. Each
mark is padded to its row's height (mask and inline SVG draw in the content box), so captions line up.

**Both paths.** The CLI stamps after `lattice.js` inlines each mark's SVG, reading the aspect from the inline
`<svg>` (the shared `aspectFromSvgTag`); the live preview (`logo-marks.js` `applyToDom`) fetches same-origin
SVG marks and parses them with the same function, and stamps once, with a 4 s cap like the collage's. In a
served page running the real `dist/lattice-runtime.js`, the live stamp matched the CLI's for all 10 marks of a
two-wall deck, and `docs/e2e/logo-wall-equal-weight.spec.ts` drives the real Studio (desktop, mobile and
WebKit phone): four mixed marks draw within 3% of one area, in one row.

**Measured on a CLI render at 1280×720** (drawn SVG boxes): a 4:1, 1:1, 1:2 and 3:1 mark went from 3.57×
max/min area to 1.00× (default) and from 2.75× to 1.00× (`dense`, six marks).

### 8.3 Spacing and placement, as built (2026-10-17)

The owner asked whether Mosaico lets a host set the gap and the container's padding, and what other controls
were missing. It had `gap` (and `rowGap` for `rows`), and nothing else: no padding, one gap for both axes in
`tree`, gaps in fractions of the height for `tree` but of the width for `rows`, and no say over where a
layout sits in the space it leaves. Every host drew the layout itself and redid the centering (the demo page
did it twice). Four options and two outputs close that, before the npm release fixes the API:

| Added | What it does |
|---|---|
| `padding` | space inside the container's edges: one length, or `{ top, right, bottom, left }` |
| `columnGap`, `rowGap` | separate gutters across and down, for both strategies (`gap` sets both) |
| `align` | where the layout sits in the space it leaves: `start`, `center` (default), `end`; `rows` also `justify`, with `lastRow` for its last row |
| `container.width`, `.height` | a size in any unit; every length option is then read in that unit |
| `result.frame` | where the layout sits in the container, in the container's units |
| `result.placed` | one box per item in the container's units: what to draw |

**One unit rule.** Without a size, lengths stay fractions, as before: of the height for `tree`, of the width
for `rows`. With a size, they are in its unit, pixels or anything else, so a host with a 16 px gutter passes
16 and needs to know nothing about the strategy. `rects` and `cells` stay in layout units, because `toGrid`
reads them.

**Exact gutters when the layout is width-limited.** A `tree` layout wider than the box used to be scaled
down whole, gutters with it. `placed` solves the root's width line for the height instead, so every gutter
keeps its size there too. The score is unchanged: it still reads the layout at height 1.

**`fill` stretches tracks, not the drawing.** It grows the tracks along the short axis by one factor, up to
1 + `stretch`, with the gutters kept, as a CSS grid of `fr` tracks does. Scaling the finished drawing instead
(the first cut) stretched boxes past `stretch` once there were gutters, sometimes shrank the frame, and
scaled the gutters; the checker found all three.

**Nothing moved for Lattice.** With none of the new options the arithmetic is the old arithmetic (a division
by 1, an offset of 0), so the collage golden file (4,128 layouts) and the logo-wall tests pass unchanged. Two
edges move for other callers, both found by the checker's differential fuzz against the previous build:
`toGrid` on a `rows` result now uses `rowGap` for the row tracks, and the search skips a root wider than the
box whose gutters span its whole width (it has no height to draw at), so such a call gets the next
arrangement that has room, or `no-valid-layout` when none has. Rerun after the fix over the same 4,000
calls, the fuzz refused only calls whose gap was at least the box's own height (1 and 1.5); the 0.332 case
it first found now gets a layout. Requiring every track to stay positive at the drawn
height as well would have moved collage layouts, so where a box would get no room at that height `placed`
scales the layout down whole instead. `test/unit/mosaico/spacing.test.js` pins all of it.
### 8.4 Live logo wall: the revisit regression (2026-10-17)

The owner recorded the Studio on an iPhone over a PR preview: arriving at a logo-wall slide showed only the
captions for about 1.4 s, then the marks popped in and the rows re-laid out. Slice 3 caused it. The live stamp
(`lib/transformers/logo-marks.js`) fetched every mark's SVG to read its shape on every visit, because nothing
remembered a shape, and the unpacked grid painted until the stamp landed. The preview deploy made each fetch slow:
Cloudflare Pages served the content-hashed `/playground/v/<hash>/` folder with `max-age=0, must-revalidate`.

The fix sits in the host, not in Mosaico: packing a wall takes under 0.1 ms, so caching a plan would save
nothing. The runtime keeps one aspect per mark URL for the life of the document; the Studio patches slides inside
one resident frame (`patchSlideBody`), so a revisit stamps in the same task, before its first paint. A failed
fetch or a non-OK response is forgotten, so it is retried. `docs/public/_headers` gives the folders
`sync-playground-assets.mjs` hashes (`samples/`, `themes/`, `esm/`) a year's immutable cache on the previews;
`newcomer/` is baked into the same folder later from inputs outside the hash, so it is left out. GitHub Pages
ignores the file and keeps sending `max-age=600`.

**Held back: hiding the wall on a first visit.** The first cut hid `ul[data-logo-wall="measuring"]`, as collage
hides its own measuring list. The checker found the cost: the Studio's exports bake a fresh capture frame (empty
cache) and wait for load, fonts and diagrams, never for a measuring wall, so a slow mark fetch would ship the wall
invisible, and in the webpage export, which strips the runtime, invisible for good. Collage carries the same
latent hole. The safe fix makes the capture wait (bounded) for both, which changes the export pipeline and so
needs the owner's sign-off; it is logged as a follow-up. A first visit therefore still draws the grid, then packs.

`docs/e2e/logo-wall-revisit.spec.ts` drives the real Studio with every mark delayed 300 ms and logs the wall's
state on each animation frame. Against main's `logo-marks.js` it fails on desktop and the WebKit phone project
(the revisit refetches all 4 marks and paints `measuring` first); with the fix the revisit paints `packed` only,
with 0 fetches, and the spec fails if the Studio ever swaps the frame instead of patching it.

### 8.5 Slice 4: the measuring kit, and exports that wait (2026-10-18)

`lib/core/measure-kit.js` replaces the two private copies. Both components call `run({ list, attr,
sources, finish })`; the kit does the rest:

- **Measure.** `aspectOfImage(img)` reads a loaded `<img>` at once and waits for `load` / `error` on one
  still loading (a failed image is `complete` and unknown, so it never burns the cap). The logo wall's
  SVG-tag fetch stays in `logo-marks.js` and goes through the same `remember`.
- **Remember.** `remember(key, load)` keeps one aspect per URL for the life of the document and shares
  the in-flight Promise. A null or a rejection is forgotten so a later visit retries. The logo wall's
  revisit spec (§8.4) still passes on it, and collage now stamps a revisit at once too.
- **Hold.** `run` marks the list `measuring`, waits for every source, and calls `finish` once after the
  cap (4 s, `DEFAULT_CAP_MS`). A second `run` on a list being measured returns false. **That is the
  stability rule: a list packs once, never again as a late item arrives.** Both components pack from
  the final shapes and never re-pack, so the "re-run only the sizing step" refinement in §4.5 is not
  built; nothing needed it.
- **Signal.** Each run registers on `doc.__latticeMeasure`. `idle(ms)` resolves true when nothing is
  measuring and false at `ms`; `settle()` finishes whatever is still measuring with what is known.

**The kit lives in `lib/core`, not in the Mosaico package.** Mosaico has no DOM by contract (§5), and
the kit reads `<img>` and a document. Mosaico's README points to it.

**Exports wait.** `createCaptureFrame` (`deck-export.js`) calls `waitForMeasuring(doc, 4000)` after the
diagram wait: `idle(4000)`, then `settle()` if it timed out. All eight capture lanes share it, so no
Studio export captures a list still measuring. `finishBake` also turns any list still `measuring` into
`fallback` (the unpacked grid), the backstop for a frame whose runtime never reported. With that in
place the logo wall hides while measuring, as collage does, so a first visit paints once.

**Measured.** `logo-wall-first-visit.spec.ts` on the real Studio, marks delayed 300 ms: every painted
state before `packed` is `measuring` with `visibility: hidden`, never the grid; with one mark delayed
9 s the cap shows the unpacked grid, visible. Exports of a collage and logo-wall deck with every
picture delayed 1.5 s and 3 s, light and dark: no list baked hidden, and at 1.5 s the pages are
pixel-identical to exports built from main's code. **Found, not caused:** the Studio export draws the
logo wall as `fallback` in both builds (followup `2763-p2`).

### 8.6 Slice 2: range items and `template`, as built (2026-10-18)

`docs/src/lib/mosaico/region.ts` holds the regions and `template.ts` the strategy; `pack(items, container,
{ strategy: 'template', template })` is the entry. Nothing renders through it yet.

- **Regions are convex polygons** of `[w, h]` points, with a "no upper bound" size larger than the container
  standing in for infinity, so every region is closed. A fixed shape is a segment, a range a clipped wedge, a
  floor or cap a box. A join slices both polygons at every vertex height of either; between those heights both
  slices are linear, so the joined polygon is exact, not sampled. A stacked join is the same with the axes
  swapped. Collinear vertices are dropped after each join, because without that the vertex count roughly doubled
  per alternating join (the checker measured 1,448 vertices at 12 items).
- **The sizing step is a flex-style share, not a convex program.** Each join splits its width (or height) in
  proportion to weight, freezing a child at the edge of the sizes it allows at the shared height (or width), and
  the rest share what is left. §4.1 expected "a small convex program"; this is its common case (linear bounds,
  the quadratic goal "stay close to the proportional split") and it is exact per join. A nested join counts as
  one child, as a nested flex container does, so the share is not the same as the flat n-ary join once a bound
  freezes. A goal that wants something else, such as `equal-size`, would need the program. **The goal that
  matters today is the root-size choice** (below), and "largest area" is provisional.
- **Fixed shapes come in two kinds.** `exact` fills the cell, so a fixed shape pins the cell's shape. That
  was the first cut's only kind, and it failed the use case §6 gives for `template`: a text pane beside a 16:9
  image got width 0 (the image took the whole height, the pane's floor of 0 was the cheapest place to find room).
  The red team, the checker and the inversion each found it. `contain` lets the cell be any shape and returns the
  largest picture inside it in `fitted`.
- **Fit.** The container's own size is used when the root region contains it. Otherwise the layout is the size in
  the region, inside the container, with the largest area. Two guards make that safe: an item with no stated
  floor gets 2% of the short side, and any layout that leaves an item with no visible size is refused
  (`does-not-fit`), as `tree` refuses a zero track. With a width and no height the height is the region's lowest
  at that width, which the floors keep above zero.
- **Limits.** At most 64 items and 64 levels of nesting (deeper recursion overflowed the stack at about 2,000
  levels).
- **The property tests** (seeded; `test/unit/mosaico/template.test.js`): a size of A and a size of B at one
  height always sum to a size of the join (6,000 pairs); a size of a stacked join splits back into one from each
  (3,000 points, by a grid search and an exact interval check); every join of joins, not only a join of a node
  and a leaf, is convex and holds the midpoint of two of its sizes; for any size a random root allows, every item
  lands inside its own rule, nothing overlaps and the container is filled exactly; and for any container, inside
  the root region or not, with n-ary, nested and width-only layouts, every ok result shows every item, obeys the
  limits it was given, stays inside the container and does not overlap. Dropping the join's gutter fails
  completeness, sizing and the round-trip test, and using only the lower and upper ends as breakpoints fails
  soundness.
- **Cost, measured** (200 random left-leaning folds per size, feasible rules, one machine, 2026-10-18): mean
  0.16 ms at 6 items, 0.19 at 12, 0.44 at 40 and 0.43 at 64; the slowest single run was 4.6 ms. Pane-like layouts
  (floors only, 1280 x 720) mean 0.04 to 0.24 ms. All inside the 16 ms re-pack budget of §4.5. The first cut's
  figures were taken on mostly infeasible inputs, which refuse early; the checker found 4.4 ms mean and 519 ms
  worst at 40 items before the vertex fix.
- **Stated limits of the hardening:** the region helpers are exported as experimental, and `tree` and `rows`
  read a range as its geometric mean rather than throwing.

**The `columns` / `rows` panes do not route through it yet.** The owner's slice-2 brief named them as the first
user, with a demo deck. They are fixed-ratio pairs (`ratio-60-40`, nine lines of CSS), so a move changes no pixel
and touches every pane slide, and the gallery-isolation rule (HARD RULE #8) makes each pane deck a separate
review. The exact weighted case is the first test in `template.test.js`; the image-beside-pane case is the second
test block. This is a deviation from the brief, taken without the owner's say: it is logged for the owner in the
PR and as `followups.d/2744-p3-panes-through-template.md`.

## 9. Decisions

**Settled (owner, 2026-10-16):**

1. **v1 items:** fixed shape, shape range, one-axis stretch, flexible, and not-measured. Height-depends-on-width
   items wait for v2.
2. **v1 strategies:** `tree`, `rows` and `template` (plus the trivial `grid`). The output is plain
   rectangles so a pinwheel template can come later.
3. **Name:** mosaico.
4. **This note first, as a docs-only PR, before any code.**

5. **License: `AGPL-3.0-only`**, the same as `segno`.
6. **`equal-weight` means equal area with a height cap** (§4.3). Optical density stays out of scope.
7. **Layout is async: lay out at once, re-lay out as sizes arrive** (§4.5). Waiting for every item, with a cap,
   is a host option, not the default. The speed budget in §4.5 is what makes this the default.

8. **Publish after `collage` and `logo-wall` run on it.** Both are committed users: `collage` in slice 1 and
   `logo-wall` in slice 3. The first public version comes after slice 3, so it carries an API those two shaped.
   The publish itself is still a release the owner triggers (§8, slice 7).
