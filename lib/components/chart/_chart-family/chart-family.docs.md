# chart-family

Lattice's chart engine. A shared rendering subsystem used by thirteen
chart-class components: `progress`, `timeline-list`, `piechart`,
`gantt`, `kanban`, `radar`, `quadrant`, `state-chart`, `funnel`, `map`,
`journey`, `word-cloud`, and `roadmap`.

Membership is defined by the engine, not the disk bucket: a chart-family
member is any layout the dispatcher wraps in the `.chart-frame` skeleton.
That is a wider net than substance = `series` — `state-chart` is a `graph`
and `journey` is `structure`, yet both render through the frame, and
`word-cloud` (`series`) was folded in when its bespoke frame-mirroring CSS
was retired in favour of the real skeleton.

**Files in this folder:**

| File | What it implements |
|---|---|
| `chart-family.css` | The `.chart-frame` skeleton + `.chart-status` pill vocabulary that every chart component wraps its content in. |
| `chart-family.js` | The dispatcher + inline kernels for `progress` / `timeline-list` / `piechart` / `gantt` / `kanban`, plus shared parsing helpers. Imports the per-component `radar.transform` and `quadrant.transform` kernels which live in their own component folders. |

The dispatcher runs in both render paths:
- **The owned engine** (`lib/engine`) — wraps the
  `render()` output and post-processes the HTML string.
- **Emulator build path** (`lattice-emulator.js`) — calls the same
  dispatch inline during per-slide HTML construction.

---

## The `.chart-frame` skeleton

Every chart component renders into the same outer DOM shape:

```html
<section class="<layout> chart-frame">
  <div class="chart-header">
    <p class="chart-eyebrow"><code>…</code></p>
    <h2>Title.</h2>
    <p class="chart-subtitle"><code>…</code></p>
  </div>
  <div class="chart-body">
    <!-- layout-specific markup goes here -->
  </div>
  <p class="chart-caption">…</p>
</section>
```

The dispatcher does three things:
1. Recognizes the layout class on a section.
2. Wraps the section's content in `.chart-frame` / `.chart-header` /
   `.chart-body` / `.chart-caption`.
3. Rewrites the inner list (`<ul>` or `<ol>`) into layout-specific
   markup by calling the kernel for that layout.

CSS in `chart-family.css` styles the skeleton (header padding, body
flex layout, status pill chrome). Per-component CSS in
`lib/components/<chart-layout>/<chart-layout>.styles.css` styles the
chart's interior.

---

## Sizing: the SVG's own box is container-relative, its interior is not

Two coordinate systems meet at the `<svg>` element, and the units mean opposite
things on either side of it.

- **Inside** the viewBox, a `px` is a **user unit** — a coordinate in the chart's
  own space that scales with the box. Every geometry number a kernel emits, and
  every `font-size` on an in-diagram `<text>`, is in these units. They are
  resolution-free by construction: the same numbers paint correctly on an SD
  projector and an 8K panel.
- **On** the `<svg>` element, `width` / `height` (and the `min-`/`max-` forms) are
  **page pixels**. A length there pins the diagram to a physical size, so it stops
  growing with the slide while the `cqi`-sized type around it keeps going. That is
  the whole of #1184: a radar mini held ~18.7% of the chart body at HD and ~4.2%
  at 4K — it shrank away from its own caption.

So: **size the SVG's box in container units** (`cqi`, or `100%` of a
container-sized parent), and leave everything drawn inside it in user units.

Where a member needs a named size, it goes through a token on the chart root so a
theme or variant can retune it in one place — e.g. `--radar-mini-size`, the edge
of one radar small-multiple.

Calibrating such a token is a **measurement**, not an estimate: `cqi` resolves
against the nearest size container's **content box**, which for a chart is
`.chart-body` — and it has to be measured on the surface whose bytes ship, the
emulator document Chrome prints the PDF from AT THE VIEWPORT IT PRINTS AT
(1280x720), where that box is 921.8px. Loading the same document at a default
800x600 answers 960px and a 4% smaller chart. Reading it off the slide width instead is a ~25% error, which
silently redesigns the chart while looking like a units cleanup. A differently
padded HOST resolves the same token against ITS chart body and gets a
proportionally different pixel size — that is what a relative unit is for.

`tools/check-chart-responsiveness.js` gates this. It exempts everything internal
to an SVG rule (correctly — those are user units) but scans svg-box rules for
their box size, so a fixed-px `<svg>` box fails the gate.

---

## Legend / key system

A chart carries a **key** only when it encodes meaning by colour, symbol, or
size — i.e. something the marks don't already spell out. That test sorts the
13 members into three placements (full rationale + the per-chart catalog:
`engineering/decisions/2026-06-11-chart-legend-system.md`):

**Colour/size-categorical → integrated SVG key.** `piechart`, `radar`, `map`,
and `quadrant·cohort` carry their key **inside the diagram's own `<svg>`
viewBox**: diagram, a gradient **spine**, and the swatch+label+value key are one
unit that scales together (emitted by `svg-legend.js` — see
`engineering/decisions/2026-06-13-svg-native-legend.md`). No CSS grid, no
`::before` spine — the key is SVG `<text>`/`<rect>` in viewBox units, so it tracks
the diagram at any size and the four read as one family; long labels **wrap**
(never clip). `word-cloud` is the lone holdout: it still lays out as a CSS `grid`
(cloud in the left ~68%, a vertical "size = frequency" ramp in the right rail)
with a gradient **spine** drawn by `.word-cloud-canvas::after`, and it now
**solely owns the `--chart-spine*` tokens** the keyed charts used to share.

**Wide diagram → bottom-centre key.** `roadmap` (status markers ✓/–/○/╱,
emitted by `buildStatusLegend` for the states present; omitted only on
`status`, which already labels every cell), `gantt` (a swatch+label status key
reusing each bar's fill,
emitted by `buildGanttChart`), and `journey` (actor + mood keys reordered to
the foot of the board, CSS-only).

**Self-labelling → no key.** `funnel`, `progress`, `kanban`, `timeline-list`,
`state-chart`, and the non-cohort `quadrant` variants caption every
band/bar/card/node in place (kanban & state-chart print a labelled status
pill on each tile), so a separate key would be redundant.

The keyed charts' key carries only TYPE from CSS — `.chart-key-label` / `-value`
/ `-head` set fill + route `--font-label` / `--font-mono` (so the `sketch` finish
reskins the labels); the GEOMETRY lives in the SVG. The only CSS-rail tokens left
are `word-cloud`'s own `--chart-spine` / `--chart-spine-w` / `--chart-spine-h` (on
`section.word-cloud`). The roadmap/gantt/journey keys ride the shared
`transformChartSection`, adding no slides, so cross-renderer parity holds.

---

## Standalone export — one chart as a self-contained `.svg`

Because the four keyed charts are **one `<svg>`** (diagram + spine + key in a
single viewBox), a chart can be lifted out of a deck as a portable file. It is
not portable *as-emitted*, though: colours are `var(--token)`/`color-mix()` and
the key text is styled by `.chart-key-*` CSS classes, so a detached SVG with no
stylesheet renders **black, unstyled, serif**. The export resolves this:

- **`lib/components/chart/_chart-family/standalone-svg.js`** — the shared core.
  `flattenSvgStyles` walks the rendered chart and inlines the browser's
  **computed** paint/text styles as literals (so `var()`/`color-mix()` bake to
  `rgb()`/`oklab()` and no external CSS is needed); gradient `<stop>`s are
  resolved through a rendered probe (defs aren't laid out, so `getComputedStyle`
  won't resolve them there). `finalizeStandaloneSvg` then guarantees `xmlns`, a
  `viewBox`-derived intrinsic `width`/`height`, and injects the embedded fonts.
  `collectFontFamilies` subsets which faces to embed.
- **CLI — `tools/export-chart-svg.js`** (headless): `node tools/export-chart-svg.js
  <deck.md> [--slide N] [--chart I] [--theme NAME] [--mode light|dark]
  [-o out.svg] [--all]`. Renders through `window.LatticePlayground.render` in a
  puppeteer page, embeds the engine fonts from disk
  (`tools/lib/chart-font-embed.js`), writes the file.
- **Drawing Board** — a **"Chart SVG"** entry in the Export menu, shown **only
  when the cursor's slide carries a chart** (gated on the `.db-active` section),
  exporting that one chart. Reuses the same core in the browser via the esbuild
  ESM bundle `standalone-svg.generated.js`, embedding fonts through
  `docs/src/playground/font-embed.js`.

**Caveats.** Resolved colours come out as `oklab()` where the source used
`color-mix(in oklab, …)` — every current browser (and Inkscape ≥1.0 / resvg)
renders it, older SVG renderers may not. The export keeps a `viewBox`, so it
stays fully responsive (the intrinsic `width`/`height` is only a default
footprint). Embed-only — text stays selectable; glyph **outlining** to `<path>`
was deferred (`2026-06-13-svg-native-legend.md` §4d).

---

## Membership

The closed set of layouts wrapped by chart-family is hard-coded in
`chart-family.js`:

```js
const CHART_LAYOUTS = ['progress', 'timeline-list', 'piechart',
                       'gantt', 'kanban', 'radar', 'quadrant',
                       'state-chart', 'funnel', 'map',
                       'journey', 'word-cloud', 'roadmap'];
```

Adding a new chart member requires updating that array AND either:
- writing an inline builder in `chart-family.js` (current pattern for
  `progress` / `timeline-list` / `piechart` / `gantt` / `kanban`), OR
- writing a per-component `<name>.transform.js` kernel and importing
  it from `chart-family.js` (current pattern for `radar`, `quadrant`,
  `state-chart`, `funnel`, `map`, `journey`, `word-cloud`, and `roadmap`).

`roadmap` is the one member whose body is a `<table>` (or a transposed
`.horizons` grid) rather than a list/SVG figure; the dispatch wraps it in a
`.roadmap-figure` div so the div-based chart-frame body matcher catches it.

For a delegated kernel the dispatch branch calls the kernel's section
transform to rewrite the list in place (e.g.
`journey.transformJourneySection(html, cls)` /
`wordCloud.transformWordCloudSection(html, cls)`), leaving the `<h2>` for
the chart-frame wrap to lift into the header. The body container the kernel
emits (`.journey-board`, `.word-cloud-canvas`, …) must be listed in the
`bodyRE` the wrap scans for.

---

## Motion + mark-detail support, by member

Two independent features ride on the same handles:

- **Mark-detail popover** (`docs/src/playground/chart-interact.js`) binds a chart
  root and its `[data-mark]` marks, and shows the `<template class="chart-detail">`
  payload the kernel emitted for that mark.
- **Chart motion** (`docs/src/lib/chart-anima.ts` `chartToScene`) reads the FIRST
  `<svg>` in the section and animates every mark in it — `[data-mark]` geometry,
  `[data-anima-role]` geometry, and every `<text>`.

The second sentence is the load-bearing one: **a chart with no `<svg>` gets no
scene, and no scene means the poster simply stays up.** That failure is silent —
the chart looks right and never moves — so a member that is not SVG-native is not
"mostly supported", it is skipped.

| Member | Chart root | Popover | Motion | Notes |
|---|---|---|---|---|
| `piechart` | `.piechart-svg` | yes | yes | sectors reveal together — a staggered wedge leaves a hole |
| `funnel` | `.funnel-svg` | yes | yes | bars stagger top-to-bottom; the drop-off IS the story |
| `map` | `.map-svg` | yes | yes | regions; labels live in the key, which already wrapped |
| `quadrant` | `.quadrant-svg` | yes | yes | dots / bubbles / trail-ends all declare the `point` role |
| `radar` | `.radar-svg` | yes | yes | polygons declare a role but NO `data-mark` — see below |
| `gantt` | `.gantt-svg` | yes | yes | bars `bar`, milestones `point` |
| `state-chart` | `.state-chart-edges` | yes | yes | states painted into the overlay by the measuring pass |
| `state-chart inline` | — | yes | **no** | a compact row list, not a diagram: no overlay to paint into |
| `word-cloud` | `.wc-svg` | no | yes | words fade in; not wired for the popover |
| `journey` | — | no | no | its inline SVG is decorative |
| `kanban`, `progress`, `timeline-list`, `roadmap` | — | no | no | HTML layouts, not diagrams |

### The radar's asymmetry is deliberate

The radar's series polygons declare `data-anima-role` and deliberately carry **no**
`data-mark`. The radar's mark namespace belongs to its **axis labels** — the
popover keys each axis's detail template by that index — so a mark on a polygon
would shift the map and open the wrong detail. `chartToScene` therefore collects
`[data-mark], [data-anima-role]` and partitions by role, which lets a mark animate
without claiming a popover index.

### In-diagram labels wrap

Every label a kernel draws inside its diagram goes through
`_chart-family/svg-label.js`, which breaks it into `<tspan>` lines sized in
viewBox user units.

A **scatter** label has a second problem: wrapping cannot help two points
plotted on top of each other. `placeLabels` in the same module handles that by
trying eight anchors around the mark at three distances and taking the CHEAPEST
that clears every mark, every already-placed label, and the plot box. Above and
below are cheapest, the diagonals next, pure left/right last — by enough that a
caption one line further above its point beats the nearest spot beside it. So a
label is always ADJACENT to its own point, and two close points get different
sides rather than a stack. A kernel hands over the mark, never a position.

Where a label genuinely cannot be placed clear — five three-line names in one
quadrant is ~76% of that quadrant in label, which no arrangement fixes — it is
**dropped** rather than painted through its neighbor. Overprinting loses both
names and says nothing; the dropped one still rides `data-label`, the popover
and the speaker note.

See `engineering/decisions/2026-07-26-svg-chart-labels-motion.md` for why
`<tspan>` and not `<foreignObject>`, who owns the font size, and (§14) why
placement is a choice of position rather than a nudge.

---

## Kernel contract

Per-component chart kernels (`radar.transform.js`, `quadrant.transform.js`)
export `transformChartSection(html, classTokens)` — a pure function
that takes the raw section HTML and the section's class tokens, returns
the rewritten HTML.

The same function signature is used by inline builders in
`chart-family.js`. The dispatcher routes based on class token presence
and calls the appropriate kernel.

---

## Three-renderer parity

The dispatcher runs identically in three places:

| Render path | Where the dispatch is called |
|---|---|
| Engine (HTML) | `lib/engine` → `applyChartFamilyToHtml(html)` |
| Lattice emulator | `lattice-emulator.js` → inline `transformChartSection()` calls per slide |
| VS Code preview | `lattice-runtime.js` → DOM mirror that recreates the same wrappers at runtime |

Editorial guarantee: every chart slide renders identically across the
three paths. Drift between them is a bug; the per-component
integration tests at `test/integration/components/component-galleries.test.js`
assert page counts to catch transforms that silently change topology.

---

## Why HTML-string transforms, not markdown-it rules

The transform is structural (extract eyebrow before h2, subtitle after
h2, caption italic at the tail, rewrite the list into chart-specific
markup) and easier to express on rendered HTML than on the token
stream. The owned engine wraps `render` and
post-processes the resulting `html` string.

Why not a runtime `<script>`? VS Code Marp preview filters HTML
elements through Marp's allowlist, which excludes `<script>` by
default. Even with `markdown.marp.html: "all"`, relative-path
resolution and webview CSP made the runtime path unreliable. The
engine wrapper bakes the transform into the rendered HTML so the
preview and the export pipelines see the same DOM.

---

## Future refactor

The current file structure has an asymmetry: `radar` and `quadrant`
follow the per-component-transform pattern (their kernels live in
`lib/components/<name>/<name>.transform.js`), while the other 5 chart
layouts have their kernels inlined in `chart-family.js`. This was
historical — the inline kernels were written before per-component
transforms were a pattern.

A planned cleanup distributes all kernels to their components, leaving
`chart-family.js` as pure dispatch + shared helpers. See
`engineering/decisions/2026-05-17-chart-family-refactor.md` for the design.

---

## See also

- `lib/components/chart/{progress,timeline-list,piechart,gantt,kanban,radar,quadrant,state-chart,funnel,map,journey,word-cloud,roadmap}/<name>.docs.md` — per-component contracts and variant catalogs.
- `lib/shared/shared.docs.md` — the contrast: small composable
  modifiers (`compact`, `loose`, `accent`) that compose with all
  layouts, not just chart components.
