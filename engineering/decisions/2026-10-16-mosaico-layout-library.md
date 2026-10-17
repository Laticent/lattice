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
than a square at the cap; narrower items stand at the cap with less area. If the rows exceed `maxRows` or
`maxHeight`, the cap falls toward `minHeightCap` with the area held, then the area falls, both by bisection.
Every answer fits (a value is kept only after it passes); it is the largest fitting one when fitting is
monotone, which holds for the row count but not strictly for the height, because the most even breaks can
regroup rows as cells shrink. A layout that fits only at zero area is refused. Breaks: dynamic programming, fewest
rows then least squared slack, ties to the earliest break. Forty items: 0.7 ms median, 1.0 ms p95.

**How §4.3's rule became numbers for the logo wall** (`lib/core/logo-wall-pack.js`).
The first anchoring, area set by the narrowest mark at the old band, shrank the common case: a 3:1 wordmark
went from 240 px to 127 px wide. So the cap is the old band × √2 (with a 1:2 crest present, a square keeps its
old 104 px) and may fall back to the band; `minCell` is the old column width, `maxRows` the old row count. A
wall of one shape then keeps its old size exactly (four 3:1 wordmarks: 240×80 px, as before). Captioned walls
hold every mark to the band but size the marks from the same anchor (`areaCap` = band × √2): a first version
computed the area from the band itself and drew a captioned wall of 3:1 wordmarks about a quarter narrower than
the old equal cells. The cost is equality on a captioned wall with a crest: the crest stops at the band with
half the others' area (2.0× spread, against 3.6× before). The universal `compact` modifier scales both gaps by
its 0.75 spacing, as it scales the tokens the old wall used. Rendered against the base on both shipped
logo-wall decks, every one of the 88 marks is within 0.1 px of its old size.

**A pre-existing overflow, fixed on the way.** The old wall did not fit three rows under an eyebrow: 439 px
of wall in a 400 px stage at 1280×720, on `main` too. On this PR's path, so fixed here (#18): a packed row is
as tall as its tallest mark (the CSS drops the band `min-height`), and the plan fits a stage estimated from the
slide's shape: the stage's measured share of the slide height at each canvas (0.608 at 16:9 up to 0.85 at
mobile, interpolated by aspect) less 0.06 for an eyebrow, and captions at their measured share of the slide's
short side per canvas (0.061 to 0.121), plus 10%.

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
