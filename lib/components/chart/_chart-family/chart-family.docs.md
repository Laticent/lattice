# chart-family

Lattice's chart engine. A shared rendering subsystem used by fourteen
chart-class components: `progress`, `timeline-list`, `piechart`,
`gantt`, `kanban`, `radar`, `quadrant`, `state-chart`, `funnel`, `map`,
`journey`, `word-cloud`, `roadmap`, and `matrix-grid`.

Membership is defined by the engine, not the disk bucket: a chart-family
member is any layout the dispatcher wraps in the `.chart-frame` skeleton.
That is a wider net than substance = `series` — `state-chart` is a `graph`
and `journey` is `structure`, yet both render through the frame, and
`word-cloud` (`series`) was folded in when its bespoke frame-mirroring CSS
was retired in favor of the real skeleton.

**Files in this folder:**

| File | What it implements |
|---|---|
| `chart-family.css` | The `.chart-frame` skeleton + `.chart-status` pill vocabulary that every chart component wraps its content in. |
| `chart-family.js` | The dispatcher and the `.chart-frame` wrap, and nothing per-chart: no layout list, no kernel `require`, no adapter, no figure-class alternation. Every chart's kernel lives in its own component folder. |
| `chart-registry.generated.js` | The frozen dispatch table — layout tokens, figure classes, kernel entrypoints — generated from every chart manifest's `kernel` block by `tools/build-chart-registry.js`. Never hand-edited. |
| `transform-utils.js` | The shared string/list toolkit each kernel imports, plus the section-kernel helpers (`spliceFirstList`, `stripTrailingPills`, `readsHandBody`) and the family's `CHART_STATUS` vocabulary. |

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

A chart carries a **key** only when it encodes meaning by color, symbol, or
size — i.e. something the marks don't already spell out. That test sorts the
13 members into three placements (full rationale + the per-chart catalog:
`engineering/decisions/2026-06-11-chart-legend-system.md`):

**Color/size-categorical → integrated SVG key.** `piechart`, `radar`, `map`,
and `quadrant·cohort` carry their key **inside the diagram's own `<svg>`
viewBox**: diagram, a gradient **spine**, and the swatch+label+value key are one
unit that scales together (emitted by `svg-legend.js` — see
`engineering/decisions/2026-06-13-svg-native-legend.md`). No CSS grid, no
`::before` spine — the key is SVG `<text>`/`<rect>` in viewBox units, so it tracks
the diagram at any size and the four read as one family; long labels **wrap**
(never clip). `word-cloud` joined them on 2026-07-27 with a key of a different
KIND: not swatch·label·value rows but a `size = frequency` A-ramp, since word size
is what encodes weight there. It is emitted by the kernel rather than by
`buildSvgLegend`, but it shares the family's **spine** (`svg-legend.js buildSpine`)
and lives in the cloud's own viewBox, so key and words scale as one unit. The
`--chart-spine*` tokens it used to own are deleted — nothing reads them now.

**Wide diagram → bottom-center key.** `roadmap` (status markers ✓/–/○/╱,
emitted by `buildStatusLegend` for the states present; omitted only on
`status`, which already labels every cell), `gantt` (a swatch+label status key
reusing each bar's fill,
emitted by `buildGanttChart`), and `journey` (actor + mood keys reordered to
the foot of the board, CSS-only).

**Self-labeling → no key.** `funnel`, `progress`, `kanban`, `timeline-list`,
`state-chart`, and the non-cohort `quadrant` variants caption every
band/bar/card/node in place (kanban & state-chart print a labeled status
pill on each tile), so a separate key would be redundant.

The keyed charts' key carries only TYPE from CSS — `.chart-key-label` / `-value`
/ `-head` set fill + route `--font-label` / `--font-mono` (so the `sketch` finish
reskins the labels); the GEOMETRY lives in the SVG. `word-cloud`'s `.wc-key-*`
rules follow the same division of labor. **No CSS-rail spine tokens remain**: the
`--chart-spine*` trio was deleted with word-cloud's conversion, since every spine
in the family is now drawn by `svg-legend.js buildSpine`. The
roadmap/gantt/journey keys ride the shared `transformChartSection`, adding no
slides, so cross-renderer parity holds.

---

## Standalone export — one chart as a self-contained `.svg`

Because the keyed charts are **one `<svg>`** (diagram + spine + key in a
single viewBox), a chart can be lifted out of a deck as a portable file. Since
2026-07-27 that includes `word-cloud` (key inside the viewBox) and a
small-multiples `radar` (each mini's series name inside its own viewBox) — both
previously exported with their labels missing. It is
not portable *as-emitted*, though: colors are `var(--token)`/`color-mix()` and
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
- **In the browser** — the kernel ships in the Studio's export module
  (`docs/src/components/studio/export/deck-export.js` `exportChart`), reusing the same
  core via the esbuild ESM bundle `standalone-svg.generated.js` and embedding fonts
  through `docs/src/playground/font-embed.js`. It currently has **no UI entry point**:
  the "Chart SVG" item lived in the Drawing Board's Export menu, which retired with that
  route (2026-07-03-studio-succession.md P5). Use the CLI above until a Share entry is
  added.

**Caveats.** Resolved colors come out as `oklab()` where the source used
`color-mix(in oklab, …)` — every current browser (and Inkscape ≥1.0 / resvg)
renders it, older SVG renderers may not. The export keeps a `viewBox`, so it
stays fully responsive (the intrinsic `width`/`height` is only a default
footprint). Embed-only — text stays selectable; glyph **outlining** to `<path>`
was deferred (`2026-06-13-svg-native-legend.md` §4d).

---

## Membership

The set of layouts wrapped by chart-family is **declared by the components
themselves**. A chart's manifest carries a `kernel` block:

```jsonc
"kernel": { "figureClass": "gantt-chart" }   // the class on the figure root it emits
```

One key, because one fact is not derivable. The kernel is at
`<name>/<name>.transform.js` and exports `transformSection`, both by convention —
`checkChartKernels` (`tools/check-ownership.js`) enforces all three, including that
the declared class is one the kernel actually writes.

`tools/build-chart-registry.js` reads every one of those and freezes
`chart-registry.generated.js`, which is where `CHART_LAYOUTS` now comes from.

Dispatch is FIRST MATCH over that list, and its order is derived too: a chart is
placed ahead of any chart it names in its own `variants`. That is not cosmetic —
`radar`'s `quadrant` variant collides with the `quadrant` chart's name, so
`<!-- _class: radar quadrant -->` must reach radar. A hand-written array settled
that by accident for years; the generator settles it from the manifests.

**Membership is a skeleton, not a claim about content.** Being in `CHART_LAYOUTS`
means one thing: the dispatcher wraps this layout in `.chart-frame`, so it gets
the shared eyebrow / subtitle / caption / status chrome. It says nothing about
what the author writes (`substance` — `state-chart` is a `graph`, `journey` and
`roadmap` are `structure`) and nothing about what the layout is drawn with
(`render` — four members draw no SVG at all). Those are three separate readings
of the word "chart", plus a fourth for the bucket folder; `design/design-system.md`
§5.5 lays all four side by side.

**A chart's DISPATCH AND FRAMING are a folder drop.** Create
`lib/components/chart/<name>/` with a manifest carrying a `kernel` block and a
`<name>.transform.js` exporting `transformSection`, then `npm run build`. No
edit to `chart-family.js`, no array entry, no adapter, no figure-class
alternation. `test/unit/components/chart-folder-drop.test.js` performs exactly
that drop against a scratch copy of `lib/` and renders it through the real
engine, so the claim is executed rather than asserted.

**That is the dispatch, not the whole component.** A chart still has to be added
by hand to several rosters elsewhere in the tree, none of which goes red when you
miss it — the accessible prose projection
(`lib/transformers/prose-projection.mjs`), the image-set / standalone-SVG export
(`lib/export/image-set.js`, `tools/export-chart-svg.js`), the Studio export's
clean-SVG list, the scorecard's data layouts (`lib/authoring/scorecard.js`) and
the docs family picker (`docs/src/lib/families.mjs`). The checklist in
`design/skills/chart-component.md` names them. Folding them into the manifest is
follow-up work, not something this change did.

`roadmap` is the one member whose body is a `<table>` (or a transposed
`.horizons` grid) rather than a list/SVG figure; the dispatch wraps it in a
`.roadmap-figure` div so the div-based chart-frame body matcher catches it.

A kernel rewrites the list (or the table) in place and leaves the `<h2>` for the
chart-frame wrap to lift into the header. The body container it emits
(`.journey-board`, `.word-cloud-canvas`, …) is found through the manifest's
`kernel.figureClass` — the wrap builds its matcher from the declared set. That
used to be a literal alternation in `chart-family.js`, and it was the hand edit
whose omission failed SILENTLY: the kernel ran, the figure was built, and the
slide rendered it full-bleed with no frame.

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

### Motion in a file you FORWARD

`motion:` decides whether the deck animates. **`player-motion:` decides whether an
exported `--player` file carries that motion**, and it defaults to inheriting
`motion:` — so a deck that animates on the Playground animates for a recipient too,
with nothing new to set.

They are separate keys because they answer different questions. The exported file is
what leaves the building: motion there costs bytes in an artifact somebody may open
offline, and it changes what the recipient sees without the author present to frame
it. An author who wants the build while presenting and a still in the board pack
writes:

```yaml
---
motion: on
player-motion: off
---
```

**The PDF and PPTX are unaffected either way** — print always renders the final
frame, so every existing deck stays byte-identical. And a deck with no chart and no
authored scene ships no motion code at all.

**Reduced motion behaves the same everywhere.** A viewer whose system asks for reduced
motion still sees the build: the tier is *reduce*, not *remove*, and a staggered fade
carries no vestibular trigger — so the exported file matches the Playground rather than
diverging from it. Charts carry no playback control on any surface, so there is no
per-viewer pause. When that matters for a particular audience, send them the still.

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

### What each member is drawn with is a manifest field, not this table

The Motion column above is a consequence, not a cause: a member gets a scene when
it has an `<svg>`, and gets none when it doesn't. That underlying fact — SVG,
HTML, or both — is declared per component as `render`, with a `renderNote`
justifying it, and is **derived from the rendered export and gated**
(`npm run check:render-nature`; the coverage half runs inside `build:check`). Read
it there rather than inferring it here: the manifest is checked against reality
every time the gate runs, and a prose table is not.

Today the family splits seven SVG (`funnel`, `gantt`, `map`, `piechart`,
`quadrant`, `radar`, `word-cloud` — plus `diagram`, which is SVG but is not a
member of this family), two hybrid (`journey`, `state-chart`), and four HTML
(`kanban`, `progress`, `roadmap`, `timeline-list`).

`radar` and `word-cloud` were hybrid until 2026-07-27, each by a single small
label: radar's small-multiple captions were HTML `<figcaption>`s beside the minis,
and word-cloud's size key was an HTML rail over the canvas. Both moved into their
viewBoxes — see `engineering/decisions/2026-07-27-chart-family-all-svg.md`. Every
chart that draws SVG at all now draws ALL of it.

The two remaining hybrids are hybrid for structural reasons, not for a stray
label, and each `renderNote` names its seam:

- **state-chart** — the authored `<ol>` is the measuring harness the browser pass
  needs before it can route edges; once painted the list is hidden, so a DEFAULT
  slide ends up SVG in practice. The hybrid verdict comes from the `inline`
  variant, whose chip row is never painted over.
- **journey** — an HTML board (a table of text that must wrap and reflow) with an
  SVG mood curve and mood faces drawn across it. Neither side animates: journey
  emits no motion roles at all (the table above says the same from the other
  direction).

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

Every chart kernel exports ONE entrypoint, and this signature is the ratified
one (LPM Phase 1):

```js
transformSection(html, ctx) -> html | { html, cls } | null
```

- **`html`** — the section's inner HTML. The kernel splices its figure back in
  and returns the whole section, not the figure alone.
- **`ctx`** — `{ cls, classTokens, orientation, utils }`. `orientation` is the
  deck-wide `'portrait' | 'square'` stamp (absent for landscape) read off the
  section's `data-orientation`. `utils` carries the shared section helpers
  (`spliceFirstList`, `stripTrailingPills`, `readsHandBody`, `escAttr`,
  `escHtml`, `plainText`, `extractFirstList`, `parseTopLevelLis`,
  `findMatchingClose`) so a dropped-in kernel takes them off its argument
  instead of guessing a relative path.
- **Return** — the rewritten section HTML; `{ html, cls }` when the kernel must
  also change the section's class list (only `roadmap` does, auto-selecting
  `horizons` on a portrait deck because the card CSS is gated on the section
  class); or the html unchanged / `null` to pass through.

**Idempotence is the family's job, not the kernel's** — `transformChartSection`
early-returns on a section that already carries `chart-frame`.

A kernel names a different entrypoint by declaring `kernel.entry`; nothing
first-party does.

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

## History

The kernels used to be split two ways: `radar` / `quadrant` / `state-chart` /
`funnel` / `map` / `journey` / `word-cloud` / `roadmap` lived in their own
component folders, while `progress` / `timeline-list` / `piechart` / `gantt` /
`kanban` / `matrix-grid` were inlined in `chart-family.js` — historical, because
the inline ones were written before per-component transforms were a pattern.
Every kernel now lives in its own folder and the dispatch is manifest-driven.
See `engineering/decisions/2026-09-01-manifest-driven-chart-dispatch.md` (and
`2026-05-17-chart-family-refactor.md` for the original design).

---

## See also

- `lib/components/chart/{progress,timeline-list,piechart,gantt,kanban,radar,quadrant,state-chart,funnel,map,journey,word-cloud,roadmap,matrix-grid}/<name>.docs.md` — per-component contracts and variant catalogs.
- `lib/shared/shared.docs.md` — the contrast: small composable
  modifiers (`compact`, `loose`, `accent`) that compose with all
  layouts, not just chart components.
