# Lattice layouts — evidence, chart



> Metrics, stat rows, and every series-data visualization.



**Contents:** `kpi` · `stats` · `_chart-family` · `bar` · `bullet` · `funnel` · `gantt` · `journey` · `kanban` · `line` · `map` · `matrix-grid` · `piechart` · `progress` · `quadrant` · `radar` · `roadmap` · `scatter` · `slope` · `stacked-bar` · `state-chart` · `timeline-list` · `waterfall` · `word-cloud`



## kpi

> Executive KPI system — one base, five layout modifiers.

**Function** evidence · **Form** ledger · **Substance** structure

**Tags** `dashboard` · `scorecard` · `metric` · `okr`

Use for KPI dashboards with status framing — current value, target, trend, attention-needed. Bare `kpi` resolves to the briefing layout; the five modifiers tune the visual emphasis for different audiences (ops, compliance, investor, headline).

### Agent contract

**Capacity** ~3 items at a wide @size (over 4 overflows) — past that, stats / split across slides. A 4th metric needs one pill, no eyebrow, and a one-line title.

**Density** aim ~8 words per item; past ~14 it reads as a wall of text — a metric label, not a sentence.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the KPI group. |
| `eyebrow` | `p > code` | no | Optional inline-code eyebrow above the heading — mono, tracked uppercase (e.g. `Financial · Q4 2026`). Authored as an inline-code paragraph, not a heading, so it stays lint-safe (no heading-order violation). |
| `kpis` | `ol > li` | yes | One li per KPI, authored as an ordered list (`1.`). The lead is the metric value (the big number) — it renders in display type automatically (no `**…**` needed); follow it with nested bullets for the metric name, target/trend, and status pills. The value still renders big with no nested bullets, but the tile has no metric-name label under it — always nest at least one. |

#### Variant decision rule

- **default (no modifier).** Board or investor reviews — the briefing default: one hero metric left, three hairline supports right.
- **`attention`.** One metric is off-plan and needs to visually stand out — flags the hero tile in warn color rather than treating every metric equally.
- **`ops`.** SRE/SLO reviews — a 2×2 grid of equally-weighted metrics against service-level targets.
- **`compliance`.** Auditor or regulator packs — a vertical list with a source/citation footer, framed for legal review.
- **`trajectory`.** Investor or period-over-period stories — four cards emphasizing the delta (up/down), not just the current value.
- **`spotlight`.** A single hero metric with supporting body copy — monumentalizes one number rather than balancing several equally.

#### Common mistakes

- **A KPI's lead value has no nested bullets beneath it, e.g. a bare `1. $2.4B` with nothing indented under it.** A bare value still renders as the big display number (slot-label-lift auto-bolds every top-level `li` lead regardless of nested content) — but with no nested bullet there's no metric-name label under it, so the number reads without context. Nest at least the metric-name bullet beneath each value.
- **Eyebrow paragraph placed after the heading instead of before it, or written as plain/bold text instead of inline code.** The eyebrow is the section's first child — an inline-code-only paragraph before the `## heading` — keep it first and backtick-wrapped, or it won't get the mono/uppercase eyebrow treatment.

### When to use

- **Status framing matters as much as the number.** Reach for kpi when the audience needs value, target, trend, AND status indicator together. For ungoverned metric rows use stats; for a single hero number use big-number.
- **Pick the modifier from the audience.** Board / investor reviews use the bare briefing default. SRE / SLO reviews use `ops`. Auditor / regulator packs use `compliance`. Year-over-year growth stories use `trajectory`. A single hero metric with body copy uses `spotlight`.
- **One contract across all five.** Every modifier reads the same `` `eyebrow` `` / `## headline` / `1. value` / nested bullets / status pills authoring contract. Switching modifiers should never require rewriting the prose.

### When NOT to use

- **Decorative pills without status semantics.** The pills read as status, not freeform tags. Status color is assigned by each KPI's row position within the modifier — the engine never reads the pill text — so reserve them for the status vocabulary the position implies (`On plan`, `At risk`, `Breaching`, `Compliant`, `Remediating`). Arbitrary labels land a color that has nothing to do with the words.
- **A fifth metric — or a fourth that is not terse.** The supports divide whatever the title and eyebrow leave them, so count trades against label length. Measured at a **wide** @size — the box a deck is authored in, and the one where nothing paginates past the budget: three is the allowance, and a short label plus a target line fits up to a two-line title, with or without an eyebrow. A fourth needs everything terse — one status pill, no eyebrow, a one-line title. A fifth fits at no label length. Past that the ledger spills, and the export clips it and names the page — nothing shrinks silently to make room. Split across slides, or use `stats`, which drops the targets and pills and holds more rows. (A portrait or square deck paginates instead of clipping, so a long ledger there is divided into a run rather than cut.)
- **Reaching for attention or spotlight to carry a fifth metric.** `attention` highlights the metric that needs the room; `spotlight` monumentalizes one number. Both spend most of the stage on a single tile, so past four the hierarchy they exist to create collapses — split into two slides rather than crowding the hero.
- **No targets, no trends.** If the KPIs carry only current values, the slide is a stats row, not a kpi dashboard. Use stats and reclaim the room.

### Authoring

```markdown
<!-- _class: kpi -->

## Revenue ahead of plan; margin and cash both expanded.

1. $2.4B
   - Total revenue
   - target $2.2B · +9% `On plan` `Board`
2. 42%
   - Gross margin
   - +2pp QoQ `On plan` `Audit`
3. $1.1B
   - Cash & equivalents
   - +$180M QoQ `On plan` `Investor`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  ┌────────────┐  SUPPORTING KPIS        │
│  │ $2.4B      │  42%  margin     ✓      │
│  │ hero       │  $1.1B cash      ✓      │
│  │ metric     │  +18% YoY        ✓      │
│  └────────────┘                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `attention` — attention

Flags the tile that misses.

```markdown
<!-- _class: kpi attention -->

## attention flags the tile that misses.

1. 1
   - tile flagged
   - the miss `Attention`
2. 3
   - tiles steady
   - for context `On plan`
3. 0
   - alarms hidden
   - honesty `Board`
4. 4
   - tiles total
   - the row `On plan`
```

#### `ops` — ops

Reads the tiles against SLOs.

```markdown
<!-- _class: kpi ops -->

`kpi ops`

## ops reads the tiles against SLOs.

1. 99.9%
   - the SLO frame
   - target line `SLO`
2. 4
   - tiles per row
   - unchanged `On plan`
3. 1
   - breach shown
   - never hidden `Ops`
4. 30d
   - the window
   - rolling `SLO`
```

#### `compliance` — compliance

Tallies findings per framework.

```markdown
<!-- _class: kpi compliance -->

`kpi compliance`

## compliance tallies findings per framework.

1. 0
   - open findings
   - the goal `Clean`
2. 4
   - frameworks tracked
   - one row `Audit`
3. 1
   - in remediation
   - dated `Watch`
```

#### `trajectory` — trajectory

Pairs each tile with its delta.

```markdown
<!-- _class: kpi trajectory -->

`kpi trajectory`

## trajectory pairs each tile with its delta.

1. +9%
   - the delta leads
   - vs plan `Up`
2. 4
   - tiles still rule
   - per row `On plan`
3. −2
   - down is shown
   - not spun `Honest`
```

#### `spotlight` — spotlight

One tile earns double width.

```markdown
<!-- _class: kpi spotlight -->

## spotlight gives one tile double width.

1. 1
   - tile promoted
   - the headline `Spotlight`
2. 2
   - support tiles
   - beside it `On plan`
3. 0
   - competing heroes
   - one only `Rule`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`stats`](#stats) — metric row without targets or status pills
- `big-number` — a single number is the whole argument
- `split-panel` — one KPI with a paragraph of supporting prose
- [`progress`](#progress) — completion percentages across parallel workstreams
- [`timeline-list`](#timeline-list) — milestones in time, not metrics at a moment

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/evidence/kpi>


## stats

> Row of 3–5 stat tiles, each with a big number and a label.

**Function** evidence · **Form** stack · **Substance** structure

**Tags** `dashboard` · `metric` · `percentage`

Use for at-a-glance metric rows — quarterly results, headline KPIs. Each tile reads as Big Number + caption.

### Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, kpi / split across slides. The row compresses and numbers shrink past five tiles.

**Density** aim ~8 words per item; past ~14 it reads as a wall of text — a metric label, not a sentence.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the metrics. |
| `subtitle` | `p > code` | no | Optional inline-code paragraph (eyebrow before the h2, or caption after it). Styled by the generic `> p`/`> em` rule, not a dedicated `p > code` rule. |
| `tiles` | `ol > li` | yes | One li per stat tile, authored as an ordered list (`1.`). The lead is the number (it renders in display type automatically — no `**…**` needed); the caption is a nested bullet beneath it:     1. 73%        - faster close The number still renders big with no nested caption, but the tile has no label under it — always nest a caption. |

#### Common mistakes

- **A stat's number has no nested caption bullet beneath it.** A bare number still renders as the tile's big display number (the lead auto-bolds and is styled hero-sized regardless of nested content) — but with no nested caption there's no label under it. Nest a bullet directly beneath each number for its caption.
- **Writing the subtitle/eyebrow line as plain text instead of inline code.** Stats' subtitle DOES change styling depending on backtick-wrapping: a backtick-wrapped, code-only paragraph adjacent to the heading gets lifted into the masthead and picked up by the shared eyebrow/subtitle rule (secondary color, message size); plain unwrapped text instead stays in the body and matches stats' own generic paragraph rule (label color, body size) — a visibly different color and size. Wrap it in backticks for the masthead treatment.

### When to use

- **Three to five headline metrics.** Quarterly results, pilot outcomes, year-end summary — anywhere a small set of independent numbers tells the story together. Each tile reads as a `big-number` in miniature.
- **Numbers are the headline.** Lead with the number, follow with a one-line caption. The tile is for the metric and a label, not for explanation; if the caption wants a sentence, use `kpi` or `split-panel metric` instead.
- **Independent metrics, not parts of a whole.** Stats rows are for headline KPIs that don't sum to anything — close rate, recall rate, dollars saved, days cut. For part-to-whole breakdowns reach for `piechart`.

### When NOT to use

- **Six or more tiles.** Past five tiles the row compresses and the numbers shrink below boardroom legibility. Split into two rows or move to `kpi` where the dashboard grid gives each metric its own card.
- **Tiles with no number.** If a tile is mostly prose with a small number, the visual hierarchy inverts and the row reads as a list. Stats is for **bold-number + caption** — anything more belongs in `cards-grid`.
- **Status framing without pills.** If each metric needs a target, a trend, and a status indicator, you're authoring a dashboard, not a stats row. Move to `kpi`, which carries that vocabulary.

### Authoring

```markdown
<!-- _class: stats -->

`Impact · Pilot Results`

## Six months of results across four product teams.

`Measured against pre-framework baseline, same teams, same market conditions.`

1. 73%
   - faster close
2. 4.2×
   - signal recall
3. $1.2M
   - prevented losses
4. −18d
   - avg cycle time
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│            Stats row heading            │
│                                         │
│    42×          87%          3.2k       │
│   growth      uptake        users       │
│                                         │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `big-number` — one number is enough to carry the slide
- [`kpi`](#kpi) — metrics need targets, trends, and status pills
- `split-panel` — one focal KPI with a paragraph of supporting prose
- [`piechart`](#piechart) — the numbers are parts of a whole, not independent
- [`progress`](#progress) — the metrics are completion percentages across workstreams

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/evidence/stats>


## chart-family

Lattice's chart engine. A shared rendering subsystem used by twenty-one
chart-class components: `progress`, `timeline-list`, `piechart`,
`gantt`, `kanban`, `radar`, `quadrant`, `state-chart`, `funnel`, `map`,
`journey`, `word-cloud`, `roadmap`, `matrix-grid`, and the seven CARTESIAN
members — `bar`, `stacked-bar`, `line`, `waterfall`, `scatter`, `slope`,
`bullet` — which share a second substrate of their own (see § The Cartesian
substrate below).

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

### The `.chart-frame` skeleton

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

### Sizing: the SVG's own box is container-relative, its interior is not

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

### Legend / key system

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

### Standalone export — one chart as a self-contained `.svg`

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

### Membership

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

### Motion + mark-detail support, by member

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

#### Motion in a file you FORWARD

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

#### What each member is drawn with is a manifest field, not this table

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

#### The radar's asymmetry is deliberate

The radar's series polygons declare `data-anima-role` and deliberately carry **no**
`data-mark`. The radar's mark namespace belongs to its **axis labels** — the
popover keys each axis's detail template by that index — so a mark on a polygon
would shift the map and open the wrong detail. `chartToScene` therefore collects
`[data-mark], [data-anima-role]` and partitions by role, which lets a mark animate
without claiming a popover index.

#### In-diagram labels wrap

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

Two more properties come out of the same pass, and both are about what a reader
takes off the finished picture rather than about fitting boxes.

**A name that had to travel is joined back to its mark by a hairline.**
`leaderLine` in the same module emits it and takes its class from the caller;
`scatter` and `quadrant` both draw `.chart-leader`, painted once in
`chart-family.css` § Label leaders. It is drawn only when the label is further
from its mark than a first-ring seat, because a connector between two things
that are visibly together is noise. The reason it is not optional: on a crowded
plot ADJACENT stops meaning NEAREST — six of the fourteen names on the quadrant
stress slide sit closer to another initiative's dot than to their own.

**A column of labels never contradicts the marks it names.** Two names stacked
in one column are read top-to-bottom as an order whether the pass meant one or
not, so a candidate position that would read backwards against a label already
in that column costs `ORDER_COST` — added to the ANCHOR preference, never to the
collision score. The pass answers with a different position, and when every
clear position reads backwards it takes one rather than drop a name. Order is
worth an anchor; it is never worth a name.

See `engineering/decisions/2026-07-26-svg-chart-labels-motion.md` for why
`<tspan>` and not `<foreignObject>`, who owns the font size, and (§14) why
placement is a choice of position rather than a nudge; and
`engineering/decisions/2026-09-06-label-attribution-and-order.md` for the two
properties above, their measurements, and why the fixed-pitch repack `slope`
uses does not port to a plot its labels share with everything.

---

### The Cartesian substrate

Seven members plot a value against an axis: `bar`, `stacked-bar`, `line`,
`waterfall`, `scatter`, `slope`, `bullet`. They landed together, and they share
`_chart-family/cartesian.js` on top of everything above.

**Why a second shared layer.** Until these arrived the family had no Cartesian
chart at all — every member either drew a bespoke geometry (the funnel's
trapezoids, the radar's spokes, the pie's wedges) or laid out boxes. The gantt
is the only one that ever computed an axis, and its tick code is private to it
and keyed to time. Seven charts added one at a time would have minted seven
private tick generators, seven gutter conventions and seven gridline weights —
seven charts that look like seven products. The existing bespoke geometries get
away with having none of this because none of them shares furniture with
another; a plot is the opposite case.

**What it owns**

| | |
|---|---|
| `parseSeries` | the series DSL — one authoring shape, two depths |
| `niceTicks` · `niceStep` | the 1 / 2 / 2.5 / 5 / 10 ladder, with `tight` and `target: 'auto'` |
| `linearScale` · `bandScale` · `pointScale` | the three scales a plot needs |
| `plotBox` · `viewFor` | one gutter convention, one viewBox per orientation |
| `buildGrid` · `buildValueTicks` · `buildCategoryLabels` · `buildAxisRule` · `buildAxisTitle` | the painted chrome |
| `axisFormatter` · `markFormatter` | the axis speaks one magnitude; a mark keeps its own precision |
| `buildFillDefs` | the canonical rectangular fill, as SVG `<defs>` |
| `buildSvgRoot` | the one `<svg>` root, so the `role="img"` contract cannot be dropped |

It owns **no color and no marks**. Paint lives in `chart-family.css`
§ Cartesian chrome (the `.cart-*` classes); the marks are each member's own
geometry.

**Three things a new Cartesian member must know**

- **Pass `pitch` to `buildCategoryLabels` on a row chart.** Without it the
  vertical branch culls a colliding name, and a dropped category name is
  invisible data loss. With it the budget comes from the row height and a long
  name ellipsizes instead.
- **`buildAxisRule` draws at the plot EDGE**, which is the zero line only while
  every value is positive. On a signed chart the reference is the `.cart-zero`
  rule `buildGrid` already emits; drawing both paints a second, false baseline.
- **`parseSeries` reads ONE pill per item.** A member whose item carries a
  value *and* a status (`waterfall`, `bullet`, `scatter`) parses its own list
  with `stripTrailingPills` + `parseValue` + `affixOf` instead.

Full reasoning: `engineering/decisions/2026-09-06-cartesian-chart-expansion.md`.

### Kernel contract

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

### Three-renderer parity

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

### Why HTML-string transforms, not markdown-it rules

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

### History

The kernels used to be split two ways: `radar` / `quadrant` / `state-chart` /
`funnel` / `map` / `journey` / `word-cloud` / `roadmap` lived in their own
component folders, while `progress` / `timeline-list` / `piechart` / `gantt` /
`kanban` / `matrix-grid` were inlined in `chart-family.js` — historical, because
the inline ones were written before per-component transforms were a pattern.
Every kernel now lives in its own folder and the dispatch is manifest-driven.
See `engineering/decisions/2026-09-01-manifest-driven-chart-dispatch.md` (and
`2026-05-17-chart-family-refactor.md` for the original design).

---

### See also

- `./<name>.md` — per-component contracts and variant catalogs.
- `lib/shared/shared.docs.md` — the contrast: small composable
  modifiers (`compact`, `loose`, `accent`) that compose with all
  layouts, not just chart components.


## bar

> Bars from a zero baseline that compare magnitude across categories — as columns, rows, side-by-side groups, or signed off a centered zero.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Bars, grid, axis, category labels and the printed values are one `<svg>`. A bar chart is a claim about LENGTH measured from a shared zero, so every mark and every label has to be placed in one coordinate system — assembled boxes would let the baseline drift and the comparison would quietly stop being true.

**Tags** `metric` · `ranking` · `contrast` · `board-deck`

Use when the claim is that these categories differ in size: revenue by region, headcount by team, spend by line item, variance against plan. Length from a common zero is the most accurately read encoding there is, so the bar is the default answer whenever the question is 'which is bigger, and by how much'. Values are printed on the bars and the value axis is dropped whenever that fits.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the takeaway, not the chart ('Growth is concentrated in EMEA', not 'Revenue by region'). |
| `categories` | `ul > li` | yes | One li per category, in the order they should read. Lead text is the category name, the trailing inline-code pill is the value — `EMEA \`4.2\``. Commas, currency symbols, units and magnitude suffixes are all read: `$4.2M` is 4 200 000 and the `$` and the magnitude carry onto the axis. A negative value hangs below (or left of) the zero rule. Three to eight categories read best. |
| `series` | `li > ul > li` | no | Nested items whose trailing pill is a NUMBER are the grouped form: each category gets one bar per series, side by side, and a key names them. Two to four series; past four the group gets too dense to compare across categories. |
| `detail` | `li > ul` | no | Nested items whose trailing pill is NOT a number (or that carry no pill) are per-category detail, not data. They render nowhere on the chart face: they drive the Present-mode reveal popover and fold into the slide's speaker note, so a chart with detail is pixel-identical to one without. This is the same detail-vs-data rule every Cartesian member shares. |

#### Variant decision rule

- **default (no modifier).** Short category names — a quarter, a product, a region code. Columns read left-to-right as a sequence, which suits anything with a natural order.
- **`row`.** Category names are long, or there are more than about seven of them. A row label reads on one line in the gutter instead of wrapping into a narrow band, so nothing gets shortened. Reach for it the moment a name is longer than about fifteen characters.
- **`grouped`.** Two to four series measured on the same scale across the same categories — this year vs last, plan vs actual. Authored as a nested list; the nesting is what selects it.
- **`diverging`.** Values carry a sign and the direction is the point: variance to plan, sentiment, a tornado / sensitivity chart. Zero sits at the middle of the plot and the two sides share one scale.

#### Common mistakes

- **Adding a `grouped` class and leaving the list flat.** The grouped form is selected by the DATA, not the class: nest the series under each category with numeric pills. A `grouped` token on a flat list draws the ordinary single-series chart rather than an empty one.
- **Expecting the value axis to appear on a small chart.** The chart prints each value on its own bar and drops the axis and gridlines whenever those labels fit — the number is right there, so a second way to read it is redundant chrome. The axis returns only when a label would no longer fit the room it has: its whole band in a single-series column chart, or just its own bar's slot when the bars are grouped. A row chart never needs it, because its values print into a gutter sized to hold them.
- **Writing values in mixed units, like `$4.2M` next to `3100000`.** Both parse to a number, but the axis affix is only adopted when EVERY value agrees on it — a mixed series gets a bare axis and loses the currency. Author one vocabulary for the whole list.
- **Reaching for `diverging` just because one value happens to be negative.** The ordinary form already hangs a negative bar below the zero rule with the axis extended to cover it. `diverging` is a stronger claim — it centers zero, gives both sides the same reach, and colors by sign — so use it when direction IS the story, not merely when a minus sign appears.

#### Data shape

- The value pill is a number with optional currency prefix, thousands commas, magnitude suffix and unit: `$4.2M`, `12,400`, `68%`, `-3.1`. The magnitude suffix is SCALE, not decoration — `1.2M` is 1 200 000 — so `800k` and `1.2M` sit correctly on one axis.
- A negative value is legitimate in every form and hangs from the zero rule; the axis is widened to include it. Zero is legitimate too and draws no bar, with its value printed on the baseline.
- Bars are drawn in AUTHORED order, never re-sorted. Sort the list yourself when ranking is the story; leave it in natural order when the categories have one (quarters, stages, sizes).
- In the grouped form, a category that is missing one series simply draws fewer bars in that group rather than a zero — an absent measurement and a measured zero are different claims.
- A category name that will not fit its column band on two lines is not shortened: the chart switches itself to the row form, where the name reads in the gutter. How long is too long depends on how many categories share the width — about forty characters at four categories, about twenty at eight — so `row` is worth asking for outright whenever the names are business units, product lines or people.

### When to use

- **The claim is a difference in magnitude.** A bar earns its place when the audience should leave knowing which category is biggest and roughly by how much. Length from a shared zero is read more accurately than angle, area or color, which is why this beats a pie for anything that is not parts of one whole.
- **Three to eight categories.** Two categories is a ratio — say it as a `big-number` or a two-tile `stats`. Past eight the names crowd even in the row form and the reader stops comparing and starts scanning; consolidate the tail into 'Other'.
- **Long names mean `row`.** Column labels wrap into the width of one band, so a name past about fifteen characters is shortened or dropped. The row form puts the name in a wide left gutter where it reads on one line. When the names are business units, product lines or people, start from `row`.
- **One value per category, or two to four series.** The flat list is the single-series chart. Nesting numeric children turns it into the grouped form for a plan-vs-actual or year-over-year comparison. Past four series the bars inside a group get too thin to compare across groups — split the slide or switch to a small multiple.

### When NOT to use

- **Parts of one whole.** If the categories add up to a total and the split is the story, use `piechart` or `stacked-bar`. A plain bar says nothing about it.
- **A continuous series over time.** Twelve monthly bars ask a reader to compare twelve lengths when the claim is a trend. Use `line`, whose job is the movement.
- **A percentage against a target.** '68% of goal' is attainment, not magnitude across categories. `progress` shows attainment; `bullet` adds the target and the band.
- **A rainbow single series.** One series is one hue by design: the length carries the comparison. Color earns its place in `grouped`, where it names the series.

### Authoring

```markdown
<!-- _class: bar -->

## Which category is biggest.

- First `120`
- Second `86`
- Third `54`
- Fourth `31`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│       Growth sits in two regions.       │
│                                         │
│              $4.2M  $3.1M               │
│           [####] [###]  $1.8M           │
│       [####] [###]  [##]   $0.6M        │
│        [####] [###]  [##]   [#]         │
│      -----------------------------      │
│       N.Am   EMEA   APAC   LATAM        │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `row`

Horizontal bars with the category name in a wide left gutter — the correct form whenever the names are long or numerous.

```markdown
<!-- _class: bar row -->

## Support load sits with two teams.

- Platform Engineering `1,240`
- Customer Success `980`
- Data & Analytics `410`
- Design Systems `260`
- Developer Relations `95`
```

#### `grouped`

Two to four series side by side in each category, selected by nesting numeric children under each category.

```markdown
<!-- _class: bar grouped -->

## We beat plan everywhere but APAC.

- Americas
  - Plan `3.2`
  - Actual `3.9`
- EMEA
  - Plan `2.6`
  - Actual `3.1`
- APAC
  - Plan `1.9`
  - Actual `1.4`
```

#### `diverging`

Signed values off a centered zero rule, both sides on one scale — the variance and tornado form.

```markdown
<!-- _class: bar diverging row -->

## What moves the forecast, and which way.

- Renewal rate `+2.4`
- Enterprise pipeline `+1.6`
- Price realization `+0.7`
- Services attach `-0.5`
- Churn in mid-market `-1.8`
- FX exposure `-2.9`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`progress`](#progress) — attainment against 100% rather than magnitude against each other
- [`piechart`](#piechart) — parts of a single whole, where the shares sum to one total
- [`funnel`](#funnel) — each stage is a subset of the one before and the drop-off is the story
- [`stats`](#stats) — a row of headline figures with no like-for-like comparison between them
- `big-number` — one figure is the whole slide

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/bar>


## bullet

> Actual against target inside a qualitative band — one dense row per KPI.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — One SVG because three of the four marks in a row share one scale: the target is a tick at a VALUE, the qualitative zones tile that same value axis, and the measure is read against both. HTML boxes can express one bar against an implicit 0-100 domain; they cannot put a threshold and a banded scale in the same coordinate system.

**Tags** `metric` · `okr` · `scorecard` · `assessment`

Use when the question is 'are we on plan'. Each row carries a measure bar, a perpendicular target marker, and up to four neutral range zones behind them, so a reader sees attainment, threshold and context in one glance. Six KPIs fit where six gauges would not.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the verdict ('Three of five are behind plan'), not the chart type. |
| `eyebrow` | `p > code` | no | Optional eyebrow caption above the heading. |
| `subtitle` | `p` | no | Optional plain subtitle after the heading. |
| `rows` | `ul > li` | yes | One li per KPI. Lead text is the KPI name, then two trailing inline-code pills — the measure first, the target second: - New ARR `4.2M` `5.0M`. Magnitude suffixes scale (`4.2M` is 4 200 000), the unit affix carries onto the axis, and both printed values are normalized to one magnitude per chart. A row with only one pill draws a bare bar with no marker and no range. |
| `range` | `li > ul` | no | Optional nested sublist, each child a NAME plus a value pill. `Target` (or `Plan`/`Goal`) overrides the second pill; `Actual` (or `Measure`) overrides the first; each `Band` (or `Range`) adds one internal cut point, so two Bands make three zones and three is the ceiling — past that the cuts NEAREST the target are the ones kept; `Floor` (or `Base`) starts the row's scale above zero, which is what a near-100% KPI — uptime, NRR, renewal rate — needs to show any movement at all. Every other nested bullet is mark detail: the Present-mode reveal payload and the PDF speaker note. That includes a bullet whose pill IS a number under an unrecognized name, so context never becomes a phantom band. Omit the sublist and the zones are derived from the target at 60% and 85%. |

#### Variant decision rule

- **default (no modifier).** Always, unless you have looked at the rendered chart and disagree with the axis it chose. The kernel shares an axis when the rows agree on their affix and sit inside one magnitude, and gives each row its own otherwise.
- **`shared-axis`.** The rows are the same measure at different scales and the LENGTH comparison between bars is the point. Refused on a chart carrying a `Floor`, because a floored row and a zero-based row are not one ruler.
- **`own-axis`.** The rows share a unit but not a meaning — five percentages of five different things — and you want every plan tick on one vertical line.

#### Common mistakes

- **Writing the target pill first, as `- New ARR `5.0M` `4.2M``.** Pills read measure first, target second — the order you would say it out loud ('4.2 against 5.0'). Reversing them is a silent break, not a tolerated variation: the bar draws at the target and the marker at the actual, so a missed number renders as a beat.
- **Adding a nested `- 60%` bullet expecting it to become a range boundary.** A nested value is structural only when it is named: `- Band `60%``, `- Target `80%``, `- Actual `72%``. Anything else — including a bare number — is mark detail, so the reveal payload and the speaker note stay usable for context.
- **Mixing `4.2M` and `$4.2M` across rows to mean the same thing.** The shared axis is adopted only when every row agrees on its affix, so one inconsistent `$` silently drops the whole chart onto per-row scales. Write the unit the same way in every row, or in none.
- **Expecting the printed values to come out exactly as they were typed.** They are normalized to one magnitude — per chart when the rows share an axis, per row when they do not — so `900k` beside `1.2M` prints as `0.9M` and `1.2M`, and a row scaled in hundreds of thousands prints `250k` even if you typed `0.25M`. That is deliberate: two magnitudes for one quantity make a reader re-scale between the measure and the target it is being compared with. Write the numbers however you like; read the chart for the shape.

#### Data shape

- Two pills per row, measure then target, in one consistent unit across every row — the affix is what decides whether one axis can honestly describe them all.
- Keep the row domains within about 4x of each other if you want a shared axis; a 5.0M target beside a 0.2M target compresses the second row into a stub, and the chart falls back to per-row scales.
- Explicit `Band` boundaries are ascending INTERNAL cut points, not zone widths: two Bands make three zones, the ceiling is three cuts (four zones) and past it the cuts nearest the target are kept, and the last zone always runs to the top of the row's scale.
- A measure past the top of its range is drawn past it, on bare track — that overshoot is the read, so do not clamp values to their range.
- Every row must be higher-is-better. There is no inverted mode; restate a cost or a cycle time as the thing you want to grow.
- A `Floor` puts that row's scale above zero, so its bar LENGTH is no longer proportional to its value — the origin is drawn as a visible edge, and the whole chart drops to per-row scales because a floored row and a zero-based row are not the same ruler.
- Five rows is the sweet spot and seven the ceiling, measured on the landscape box: seven still hold a legible track and a full-width KPI name, and the eighth thins the track past where the measure reads against its zones. A KPI name gets one line beside its readout and ellipsizes rather than wrapping at about 56 characters. These are guidance numbers, not a split axis: like every chart in the family a bullet is a GRAPHIC, so it never paginates — an overflowing chart wants fewer rows.

### When to use

- **The target is the point.** A board asks 'are we on plan', not 'how big is it'. A bullet row answers both at once: the bar is the magnitude, the tick is the plan, and the gap between them is the story. Without a target you have a bar chart, and `bar` says that better.
- **Several KPIs, one scan.** Three to six KPIs of the same shape — quarterly plan attainment, SLO compliance, an OKR set. The rows stack, the marks align, and the reader sweeps a column of target ticks instead of reading six separate gauges.
- **Qualitative context matters as much as the number.** When 'behind plan' has grades — merely short versus genuinely off — the range zones carry that without a word of prose. Author them with nested `Band` bullets when the grades are real thresholds (an SLO, a rating scale); let them derive from the target when they are just 'short / close / there'. A KPI that lives near 100% — uptime, net revenue retention, renewal rate — adds a `Floor` so the scale starts where the movement is.

### When NOT to use

- **No target to measure against.** A row with one pill draws a bar with no marker and no range — every mark that makes it a bullet is gone. Use `bar` instead.
- **One KPI on its own.** A single row spends a whole slide on two numbers. Use `big-number`, or `stats` for a short row. This chart earns its density.
- **Red/amber/green range bands.** The zones are one neutral on purpose: a traffic-light range re-states the verdict the target marker already carries.
- **A KPI where lower is better.** Cost against budget, churn against a ceiling: the bar grows past the marker, so beating the target reads as missing it.

### Authoring

```markdown
<!-- _class: bullet -->

## Are we on plan.

- First KPI `4.2M` `5.0M`
- Second KPI `3.6M` `3.0M`
- Third KPI `1.1M` `2.4M`
```

### Variants (component-specific)

#### `shared-axis` — shared-axis

Forces one value axis across every row, even where the kernel would have chosen per-row scales. Use only when the rows really are the same ruler and you want the bars comparable by length.

```markdown
<!-- _class: bullet shared-axis -->

## shared-axis puts every row on one ruler.

- New ARR `4.2M` `5.0M`
- Expansion ARR `3.6M` `3.0M`
- Gross renewal `2.8M` `2.6M`
```

#### `own-axis` — own-axis

Forces per-row scales, so every target tick lands on one x and the bars are read against the plan line rather than against each other. Use when the rows are different measures that happen to share a unit.

```markdown
<!-- _class: bullet own-axis -->

## own-axis lines the plan up and lets each row keep its scale.

- Qualified pipeline `128%` `100%`
- Win rate `112%` `100%`
- Ramped reps `96%` `100%`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`progress`](#progress) — percent-complete with a status verdict and no target or range — HTML bars, so no marker and no band, but the row carries a status pill and a note the bullet has no room for
- [`bar`](#bar) — magnitudes compared against each other rather than against a plan
- `big-number` — one figure against its target is the entire slide
- [`stats`](#stats) — a row of independent headline metrics with no shared scale
- [`gantt`](#gantt) — the rows are time-bound work, not measures against a threshold

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/bullet>


## funnel

> Tapering stages that show where a flow drops off, with the conversion rate between each.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Bands, labels, values and the conversion percentages are all one `<svg>`. A funnel is a geometric claim — each band's width IS the conversion rate — so the taper has to be drawn in one coordinate system rather than assembled from boxes that happen to line up.

**Tags** `percentage` · `sequence` · `pitch`

Use for a pipeline that narrows — a sales / conversion funnel, a hiring or grant pipeline, an onboarding flow. Each stage's band width is proportional to its value; the stage-to-stage conversion % is printed in the gaps so the leak is the read.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the flow and, ideally, the takeaway (‘Where the pipeline leaks’). |
| `stages` | `ul > li` | yes | One li per stage, in flow order (widest first). Lead with the stage label, then a trailing inline-code value — `Signups \`4,800\``. Commas and units are tolerated; the largest value sets full width. Three to seven stages read best. |
| `detail` | `li > ul` | no | Optional nested sublist under a stage. Drives two surfaces from one source (shared with pie/map/quadrant via the chart-family mark-detail substrate): (1) Present/Practice — the kernel tags the stage `<polygon>` with `data-mark` and emits the sublist as an inert `<template class="chart-detail">` the reveal layer reads; (2) the static PDF — the same detail is folded into the slide's speaker note (`Label (value): item · item`) as a Marp-faithful comment that notes-core lifts into the per-slide note channel. The note rides the existing channel, so the chart pixels stay byte-identical. A funnel with no sublists emits no note and is unchanged. |

#### Common mistakes

- **Assuming the `detail` sublist appears somewhere visible on the printed chart face.** Detail bullets render NOWHERE on the chart itself — they drive a hover/tap reveal popover on screen and fold into the PDF's speaker note; a funnel with detail bullets looks pixel-identical to one without on the printed page.

#### Data shape

- Stage values must be monotonically non-increasing in authored order (top to bottom) — the taper and every printed conversion percentage assume each stage is a strict subset of the one before it.
- The trailing value is a single number tolerant of thousands commas (`4,800`) — it takes the FIRST numeric run and discards everything after, so a magnitude suffix is silently dropped, not scaled: `$12k` parses as `12`, not `12000`. Use consistent full-magnitude numbers across every stage (`12,000`, not `$12k`) or the taper and every printed conversion percentage will be wrong.

### When to use

- **The story is the drop-off.** A funnel earns its shape when each stage is a strict subset of the one above and the audience needs to see WHERE the flow narrows — the leaky step, not just the totals. If the stages aren't a shrinking pipeline, use `progress` or `stats`.
- **Three to seven stages.** Two stages is just a ratio (use `big-number` or `stats`); past seven the bands thin out and the conversion labels crowd. Most pipelines fit in four to six.
- **Values in flow order, widest first.** Author the stages top-to-bottom as the flow runs, largest count first. The widest value sets full width and every band scales to it; the conversion % is computed from each value to the next.

### When NOT to use

- **Stages that aren't a subset.** If a later stage can exceed an earlier one (it's a category breakdown, not a pipeline), the taper lies. Use `piechart` for parts of a whole or `progress` for independent metrics.
- **A funnel of two stages.** Two bands is a single conversion rate dressed up as a chart. State it as a `big-number` (‘18% convert’) or a two-tile `stats` instead.
- **Non-monotonic values.** Values that rise and fall make the trapezoids bulge and the conversion %s read oddly. A funnel assumes a monotonic narrowing; for an up-and-down series use a `progress` or a chart with an axis.

### Authoring

```markdown
<!-- _class: funnel -->

## Where the flow drops off.

- First stage `1000`
- Second stage `600`
- Third stage `320`
- Fourth stage `140`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│        Where the pipeline leaks.        │
│                                         │
│   Visitors    [============]   12,000   │
│     62%        [========]      4,800    │
│   Activated    [=====]         2,160    │
│     40%        [==]              864    │
│   Paid         [=]               670    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`progress`](#progress) — independent metrics as labeled bars, not a narrowing pipeline
- [`stats`](#stats) — a row of headline figures with no drop-off relationship
- [`piechart`](#piechart) — parts of a single whole rather than sequential stages
- `list-steps` — the stages are a process to walk through, not values to compare
- `big-number` — a single conversion rate is the whole story

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/funnel>


## gantt

> Gantt chart — task bars across a date axis.

**Function** progression · **Form** timeline · **Substance** series

**Drawn with** `svg` — Bars, milestones, the date axis and every caption are one `<svg>`. A bar's start and length are positions on a shared time axis, so axis and bars must be solved together; CSS boxes would re-derive the same scale per row and drift.

**Tags** `swimlane` · `planning` · `milestones` · `agile`

Use for project plans with overlapping or staggered tasks. Each task is a bar on the time axis; bars can span multiple periods and carry status tints.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the plan. |
| `tasks` | `ul > li` | yes | Outer li per workstream lane; nested bullets per task. Each task carries trailing inline-code tokens, in any order: a span `START..END` (a bar) or a single time point (a milestone diamond); an optional status; an optional `after: Task name` dependency; an optional `milestone` keyword. `..` is the only span delimiter. Time points are ISO dates (2026-03-15), quarters (Q1 or 2026 Q1), or months (Jan); a chart uses dates OR ordinals, not both. Status vocabulary: on-track / done / live / at-risk / warn / blocked / fail / deferred / pilot / decision. The axis derives from the data; the eyebrow may override it with a `START..END` window and add a `today <point>` marker. Tokens are validated by the linter (retired delimiter, bad span/status, dangling or inverted `after:`). |
| `detail` | `ul > li > ul > li > ul > li` | no | Optional per-task reveal detail. A nested bullet under a TASK (one level deeper than the task) — plain prose: the owner, the blocker, the why — is captured as that task's detail rather than rendered on the bar. It drives two surfaces from one source: (1) on screen (Drawing Board present/practice/preview) the bar/milestone is tagged data-mark and the prose rides an inert `<template class="chart-detail">` the reveal layer shows in a popover on hover/tap, with the active bar lifted + glowing and the rest dimmed (gantt is reveal-only — no 3D tilt, which would skew the time axis); (2) the static PDF — the same detail folds into the slide's speaker note (`Task (span): item · item`) as a Marp-faithful comment. Renders nothing on the chart face, so a chart with no detail bullets is byte-identical. Must be a bullet, not a trailing inline-code token. |

#### Common mistakes

- **Writing the detail prose as a trailing inline-code token instead of a nested bullet.** Detail must be a nested bullet ONE level deeper than the task, not a trailing `` `code` `` token — only a nested bullet drives the reveal popover and speaker note; a trailing-token 'detail' isn't recognized at all.

#### Data shape

- A chart uses dates OR ordinals (quarters/months) consistently — never mix `2026-03-15` spans with `Q1`/`Jan` spans in the same chart.
- `..` is the only span delimiter — a hyphen or en-dash between two dates isn't recognized as a span.
- `after: Task name` must reference another task's exact (case-insensitive) label AND that task must itself carry a parseable time span — a task with only status pills and no `START..END`/point is never indexed, so `after:` pointing at it is flagged dangling even though the label is on the slide and visibly rendered. Source order doesn't matter otherwise: a forward reference to a spanned task defined later is fine.

### When to use

- **Overlapping work across lanes.** When tasks run in parallel across multiple workstreams and the audience needs to see who is busy when. The lane-stacked bars make concurrency visible at a glance.
- **Span is the story.** Each bar's length encodes its duration. Use gantt when start dates, end dates, and overlap are what you want the audience to remember.
- **Status pills add a second channel.** Tint bars with `done` / `live` / `at-risk` / `blocked` to layer health onto schedule. The plan reads as both 'when' and 'how it's going' in one chart. Since the bars carry no status text, a swatch+label status key is emitted automatically below the chart for the statuses present.

### When NOT to use

- **Single workstream.** One lane of bars is a timeline, not a gantt. Use `timeline` or `list-steps` when there is no parallel work to coordinate.
- **More than five lanes.** Past five workstreams the bars compress and the labels crowd. Group lanes (collapse 'SDK' subdomains into 'SDK') or split into two slides.
- **No spans at all.** A gantt mixes bars with the odd milestone — but if every task is a point-in-time event with no durations, use `timeline` or `roadmap milestones`. gantt earns its chrome only when bars carry meaningful length.

### Authoring

```markdown
<!-- _class: gantt -->

`2026 Q1 .. 2026 Q4` `today Q3`

## What ships in each phase, by workstream.

- First workstream
  - First task `Q1..Q2` `done`
  - Second task `Q2..Q3` `live` `after: First task`
  - Milestone `Q4` `milestone` `after: Second task`
- Second workstream
  - First task `Q1..Q2` `done`
  - Second task `Q2..Q3`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Gantt chart heading.                   │
│                                         │
│  Task A         ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░    │
│  Task B         ▓▓▓▓▓▓▓▓░░░░░░░░░░░░    │
│  Task C         ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░    │
│  Task D         ▓▓▓▓▓▓░░░░░░░░░░░░░░    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`roadmap`](#roadmap) — phased grid of deliverables across workstreams without continuous spans
- [`kanban`](#kanban) — current state by stage rather than schedule by lane
- `list-steps` — sequential process with descriptive steps, no parallel lanes

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/gantt>


## journey

> Native user-journey chart — sections of tasks, each tagged with actor(s) and a 1-5 mood. Renders as section bars, task chips, plumb lines, and mood faces.

**Function** progression · **Form** timeline · **Substance** structure

**Drawn with** `hybrid` — The board — stages, lanes, actors and task labels — is an HTML/CSS grid, because a journey map is fundamentally a table of text that must wrap and reflow. Drawn across it in inline `<svg>`: the mood curve and the mood faces, the only parts with real geometry. Neither side animates today — journey emits no motion roles, so chart-motion skips it.

**Tags** `process` · `assessment` · `walkthrough`

Use when a process or experience needs charting as a horizontal sequence of moments, each scored for affect. Five variants reshape the same source list: default (Mermaid-style classic), heatmap (mood-tinted chips), curve (mood polyline with axis), swimlane (per-actor rows), weighted (chip widths proportional to `+volume`).

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h1, h2` | yes | Slide heading naming the journey or process. |
| `sections` | `ul > li` | yes | Top-level li per section. Lead with the section name; nested ul carries tasks. Each task carries inline-code tokens: `@actor` (one or more), `:N` mood 1-5, optional `+N` volume (used by .weighted). |

#### Variant decision rule

- **default (no modifier).** The classic Mermaid-style read — the plainest, most familiar rendering of the sequence.
- **`heatmap`.** The fastest scan matters more than a precise trend — mood-tinted chips let the audience read the emotional contour at a glance.
- **`curve`.** The trend across the journey is the point — a mood polyline with an axis makes the trajectory, not just each moment, legible.
- **`swimlane`.** Actor load and handoff is the story — splits the journey into one row per actor.
- **`weighted`.** Traffic volume through each step matters as much as mood — chip width encodes the `+N` volume token.

#### Common mistakes

- **Treating the mood scale as if 1 were best instead of worst.** The mood scale runs 1 (worst) to 5 (best) — authoring it inverted flips heatmap tinting and the curve variant's trend direction.
- **Assuming an omitted `:N` mood token leaves the task unplotted.** Omitting `:N` silently defaults the task to a neutral mood of 3 — it still plots normally under every variant, just without a deliberate score. Always give an explicit `:N` so the chart reflects real affect instead of a silent default.

### When to use

- **Affect is part of the story.** When a process matters not just for its steps but for how each step feels. The 1-5 mood score makes the emotional contour part of the chart instead of buried in narration.
- **Actors share the trail.** Use when multiple actors hand off through the sequence — customer, sales, onboarding, support. The `@actor` tokens make the handoff visible on every task chip.
- **One source, five lenses.** Author the journey once and re-render under any variant. Heatmap for fastest scan, curve for trend, swimlane for actor load, weighted for traffic-mix — same data, different argument.

### When NOT to use

- **Process without affect.** If the mood scores are all the same or arbitrary, the chart is doing less work than `timeline` or `list-steps`. Reserve journey for sequences where the affect changes meaningfully.
- **More than ten tasks.** Past ten tasks the chips compress and the labels become unreadable. Group into fewer sections, or split the journey at a natural break.
- **Volume tokens without weighted.** The `+N` volume token is meaningful only under the `weighted` variant. On the other four it is parsed but invisible — strip it from the markdown or commit to weighted.

### Authoring

```markdown
<!-- _class: journey -->

## Walking through my Tuesday morning.

- Wake up
  - Hit snooze `@me` `:2`
  - Make coffee `@me` `:4`
- Commute
  - Subway `@me` `:1`
  - Walk `@me` `:5`
- Work
  - Standup `@team` `:3`
  - Deep work `@me` `:5`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│          User journey heading           │
│                                         │
│        [Awar] → [Sign] → [Use ]         │
│                                         │
│         :)        :|        :)          │
│          (satisfaction track)           │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `heatmap` — heatmap

Stages shade by score.

```markdown
<!-- _class: journey heatmap -->

## heatmap shades the stages by score.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`
```

#### `curve` — curve

A sentiment line rides the stages.

```markdown
<!-- _class: journey curve -->

## curve draws the sentiment line.

- Evaluate
  - Read case study `@prospect` `:5`
  - Book demo `@prospect` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`
```

#### `swimlane` — swimlane

One lane per actor.

```markdown
<!-- _class: journey swimlane -->

## swimlane splits the journey by actor.

- Evaluate
  - Read case study `@prospect` `:5`
  - Live demo `@prospect` `@sales` `:4`
- Trial
  - Trial signup `@prospect` `:3`
  - Workspace setup `@user` `@onboarding` `:1`
- Activate
  - First report `@user` `:3`
  - Daily use `@user` `:5`
```

#### `weighted` — weighted

Stage size carries weight.

```markdown
<!-- _class: journey weighted -->

## weighted sizes the stages by importance.

- Discover
  - Search `@prospect` `:4` `+45`
  - Referral `@prospect` `:5` `+18`
- Convert
  - Pricing page `@prospect` `:3` `+12`
  - Checkout `@prospect` `:2` `+10`
- Support
  - Settings `@user` `:3` `+8`
  - Help docs `@user` `:4` `+7`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `list-steps` — process needs descriptive body per step, no chart
- [`gantt`](#gantt) — schedule of overlapping tasks across lanes
- [`kanban`](#kanban) — current status by stage rather than sequence over time

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/journey>


## kanban

> Kanban board — columns of cards by stage.

**Function** progression · **Form** timeline · **Substance** series

**Drawn with** `html` — Columns and cards are HTML/CSS boxes. A board is a set of text cards in named columns with no geometry to draw, and HTML gives it real text selection, wrapping and reflow that an SVG rewrite would have to reimplement badly.

**Tags** `swimlane` · `workflow` · `status` · `agile` · `ownership`

Use for status snapshots: what's in each lane (todo/doing/done or similar). Each column is a stage; each card is a work item. By default the board is a calm grid of neutral cards and spends color only on STATUS, so a flagged card is the focal point; opt into `keyline` (color-code cards by category) or `tinted` (color-code columns by stage) when color coding earns its keep.

### Agent contract

**Capacity** ~3 items (crowds past 5, overflows past 6) — past that, split across slides. Past five lanes the cards compress.

**Density** aim ~8 words per item; past ~14 it reads as a wall of text — a terse card title.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading. |
| `lanes` | `ul > li` | yes | Three levels. Outer li = column header as plain text (e.g. Backlog). Each inner li = a card: title then a trailing inline-code size badge (S/M/L/XL; other codes are left in the title). Each card may carry its own nested bullet = a categorical lane label, optionally with a trailing status pill, e.g. - platform `at-risk`. A column titled Done / Completed / Shipped / Closed dims its cards. Status vocabulary matches the shared chart set (on-track / done / live / at-risk / warn / blocked / fail / deferred / pilot / decision). |

#### Variant decision rule

- **default (no modifier).** Color is spent on status — a flagged card's surface and border tint to its status, and the Done column dims — while unflagged cards and other columns stay neutral. `keyline`/`tinted` move status color OFF the card surface and onto the chip/column instead, keeping cards themselves neutral regardless of status.
- **`keyline`.** Cards should be color-coded by CATEGORY (their nested lane label) via a hairline, not by column.
- **`tinted`.** Each COLUMN/stage itself should carry a colored wash, making the board's stage structure the first thing the eye reads.

#### Common mistakes

- **Naming a column something other than Done/Completed/Shipped/Closed, expecting the finished-work dimming treatment anyway.** The dimmed treatment for completed work triggers off the COLUMN TITLE TEXT matching Done/Completed/Shipped/Closed exactly — a column named e.g. 'Finished' or 'Live' won't dim even if it functionally means the same thing.
- **Placing the status pill on the card's title line instead of its nested lane-label bullet.** Size badges (S/M/L/XL) trail the card TITLE; the status pill trails the nested lane-label bullet one level deeper (`- platform \`at-risk\``) — a status pill on the title line instead just becomes an unrecognized trailing code left in the title.
- **Reaching for `flat` to remove the card shadows.** A kanban card's shadow is INTRINSIC — the component is cards on a board, so the separation is part of its identity and is drawn directly rather than through the `--elevation-card` register that `lift`/`flat` switch. `<!-- _class: kanban flat -->` still shows card shadows. To flatten a board, use `keyline`, which rules the lanes apart with hairlines instead.

### When to use

- **Status snapshot by stage.** When the audience needs to see what is in each lane right now — backlog, in progress, review, done. The board reads as the current state of the work, not its history or schedule.
- **Mixed card density is informative.** Lanes that bulge or thin out tell the story — a fat 'in progress' column flags a WIP overload; an empty 'review' column flags a handoff stall. The visual imbalance is the signal.
- **Cards carry size and status meta.** Trailing inline-code badges (`S`/`M`/`L`/`XL`) sit in the title row; status pills (`at-risk`, `blocked`) push right on the meta row. The card stays scannable while the second channel of information rides along.

### When NOT to use

- **Schedule, not status.** If the question is when each task ships rather than where it sits today, reach for `gantt` (spans) or `roadmap` (phases). Kanban is a snapshot, not a timeline.
- **More than five lanes.** Past five columns the cards compress and the column headers crowd. Group adjacent stages or split into two boards (e.g. by team) instead.
- **Cards without meta.** A board of bare titles wastes the layout's affordances. Add at least a size badge and a lane label so the audience can scan workload and ownership at a glance.

### Authoring

```markdown
<!-- _class: kanban -->

`Eyebrow · context`

## Board status today.

- Backlog
  - First card `S`
    - team-a
  - Second card `M`
    - team-b `at-risk`
- In progress
  - Third card `M`
    - team-a
- Done
  - Fourth card `S`
    - team-b
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Kanban heading.                        │
│                                         │
│  TODO         DOING        DONE         │
│  [card 1]     [card 4]     [card 7]     │
│  [card 2]     [card 5]     [card 8]     │
│  [card 3]     [card 6]                  │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `keyline` — keyline

Hairlines rule the lanes apart.

```markdown
<!-- _class: kanban keyline -->

`kanban keyline`

## keyline rules the lanes apart.

- Backlog
  - Ruled lanes `S`
- In progress
  - Same board `M`
- Done
  - New look `L`
```

#### `tinted` — tinted

Each lane takes a colored wash.

```markdown
<!-- _class: kanban tinted -->

`kanban tinted`

## tinted colors each lane's wash.

- Backlog
  - Lane wash `S`
- In progress
  - Color coded `M`
- Done
  - Reads faster `L`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`gantt`](#gantt) — schedule of overlapping tasks across lanes, not current state
- [`roadmap`](#roadmap) — phased grid of deliverables across workstreams
- `checklist` — single list of items with done/in-flight/planned states
- `verdict-grid` — options scored against shared criteria, not stage-tracked

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/kanban>


## line

> A measure plotted across an ordered axis, so the movement is the read — one line or several, optionally filled, stacked, or stepped.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — The plot, the grid, the axis, every label and every series is one `<svg>`. A line is a claim about SHAPE — the reader compares the slope of one series against another and against the gridline behind both — so the marks and the scale they are read against have to live in one coordinate system, not in boxes that happen to line up.

**Tags** `metric` · `board-deck` · `takeaway` · `strategy`

Use when the claim is that something MOVED: revenue by quarter, headcount through a reorg, latency after a fix. Points sit on a shared value scale so the slope between them is comparable across series; each series is named at the end of its own line in that line's color, so the reader never travels to a key.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the movement, not the chart (‘Renewals recovered in the second half’, not ‘Revenue line chart’). |
| `points` | `ul > li` | yes | One li per point on the category axis, in order — the authored order IS the axis order and is never sorted. Lead text is the category label, and a trailing inline-code pill is its value: `Q1 2026 \`4.2\``. For several series, nest one li per series under each category: `- Q1 2026` then `  - Product \`2.4\``. Magnitude suffixes are scale, not decoration — `1.2M` is 1200000 — and an affix every value agrees on (`$`, `%`, `kg`) is carried onto the axis. |
| `detail` | `li > ul` | no | Optional nested bullet under a CATEGORY whose trailing pill is not a number — that is the whole disambiguation rule: a nested item ending in a numeric pill is a data point, anything else is detail. Drives the Present-mode reveal for that category's band and folds into the slide's speaker note; it paints nothing on the chart, so a deck with detail is pixel-identical to one without. |

#### Variant decision rule

- **default (no modifier).** The value changes continuously between the points you plotted — revenue, headcount, latency. The slope between two points is a real quantity, so drawing it as a slope is honest.
- **`step`.** The value HOLDS and then JUMPS — a list price, a rate, a band, a seat count. A straight interpolation between two step values draws a change that did not happen.
- **`area`.** There is exactly ONE series and its magnitude matters as much as its shape. With more than one series the fill stops being honest and the kernel drops it back to plain lines.
- **`stacked-area`.** The series ADD UP to a total the audience cares about, and the story is how the mix shifted inside it. If they do not sum to a meaningful total, stacking invents one.

#### Common mistakes

- **Adding `area` to a chart that has several series and expecting several filled regions.** `area` fills only when there is exactly one series; with more the kernel renders plain lines, because opaque overlapping regions hide each other. Use `stacked-area` if the series sum to a total you mean.
- **Assuming the value axis always starts at zero, as it does for a bar.** A plain `line` or `step` axis floats when the data sits well above zero (it starts at zero once the low point falls inside the bottom sixth of the range), because forcing zero flattens a real trend into a scratch at the top of the box. The tick column always prints where the axis actually starts. `area` and `stacked-area` always reach zero — the filled region is read as quantity.
- **Reordering the series under each category to ‘tidy’ a stacked area.** In `stacked-area` the authored order IS the stacking order, bottom-first, and it is never sorted for you. Author the largest and steadiest series first so the noisy one rides on a stable base; a series stacked on a jagged neighbor inherits the neighbor's wobble.
- **Leaving a series out of one category and expecting the line to bridge the gap.** A missing point BREAKS the line — a gap is drawn, because a straight bridge would invent a measurement. Author every series at every category, or accept the gap. The one exception is `stacked-area`, where a missing point has to contribute zero to keep the stack's baseline, which is a claim you may not mean.
- **Writing a nested bullet with a non-numeric pill under a category and expecting it to plot.** A nested item is a data point only when its trailing pill parses as a number; `- Best quarter in \`EMEA\`` is detail, not a series called ‘Best quarter in’. That rule is what keeps a note ending in inline code from being silently plotted at zero.
- **Reaching for `area` on a series whose movement is small relative to its own size.** An area chart's axis always reaches zero, so a four-percent move flattens into a line across the top of a filled block. Plot it as a plain `line`, whose axis floats, and let the tick labels say where it starts.
- **Mixing depths — giving one category its own value while the others carry a nested series list.** A flat category among nested ones belongs to no series, so every line breaks across it at once. Nest it like the rest (`- Q3` then `  - Product \`4.2\``), or make the whole chart flat and plot one series.

#### Data shape

- Two points is the hard floor — below it the kernel leaves the list alone and renders no chart, because a single reading has no movement to draw. Four or more is where a shape starts to read.
- The authored order of the categories is the axis order — the kernel never sorts. Write them in the order they happened.
- Two to six series. Past six, `parseSeries` reports the overflow rather than truncating; consolidate the tail into one ‘Other’ series before it gets there.
- Series names are printed at the end of their own lines, so keep them under about twenty-five characters. A name too long for the right-hand column makes the chart fall back to a key, which is the weaker read.
- Use one unit across every series, and write it into the values (`$4.2M`, `12%`, `840kg`) — an affix every value agrees on is carried onto the axis, and a mixed series gets none.
- A magnitude suffix is scale, not decoration: `1.2M` is 1200000 and `800k` is 800000, so the two can sit on one axis. `%` is not a magnitude — `12%` is 12.
- A category that omits a series leaves a HOLE, and the line breaks across it. In `stacked-area` a hole is forced to contribute zero — the stack needs a baseline — so author every series at every category before stacking.
- `stacked-area` assumes non-negative values; a negative contribution makes the bands cross and the total stop reading as a total. Use plain `line` for a series that can go below zero.
- Four to twenty-four points. Dots appear per measurement while the points are far enough apart to read as measurements and are dropped once they would bead the line.
- Keep every category at the SAME depth. A category written flat (`- Q3 \`4.2\``) among nested ones carries no series, so it renders as a hole in every line at once — the parser reports the mix, and the fix is to nest that category like its neighbors.

### When to use

- **The axis is ordered and the order means something.** Quarters, months, sprints, release numbers, stages of a rollout. A line connects its points, and that connection is a claim that moving from one to the next is meaningful. Plot unordered categories — regions, products, teams — with `bar` instead, where nothing is joined.
- **Two to six series, named at the end of their own lines.** Past six the categorical palette repeats and the lines stop being distinguishable (Wong 2011). Each series is labeled at its right-hand end in its own color, so the chart carries no key to look away to — consolidate a long tail into ‘Other’ rather than adding a seventh line.
- **Four to about twenty-four points.** Below four there is no shape to read — say it with `big-number` or `stats`. The kernel prints a dot per measurement while the points stay far enough apart to read as measurements, and drops the dots once the series is dense enough that the shape is the story.
- **Values in one unit, on one scale.** Every series shares the value axis, so the comparison the chart invites is a comparison of magnitudes. Two series in different units (dollars and percent) on one plot is a chart that lies quietly; split them across two slides, or plot the one that matters and state the other.

### When NOT to use

- **Two points.** Two points are a slope, and `slope` draws it better. Note it is authored transposed: one bullet per entity, its two points nested.
- **Categories that are not ordered.** Joining 'Legal, Finance, Sales, Ops' asserts a progression that does not exist. Use `bar`, or `stacked-bar` if each one decomposes.
- **A filled area for several series.** Two opaque regions hide each other. Use `stacked-area` when the series sum to a total; the kernel drops the fill rather than lie.
- **A trend where the story is attainment against a target.** If the question is 'did we hit the number', the target is not on the line. `bullet` puts actual, target and a band on one row.

### Authoring

```markdown
<!-- _class: line -->

## The number moved, and here is the shape of it.

- Q1 `12`
- Q2 `18`
- Q3 `17`
- Q4 `26`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│       Services grew into the gap.       │
│                                         │
│     6M |        .-*-.      Renewals     │
│              |   .-*-`    `*            │
│       3M | *-`     .-*--*    New        │
│                 |.--*--*-`              │
│          0 +-------------------         │
│             Q1  Q2  Q3  Q4  Q1          │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `area` — area

One series with the region under it filled — the fill reads as quantity, so it is honest for a single series only and the axis always reaches zero.

```markdown
<!-- _class: line area -->

## Cash on hand never dipped below one quarter of runway.

- Jan `8.2`
- Feb `7.6`
- Mar `6.9`
- Apr `7.4`
- May `8.8`
- Jun `9.6`
```

#### `stacked-area` — stacked-area

Composition over time: the series stack to a total, in the order they were authored, largest and steadiest at the bottom.

```markdown
<!-- _class: line stacked-area -->

## The mix shifted; the total barely moved.

- FY23
  - License `6.2`
  - Support `2.8`
  - Services `1.4`
- FY24
  - License `5.6`
  - Support `3.4`
  - Services `2.0`
- FY25
  - License `4.9`
  - Support `3.9`
  - Services `2.7`
- FY26
  - License `4.1`
  - Support `4.4`
  - Services `3.4`
```

#### `step` — step

A value that HOLDS and then JUMPS — a headcount, a price tier, a rate — drawn as a plateau per period rather than a slope between periods.

```markdown
<!-- _class: line step -->

## The list price held for three quarters, then moved twice.

- Q1 `1,200`
- Q2 `1,200`
- Q3 `1,200`
- Q4 `1,450`
- Q1 `1,450`
- Q2 `1,690`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`bar`](#bar) — the categories are unordered and the claim is magnitude, not movement
- [`slope`](#slope) — there are exactly two points and the story is which entities changed rank
- [`stacked-bar`](#stacked-bar) — each period decomposes into parts and the periods are compared, not connected
- [`bullet`](#bullet) — the number is read against a target and a qualitative band, not against its own past
- [`gantt`](#gantt) — the horizontal axis is real dates carrying durations rather than an ordered set of measurements

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/line>


## map

> A world-countries (or US-states) basemap that fills regions by value (choropleth) or category (highlight) so the audience leaves knowing where.

**Function** evidence · **Form** spatial · **Substance** series

**Drawn with** `svg` — The projected basemap, region fills, highlight rings and place labels are one `<svg>`. The geography IS path data — nothing but SVG draws a coastline — and labels have to sit in the same projected space as the regions they name.

**Tags** `metric` · `proportion` · `overview` · `visual`

Use when the story is geographic — program reach, service territories, where the grants landed, the regions you operate in. Author a value per named region (full name, postal/ISO code, or a common alias); choropleth shades each region on a single-hue ramp (low→high), while `highlight` gives each named region its own categorical color. The default basemap is the **world** (Equal Earth projection); add `us` (or `usa`) for the US-states map. On the world map you can also name a continent, a bloc (`European Union`, `ASEAN`), or a stated category (`Global South`, `Global North`, `Global South — Africa`) and the kernel fills every member. Because the term is contested, two sourced views of the Global South ship: `Global South` (G77 + China) and `Global South — Brandt Line` (the 1980 North–South divide) — pick the framing your deck argues. Regions the basemap can't match are reported in the legend, never silently dropped.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the geography and the takeaway (‘Where the program runs’). |
| `regions` | `ul > li` | yes | One li per region (or group). Lead with the name — world (default): full (`Brazil`), ISO (`BR`), alias (`Burma`), or a group (`European Union`, `Sub-Saharan Africa`, `Global South`) that expands to its members; US (`map us`): full (`California`), postal (`CA`), or abbreviation (`Calif.`) — then a trailing inline-code value: `Brazil \`4.2\``. In choropleth the value drives the ramp; in highlight it's an optional legend label. Names the basemap can't resolve surface as muted ‘?’ legend rows. |
| `detail` | `li > ul` | no | Optional nested sublist under a region. Drives two surfaces from one source (shared with pie/funnel/quadrant via the chart-family mark-detail substrate): (1) Present/Practice — the kernel tags the region `<path>`(s) with `data-mark` (a group shares one index across all its regions) and emits the sublist as an inert `<template class="chart-detail">` the reveal layer reads; (2) the static PDF — the same detail is folded into the slide's speaker note (`Region (value): item · item`) as a Marp-faithful comment that notes-core lifts into the per-slide note channel. The note rides the existing channel, so the chart pixels stay byte-identical. A map with no sublists emits no note and is unchanged. |

#### Variant decision rule

- **`world`.** The story spans multiple countries — program reach, service territories, grants — the default basemap, spelled out.
- **`us`.** The story is entirely within the United States — swaps to the US-states basemap with insets.
- **`highlight`.** The regions are a SET, not a ranked magnitude — membership matters (pilot states, regions served), not a gradient of values.
- **`robinson`.** A more familiar, traditional-atlas world silhouette fits the deck's visual tone better than the default. Note this trades away area accuracy: Equal Earth (the default) is area-preserving by construction, so `robinson` is a LESS area-faithful compromise projection, not a more faithful one — pick it for the recognizable shape, not for improved area accuracy.
- **`grouped`.** Whole blocs, continents, or categories should fill as one unit (European Union, ASEAN) rather than spelling out every member country.

#### Common mistakes

- **Assuming an unresolved region name is silently dropped.** An unmatched region name isn't silently dropped or fatal — it surfaces as a muted '?' row in the legend and is stamped on the figure, AND `npm run lint:deck` flags it explicitly (an `unknown-map-region` warning naming the region). Fix the spelling; the lint output tells you which name didn't resolve.
- **Using `highlight` with numeric-looking trailing values, expecting a color ramp.** Under `highlight`, the trailing value is just an optional legend LABEL, not a magnitude — it doesn't drive a color ramp the way it does under the default choropleth; a numeric string there is treated as a category label, not a number.

#### Data shape

- Region names resolve by full name, ISO/postal code, or common alias — the resolver accepts any mix, but picking one convention per chart keeps the legend readable.
- Choropleth values must share one consistent unit/scale across all regions — the ramp maps low→high over the full authored range, so mixing e.g. raw counts and percentages skews the gradient.

### When to use

- **The story is geographic.** Reach for a map only when WHERE is the point — coverage areas, jurisdictions, service territories, where the grants or pilots landed. If the geography is incidental and the comparison is really between named things, a `progress` or `stats` row reads faster than a basemap.
- **Choropleth for magnitude, highlight for membership.** Use the default choropleth when each region carries a number and the audience needs the gradient — how much, where. Use `highlight` when the named regions are a set (the eight pilot states, the four regions we serve) and there is no magnitude to rank.
- **Name regions any common way.** Country names resolve by full name, ISO code, or common alias (`Brazil` / `BR` / `Burma`→Myanmar); on `map us`, by full name, postal code, or abbreviation (`California` / `CA` / `Calif.`). A name the basemap can't bind is reported as a muted ‘?’ row in the legend and stamped on the figure — fix the spelling, don't ignore the gap.

### When NOT to use

- **A map as decoration.** If the regions aren't the comparison — you just want a US-shaped graphic behind some numbers — drop the basemap. An `image` scrim or a `stats` row carries headline figures without implying the geography is the message.
- **Too many shades to read.** A choropleth past a dozen distinct values asks the eye to rank colors it can't separate. Bucket the values, switch to `highlight` for a categorical read, or lead with a `progress` ranking and keep the map as support.
- **Sub-region precision the basemap doesn't have.** The basemaps draw US states and world countries — not counties, districts, sub-national regions, or city pins, and the world cut (110m) omits the smallest city-states. If the story lives below that line, a labeled `image` of the real map serves better than forcing it onto the basemap.

### Authoring

```markdown
<!-- _class: map -->

## Where the program runs.

- Kenya `4.2`
- Nigeria `3.1`
- India `2.8`
- Brazil `2.2`
```

### Variants (component-specific)

#### `us` — us

The US-states basemap, with insets.

```markdown
<!-- _class: map us -->

## us swaps in the US-states basemap.

- California `48.2`
- Texas `36.4`
- New York `31.0`
- Florida `27.5`
- Illinois `19.3`
- Ohio `14.1`
- Georgia `11.8`
- Washington `9.6`
```

#### `world` — world

The Basemap axis default, spelled out.

```markdown
<!-- _class: map world -->

## The same engine, pinned to the world basemap.

- Germany `42.7`
- Japan `35.1`
- Canada `28.9`
- Australia `21.4`
- Chile `16.2`
- Morocco `12.8`
- Vietnam `10.5`
- Iceland `7.3`
```

#### `highlight` — highlight

Category fills instead of values.

```markdown
<!-- _class: map highlight -->

## highlight fills by category, not value.

- Kenya `East Africa`
- Nigeria `West Africa`
- India `South Asia`
- Brazil `Latin America`
```

#### `robinson` — robinson

The Robinson projection swap.

```markdown
<!-- _class: map robinson -->

## robinson swaps the projection.

- United States `42`
- Brazil `31`
- Nigeria `27`
- Kenya `24`
- India `38`
- Indonesia `19`
- Germany `22`
- Australia `12`
```

#### `grouped` — grouped

Whole blocs fill as one.

```markdown
<!-- _class: map highlight grouped -->

## grouped fills whole blocs at once.

- European Union `Tier 1`
- ASEAN `Tier 1`
- Sub-Saharan Africa `Tier 2`
- Latin America `Tier 2`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`progress`](#progress) — the regions are really a ranking — labeled bars compare magnitudes faster than shades
- [`stats`](#stats) — a few headline figures with no geography to place them on
- [`piechart`](#piechart) — regional shares of a single whole rather than a value per place
- `image` — the geography needs detail (counties, cities, routes) the basemap can't draw

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/map>


## matrix-grid

> Two ordered axes as an N×M chart-family grid — each cell marks a position (filled / reachable / not applicable), colored by its row's category from the theme's chart palette.

**Function** comparison · **Form** matrix · **Substance** structure

**Drawn with** `html` — HTML/CSS all the way down, no `<svg>` anywhere: a real `<table>` whose cells carry the positional grammar (filled/outlined/empty spans), colored via CSS custom properties per row. Nothing is positioned by numeric value — the grid is text and color in a semantic table, same reasoning as roadmap.

**Tags** `stoplight` · `assessment` · `positioning` · `okr`

Use for a rubric where BOTH axes are ordered categories (a depth ladder × a reach ladder, a maturity level × a scope) and a reader needs to see one position at a glance — not a status report. A chart-family member: renders inside the shared chart-frame skeleton and colors rows from the theme's chart categorical palette (--chart-cat1..8), never a hardcoded palette of its own. Cells carry a positional grammar ([x] this row's position, [-] reachable from here, [ ] not applicable). For regulation × obligation status tracking, use `obligation-matrix`; for phases × workstreams delivery status, use `roadmap`; for two free axes and four cells, use `matrix-2x2`.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading naming the rubric. |
| `eyebrow` | `p > code` | no | OPTIONAL axis labels: TWO inline-code spans in one paragraph, placed with the slide's framing text — `` `Wider reach`  `Deeper cognition` ``. The first names the column (reach) axis and renders centered above the grid; the second names the row (depth) axis and renders rotated along its left edge. Direction arrows are GENERATED — write only the names. Omit the paragraph entirely and the grid renders with no axis labels. A paragraph with only ONE code span is an ordinary eyebrow/subtitle and is left alone. |
| `subtitle` | `h2 + p` | no | One supporting sentence under the heading, framing how to read the grid. |
| `matrix` | `table` | yes | Markdown table — the header row is the reach/scope axis, the first column of each body row is the category axis. Cells use the positional grammar ([x] / [-] / [ ]); a filled cell's trailing text is its label. |
| `legend` | `p:last-of-type` | no | Optional single trailing paragraph, doubling as the chart caption — what the three cell states mean, plus any caveat about the placements. A leading `**bold**` run renders as a filled swatch + label, a leading `*italic*` run as an outlined swatch + label; keep both in this ONE paragraph (a second trailing paragraph is not lifted into the caption). |

#### Common mistakes

- **Authoring `[x]` with no trailing label, e.g. `| [x] |` alone.** A filled cell's text IS the row's title at that reach — `[x] Senior`, not a bare marker. An unlabeled filled cell renders as an empty colored box.
- **Skipping the legend paragraph.** A first-time reader can't infer filled/half/empty from color alone (deliberately — the row hue carries category, not state). One trailing sentence naming the three states is what makes the grid legible without a caption underneath every cell.

#### Data shape

- The header row's first cell is conventionally blank or names the category axis; the remaining header cells are the reach/scope axis labels in ascending order.
- Body rows go deepest/highest category first — the row order IS the depth axis, so declare rows in the same descending order you'd want read top-to-bottom.
- Up to eight rows are colored from the chart family's categorical palette before hues repeat; past eight, split into two grids.
- On a wide deck every column is the same width, so a filled cell's label has to fit that share rather than widening its own column. Keep labels to a word or two — `Senior`, `Principal`, `VP`. `Distinguished` at five columns is the longest the shipped gallery carries and it clears its cell by 75.9px; a much longer one does not get cut, it paints straight through the pill's border, so treat the pill as the budget.

### When to use

- **Both axes are ordered categories.** A depth ladder (skill, seniority, maturity) crossed with a reach or scope ladder (self, team, org, field). If either axis is a free, unordered label, reach for `matrix-2x2` (two axes, four cells) instead.
- **One position, not a status report.** The grid exists to show where a single subject sits — a role, a maturity level, a capability — not to track many items' pass/fail state. For that, `obligation-matrix` (regulation × obligation) or `roadmap` (phase × workstream) fit better.
- **Row category carries the color.** Each row is colored by its own hue from the chart family's categorical palette, not a status palette — there's no universal 'good' or 'bad' cell here, only which row and how far it reaches.

### When NOT to use

- **Pass/fail or delivery status.** If cells mean shipped/at-risk/blocked, use `obligation-matrix` or `roadmap` — their semantic state palette (pass/warn/fail) is built for exactly that read, and matrix-grid's categorical row colors would mislead.
- **More than one filled cell per row.** Each row names one position — one `[x]`. Multiple filled cells in a row breaks the "this is where you are" read; use `[-]` for the cells the row can still reach.
- **Unordered axes.** The grid earns its shape when both axes have a real order (shallow to deep, narrow to wide). Two free categorical labels belong in `matrix-2x2`.

### Authoring

```markdown
<!-- _class: matrix-grid -->

## Where each level sits on two axes.

Your position is the diagonal — depth and reach meet at one cell.

`Wider reach`  `Deeper cognition`

| Depth | Self | Team | Org |
| ---------- | :--: | :--: | :-: |
| Advanced   | [ ]  | [-]  | [x] Lead |
| Proficient | [-]  | [x] Senior | [-] |
| Beginner   | [x] Junior | [-]  | [ ]  |

**Your position** · *reachable*
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Verb × reach heading.                  │
│                                         │
│  ┌───────────┬───────────┬───────────┐  │
│  │           │ Self      │ Team      │  │
│  ├───────────┼───────────┼───────────┤  │
│  │ Create    │ ·         │ ◇         │  │
│  │ Apply     │ ◇         │ ■         │  │
│  │ Remember  │ ■         │ ◇         │  │
│  └───────────┴───────────┴───────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `obligation-matrix` — rows × columns of pass/partial/exempt status, not a single position
- [`roadmap`](#roadmap) — phases × workstreams delivery status
- `matrix-2x2` — two free axes, four cells, qualitative placement
- `verdict-grid` — options scored against shared criteria, one card per option

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/matrix-grid>


## piechart

> Pie or donut chart with legend — proportional wedges.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Wedges, their radial gradients, the percentages and the legend are all one `<svg>`. A wedge is an arc path, and keeping the legend inside the same drawing means a swatch hue can never drift from the slice it names.

**Tags** `donut` · `proportion` · `percentage`

Use for part-to-whole breakdowns with three to six slices. Add the `donut` modifier for a hole in the middle — visually cleaner for executive decks.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the breakdown. |
| `slices` | `ul > li` | yes | One li per slice: label text then a trailing inline-code value pill, e.g. - Marketing `40%` (slices are drawn proportionally to the values). |
| `detail` | `li > ul` | no | Optional nested sublist under a slice. Drives two surfaces from one source via the shared chart-family detail substrate (identical to funnel/map/quadrant/radar): (1) Present/Practice — the kernel keeps the label/value as-is, tags each wedge `<path>` with `data-mark`, and emits the sublist as an inert `<template class="chart-detail">` (inside a `.chart-details` wrapper) the reveal layer reads; (2) the static PDF — the same detail is folded into the slide's speaker note (`Label (value): item · item`) as a Marp-faithful comment, which notes-core lifts into the per-slide note channel (a PDF text annotation + the hidden `aside`). The note rides the existing channel, so the chart pixels stay byte-identical. A pie with no sublists emits no note and is unchanged. Detail sublists must be bullet (`-`/`*`) lists, not numbered. |

#### Variant decision rule

- **default (no modifier).** Analyst or working-session decks, or a low slice count (3-4) where the full disc reads cleanly without competing for the center.
- **`donut`.** Board/investor decks by default — the hollow center reads as composed rather than as a missing slice. The hole itself stays visually empty; a per-slice `detail` sublist surfaces via the interactive popover and the PDF speaker note either way, not inside the hole.

#### Common mistakes

- **Slice values mix formats, e.g. some as `40%` and others as `120 hrs` in the same chart.** Every slice pill in one chart shares the same unit/format. Mixing formats breaks the part-to-whole read the wedges are supposed to communicate.
- **A `detail` sublist under a slice authored as a numbered list.** Detail sublists must be bullet (`-`/`*`) lists, not numbered — the shared chart-family detail substrate (funnel/map/quadrant/radar too) only picks up bullet lists.

#### Data shape

- Author slices in descending value order; the engine draws wedges in source order and never auto-sorts — a shuffled list scatters the visual hierarchy the wedges are supposed to carry.
- Keep every slice label to 1-3 words — long labels wrap and crowd the legend, which sits in a right rail beside the wedges in a landscape box or stacks below them in a portrait box (the portrait layout budgets a wider label column, but short labels still read cleanest in both).
- Stay at 3-6 slices for the sweet spot; the palette has six hues (Wong 2011 / IBM Carbon, calibrated for perceptual distinction), so a 7th slice repeats a color already on the chart — consolidate the long tail into a single `Other` slice before then rather than adding a 7th.

### When to use

- **Three to six parts of a whole.** Time allocation, budget breakdown, mix-of-business. Past six slices the wedges become unreadable and the legend overwhelms — split or pick the top five plus an `Other` slice.
- **Proportions matter more than precision.** Pie charts are good at 'roughly a third', bad at 'is it 28% or 31%?'. If exact differences are the argument, reach for a bar chart (`progress`) where the eye can compare lengths directly.
- **Donut for executive decks.** The `donut` modifier hollows the center — cleaner, less crowded, and the hole reads as composed rather than as a missing slice. Default to donut for board / investor decks; reserve solid pies for analyst working sessions.

### When NOT to use

- **Slices that don't sum to a whole.** A pie of unrelated metrics is meaningless — the visual implies parts of a whole. If your values are independent measures, use stats or a bar chart instead.
- **Two slices.** A two-slice pie is just a percentage with extra steps. Use big-number or split-panel metric — the audience can read '38% / 62%' faster than they can decode a half-and-half disc.
- **Comparing two pies.** Side-by-side pies force the audience to compare wedge angles across two figures — humans are bad at this. Use grouped bars or a slope chart to land the comparison cleanly.

### Authoring

```markdown
<!-- _class: piechart donut -->

`Eyebrow · context`

## What the breakdown shows.

- First slice `40%`
- Second slice `30%`
- Third slice `20%`
- Fourth slice `10%`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│          Distribution heading           │
│                                         │
│                  ╭──────╮               │
│                 │▓▓▓░░░░│               │
│             │▓▓░░░░░│  ◆ 40%            │
│             │░░░▓▓▓░│  ◇ 35%            │
│              ╰──────╯   ○ 25%           │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `donut` — donut

The center carries the total.

```markdown
<!-- _class: piechart donut -->

`H1 2026 · 1,840 person-hours`

## donut opens the center for the total.

The toil-and-on-call slice is the one nobody put in the roadmap.

- Signal Intake build `46%`
- Scoring policy work `22%`
- Decision Log integration `18%`
- Explaining the framework to stakeholders `9%`
- Toil and on-call `5%`

Refreshed weekly · figures from the time-tracking export
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`progress`](#progress) — comparable parts but precise differences matter
- [`stats`](#stats) — the values are independent metrics, not a partition
- `big-number` — the headline is one slice, not the breakdown
- [`kpi`](#kpi) — the slices need status framing and targets

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/piechart>


## progress

> Horizontal progress bars — one row per item, percentage filled.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `html` — Each bar is an HTML box whose width is its percentage. One number per row needs no shared coordinate system, and keeping the label as prose lets it wrap and stay selectable — an SVG bar would buy nothing but a text-wrapping problem.

**Tags** `percentage` · `stoplight` · `status`

Use for status-tracking across multiple parallel items (project readiness, OKR progress, capacity utilization). Status colors via the chart-status vocabulary (on-track / done / live, at-risk / warn, blocked / fail, deferred).

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the progress view. |
| `eyebrow` | `p > code` | no | Optional eyebrow caption above the heading. |
| `subtitle` | `p` | no | Optional plain subtitle after the heading. |
| `rows` | `ul > li` | yes | One li per item: label text then trailing inline-code pills — percent first, optional status second, e.g. - Adoption `68%` `at-risk`. Status vocabulary: on-track / live / at-risk / warn / blocked / fail / deferred / done. An optional nested bullet renders as a per-row note. |

#### Common mistakes

- **Writing the fill value without the `%` sign, assuming the bar won't fill correctly.** The `%` sign is cosmetic for the bar fill itself — a bare number and a `%`-suffixed one drive the same fill. It DOES matter for the displayed chip text, though: omit it and the chip shows a bare number with no percent sign, which reads wrong even though the bar fills correctly. Always include `%` for a clean label.
- **Writing the status pill before the percent chip.** Trailing chips are read percent first, status second (`` `68%` `` then `` `at-risk` ``) — reversing the order is a genuine break, not graceful tolerance: the bar renders at 0% fill and the percent/status text swap positions in the row.

### When to use

- **Parallel workstreams at a glance.** When the audience needs to scan five to eight workstreams and immediately spot the ones in trouble. The bar length carries the magnitude; the status pill carries the verdict.
- **Percent-complete is the natural unit.** Readiness, OKR progress, capacity utilization, rollout coverage. Any series where each row is a 0–100% completion against its own scale fits the layout. Mixed units belong in `kpi`.
- **Status framing matters as much as the number.** Use the `on-track`, `at-risk`, `blocked`, `deferred`, `done` vocabulary — the engine tints the bar fill to match. A 68% bar reads very differently when it is `at-risk` than when it is `on-track`.

### When NOT to use

- **Comparing unrelated metrics.** Revenue % of target, latency vs SLO, and headcount fill aren't comparable on a shared bar scale. Use `kpi` for value/target/status tiles or `stats` for an independent metric row.
- **More than eight rows.** Past eight workstreams the bars compress and the labels truncate. Split the view by owner or workstream group; the audience can't scan twelve bars at once anyway.
- **Decorative status pills.** Don't invent new status words for tone. `on-track`, `at-risk`, `blocked`, `deferred`, `done` are the vocabulary the engine recognizes; everything else renders as a plain pill and breaks the at-a-glance read.

### Authoring

```markdown
<!-- _class: progress -->

`Eyebrow · context`

## Progress by item.

- First item `80%` `on-track`
- Second item `55%` `at-risk`
- Third item `30%` `blocked`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Progress heading.                      │
│                                         │
│  Goal A   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓70%░░░░░░       │
│  Goal B   ▓▓▓▓▓▓▓▓▓▓50%░░░░░░░░░░       │
│  Goal C   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓90%░        │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`kpi`](#kpi) — value + target + status tiles, not a single percent
- [`stats`](#stats) — independent headline metrics, no completion scale
- [`gantt`](#gantt) — the rows are time-bound and need a date axis
- `checklist` — binary done / not-done across a flat list
- [`timeline-list`](#timeline-list) — the workstreams complete in sequence, not in parallel

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/progress>


## quadrant

> Native 2×2 scatter chart — items plotted on two continuous axes.

**Function** evidence · **Form** scatter · **Substance** series

**Drawn with** `svg` — Axes, cell tints, bubbles, trails and every label — including the corner names that sit outside the plot — are one `<svg>`. Points are placed by value on two axes, and the placement engine that keeps labels off each other and off the marks needs all of it in one coordinate system. A name the engine had to move away from its own dot is joined back to it by a hairline leader, because on a crowded plot "beside" stops meaning "nearest" — and a quadrant has no axis, no value pill and no other channel to say which dot a name belongs to.

**Tags** `two-by-two` · `positioning` · `prioritize` · `risk`

Use to position items by two numeric attributes (cost × value, effort × impact). Data-driven; for static categorical 2×2 grids, use matrix-2x2.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the analysis. |
| `axes` | `p > code` | no | Optional axis-label eyebrow (inline-code paragraph). |
| `items` | `ul > li` | yes | One li per item. Format: `Label — x, y[, size]`. |
| `detail` | `li > ul > li > ul` | no | Optional 3rd-level nested sublist under an item (the x,y are inline pills, so this level is free). Drives two surfaces from one source (shared with pie/funnel/map via the chart-family mark-detail substrate): (1) Present/Practice — the kernel tags the item's `<circle>`/bubble with `data-mark` (a stable global index across all variants) and emits the sublist as an inert `<template class="chart-detail">` the reveal layer reads; (2) the static PDF — the same detail is folded into the slide's speaker note (`Label: item · item`) as a Marp-faithful comment that notes-core lifts into the per-slide note channel. The note rides the existing channel, so the chart pixels stay byte-identical. A quadrant with no sublists emits no note and is unchanged. |

#### Variant decision rule

- **default (no modifier).** Each item is a single, current position on the two axes — the plain scatter.
- **`bubble`.** A third numeric dimension (size, cost, headcount) should scale each point's radius, not just its x/y position.
- **`trail`.** Items have moved — the story is the delta from a prior position to now, shown as a dashed connector line between a faded before-dot and a solid after-dot.
- **`cohort`.** The categorical grouping itself, not the axes, is what the audience should color-scan first.
- **`threshold`.** Specific numeric cutoffs on each axis are the point — draws the actual threshold lines instead of leaving the quadrant split purely visual.
- **`magic`.** The four quadrants have established, named archetypes (Leaders/Challengers/Visionaries/Niche Players) worth labeling explicitly, Gartner-style.
- **`minimal`.** The quadrant tint fields, bubble fills, and cohort hull shading would distract — strips them to outlined points, while axis labels and threshold lines stay visible.

#### Common mistakes

- **Under `magic`, expecting the group heading text to move an item into that quadrant.** Placement is driven entirely by the item's `x, y` coordinate — the group heading is an editorial label only; an item whose coordinates don't fall in the region a heading like 'Leaders' implies still renders wherever its numbers place it.
- **Reading a name as belonging to the dot nearest it.** Follow the hairline where there is one. A crowded corner pushes names one or two rings out from their own dot, and a leader is drawn for exactly that case — a name with no line is sitting against the dot it names.

#### Data shape

- An item is ONE inline-code chip with comma-separated numbers — `Label — x, y[, size]` as `` `3, 70` `` or `` `3, 70, 2.4` `` under `bubble` — EXCEPT `trail`, which needs TWO chips (`` `5, 60` `` `` `3, 78` ``, from-position then to-position); splitting a non-`trail` item's coordinates into two chips silently zeroes the second axis instead of erroring.
- The eyebrow isn't just a label — it SETS the axis domain when present (`Effort 0–10 → Reach 0–100` fixes the scale instead of deriving it from the data), and `threshold` reads its own `· targets X, Y` suffix on the same eyebrow line to place the cutoff lines; omit either and the chart falls back to a data-derived scale / a midpoint threshold.

### When to use

- **Two numeric axes carry the analysis.** Effort × impact, cost × value, probability × severity, reach × confidence. Both axes are continuous and the position on each genuinely matters — that's the argument quadrant is built to make.
- **Categorical grouping clusters the dots.** Items grouped under list headings (`Strategic Bets`, `Quick Wins`, `Defer`, `Time Sinks`) share a color, so the eye can read the cluster before the individual point. The grouping is editorial, not derived from coordinates.
- **Six to twelve items.** Below six the chart wastes the canvas — write it as prose. Past twelve the labels overlap and the quadrant becomes a constellation. Trim the long tail or break it across two slides.

### When NOT to use

- **Static categorical 2×2.** If the quadrants are fixed labels (Important × Urgent, Build × Buy × Partner × Defer) and items are placed by category not coordinate, use `matrix-2x2`. `quadrant` is data-driven; `matrix-2x2` is conceptual.
- **Single axis matters.** If one axis is decorative and only the other carries meaning, you have a ranking, not a scatter. Use `progress` for percent-complete or `kpi` for ranked metrics with status.
- **Coordinates without an audience-shared scale.** If `8, 80` requires a footnote to interpret, the slide doesn't pay off. Either label the axis units in the eyebrow — the `Effort 0–10` / `Reach 0–100` line above every slide here — or normalize to a familiar scale before authoring.

### Authoring

```markdown
<!-- _class: quadrant -->

`Effort 0–10 → Reach 0–100`

## Where to put the next dollar, having spent the last one on a workshop.

Effort estimated in story-points; reach as percent of addressable teams.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`
  - Snapshot exports `9, 55`
- Defer
  - Vendor scoping `2, 30`
  - Manual recalibration `1, 22`
- Time Sinks
  - Custom audit log UI `7, 18`
  - Bespoke board export `9, 28`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│         Quadrant chart heading          │
│                                         │
│    high ▲    ◆       ◆                  │
│         │ ◆    ●                        │
│         │       ●  ◆                    │
│         │  ●         ●                  │
│     low └──────────────►                │
│           low        high               │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `bubble` — bubble

A third value sizes each point.

```markdown
<!-- _class: quadrant bubble -->

`Effort 0–10 → Reach 0–100`

## bubble sizes each point by a third value.

- Strategic Bets
  - Scoring model v2 `3, 70, 2.4`
  - Per-team calibration `5, 85, 4.1`
- Quick Wins
  - Weekly signal brief `8, 80, 0.9`
  - Snapshot exports `9, 55, 0.6`
- Defer
  - Vendor scoping `2, 30, 0.4`
- Time Sinks
  - Custom audit log UI `7, 18, 1.3`
```

#### `trail` — trail

Arrows show where points moved from.

```markdown
<!-- _class: quadrant trail -->

`Effort 0–10 → Reach 0–100`

## trail shows where each point moved from.

- Strategic Bets
  - Scoring model v2 `5, 60` `3, 78`
  - Per-team calibration `7, 70` `5, 88`
- Quick Wins
  - Snapshot exports `9, 45` `8, 62`
- Time Sinks
  - Custom audit log UI `6, 25` `7, 16`
```

#### `cohort` — cohort

Points color by group.

```markdown
<!-- _class: quadrant cohort -->

`Effort 0–10 → Reach 0–100`

## cohort colors the points by group.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`
  - Snapshot exports `9, 55`
- Defer
  - Vendor scoping `2, 30`
  - Manual recalibration `1, 22`
- Time Sinks
  - Custom audit log UI `7, 18`
  - Bespoke board export `9, 28`
```

#### `threshold` — threshold

The lines that matter, drawn.

```markdown
<!-- _class: quadrant threshold -->

`Effort 0–10 → Reach 0–100 · targets 5, 50`

## threshold draws the lines that matter.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`
- Defer
  - Vendor scoping `2, 30`
- Time Sinks
  - Custom audit log UI `7, 18`
```

#### `magic` — magic

All four quadrants named.

```markdown
<!-- _class: quadrant magic -->

`Completeness of vision 0–100 → Ability to execute 0–100`

## magic names all four quadrants.

- Challengers
  - Productboard `30, 82`
- Leaders
  - Sprig + Log `85, 88`
  - Chorus `72, 76`
- Niche Players
  - Notion build-out `25, 28`
- Visionaries
  - Spreadsheet `82, 34`
```

#### `minimal` — minimal

Just the points.

```markdown
<!-- _class: quadrant minimal -->

`Effort 0–10 → Reach 0–100`

## minimal strips the chart to its points.

- Strategic Bets
  - Scoring model v2 `3, 70`
  - Per-team calibration `5, 85`
- Quick Wins
  - Weekly signal brief `8, 80`
  - Snapshot exports `9, 55`
- Defer
  - Vendor scoping `2, 30`
- Time Sinks
  - Custom audit log UI `7, 18`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `matrix-2x2` — the 2×2 is categorical, not coordinate-based
- [`radar`](#radar) — items rated across more than two criteria
- [`progress`](#progress) — percent-complete on a single axis
- [`piechart`](#piechart) — part-to-whole, not bivariate position
- `verdict-grid` — comparing options against shared categorical criteria

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/quadrant>


## radar

> Native radar / spider chart — items rated across multiple axes.

**Function** evidence · **Form** scatter · **Substance** series

**Drawn with** `svg` — The web, spokes, area polygons, axis labels, the key and — since the 2026-07-27 conversion — the small-multiples captions are all one `<svg>`. Each mini carries its series name in a fixed caption band inside its own viewBox, so a standalone SVG export of a small-multiples radar names its four shapes instead of shipping them blank, and chart-motion moves a mini's caption with the mini rather than leaving it behind.

**Tags** `spider` · `assessment` · `positioning`

Use to compare 2–4 options across the same 4–8 criteria. Each option becomes a polygon; overlap shows where strengths align.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the comparison. |
| `axes` | `p > code` | no | Optional eyebrow listing the axes. |
| `series` | `ul > li` | yes | One li per series (option). Format: `Label — v1, v2, v3, v4, …` one number per axis. |
| `detail` | `li > ul > li > ul` | no | Optional nested sublist under an AXIS in the first series (radar reveals per-axis — the mark is the axis). For the `quadrant` variant, one level deeper (under each axis within a group). Drives two surfaces from one source (shared with pie/funnel/map/quadrant via the chart-family mark-detail substrate): (1) Present/Practice — the kernel tags the axis label `<text>` with `data-mark` and emits the sublist as an inert `<template class="chart-detail">` the reveal layer reads; (2) the static PDF — the same detail folds into the slide's speaker note (`Axis: item · item`) as a Marp-faithful comment that notes-core lifts into the per-slide note channel. The note rides the existing channel, so the chart pixels stay byte-identical. Detail sublists must use `-`/`*` bullets, not a numbered (`1.`) list. A radar with no sublists emits no note and is unchanged. |

#### Variant decision rule

- **default (no modifier).** Two to four options compared on the shared polygon — the plain radar.
- **`target`.** Actual performance should be measured against an explicit goal shape — draws the target as its own series the actual shape must clear.
- **`delta`.** Only two periods or options are being compared and the CHANGE between them, not each one individually, is the point — shades the gap.
- **`benchmark`.** One shape is 'us' and the rest should read as a single reference range, not named individuals — every series after the first collapses into ONE shaded min-max band labeled 'Comparison range' in the legend; competitor names are not shown. Use `default`/`small-multiples` instead if each competitor needs to stay individually identifiable.
- **`quadrant`.** The axes themselves fall into natural categories (People/Process/Technology/Risk) worth grouping and shading by compass quarter.
- **`small-multiples`.** More options need comparing than overlapping polygons could hold without tangling — gives each option its own small radar instead.
- **`minimal`.** The scale rings would distract — strips them, leaving just the shape.

#### Common mistakes

- **Authoring a detail sublist as a numbered list (`1.`) instead of `-`/`*` bullets.** Detail sublists must use `-`/`*` bullets — a numbered list isn't recognized as the axis's detail content.
- **Giving a series a different number of values than there are axes.** Each series must supply exactly one number per axis, using the SAME axis labels every other series uses — later series align to the first series's axes by label (case-insensitive), falling back to position only when a label doesn't match, so reordering axes across series is safe as long as the labels agree. A genuinely mismatched count or label desyncs which value maps to which spoke.

### When to use

- **Same criteria, multiple options.** Competitive comparison, vendor evaluation, candidate scoring — anywhere two to four options need to be rated on the same four-to-eight criteria. The polygon shapes show the trade-off pattern at a glance.
- **Shape is the argument.** Radar charts are good at 'we are strong here and weak there' — the lopsided polygon is the message. If precise pairwise comparisons matter more than the silhouette, use a grouped bar chart or `verdict-grid`.
- **Shared zero-to-ten scale.** Every axis must use the same scale so the polygons are comparable. Mixed units (ms, $, count) collapse the chart's meaning — normalize to a shared 0–10 or 0–100 before authoring.

### When NOT to use

- **More than four series.** Five overlapping polygons become a tangle of edges. Trim to the two or three options the audience is actually choosing between; the rest belong in an appendix table.
- **Three or fewer axes.** Three axes makes a triangle — barely a shape. Below four criteria, the spider collapses and the slide should be a `cards-grid` or `verdict-grid` instead.
- **Mixed scales across axes.** If one axis is 0–10 and another is 0–10,000, the larger axis dominates the polygon and the comparison is misleading. Normalize everything to a shared scale first.

### Authoring

```markdown
<!-- _class: radar -->

`Scale · 0–10`

## How we stack up across the buying criteria.

- Lattice
  - Performance `9`
  - Pricing `7`
  - Support `8`
  - Ecosystem `6`
  - Security `9`
- Rival North
  - Performance `7`
  - Pricing `8`
  - Support `6`
  - Ecosystem `9`
  - Security `7`
- Rival West
  - Performance `6`
  - Pricing `9`
  - Support `7`
  - Ecosystem `8`
  - Security `8`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│           Radar chart heading           │
│                                         │
│                  A                      │
│                 /·\                     │
│              E ●───● B                  │
│                │   │                    │
│              D ●───● C                  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `target` — target

The bar the shape must clear.

```markdown
<!-- _class: radar target -->

`Scale · 0–100`

## target draws the bar the shape must clear.

- Actual
  - Hiring `72`
  - Runway `88`
  - Pipeline `54`
  - Retention `91`
  - Compliance `66`
  - Velocity `78`
- Target
  - Hiring `90`
  - Runway `85`
  - Pipeline `80`
  - Retention `90`
  - Compliance `95`
  - Velocity `75`
```

#### `delta` — delta

The gap between two shapes, shaded.

```markdown
<!-- _class: radar delta -->

`Scale · 0–10`

## delta shades the gap between two shapes.

- H1
  - Velocity `5`
  - Quality `6`
  - Morale `4`
  - Coverage `5`
  - Onboarding `3`
- H2
  - Velocity `8`
  - Quality `7`
  - Morale `4`
  - Coverage `6`
  - Onboarding `7`
```

#### `benchmark` — benchmark

A reference shape overlaid.

```markdown
<!-- _class: radar benchmark -->

`Scale · 0–10`

## benchmark overlays the reference shape.

- Us
  - Performance `9`
  - Price `6`
  - Support `8`
  - Ecosystem `7`
  - Docs `9`
  - Security `8`
- Competitor A
  - Performance `7`
  - Price `8`
  - Support `6`
  - Ecosystem `9`
  - Docs `5`
  - Security `7`
- Competitor B
  - Performance `6`
  - Price `9`
  - Support `7`
  - Ecosystem `6`
  - Docs `6`
  - Security `6`
- Competitor C
  - Performance `8`
  - Price `5`
  - Support `5`
  - Ecosystem `8`
  - Docs `7`
  - Security `9`
```

#### `quadrant` — quadrant

The compass quarters, shaded.

```markdown
<!-- _class: radar quadrant -->

`Scale · 0–5`

## quadrant shades the compass quarters.

- Our capability
  - People
    - Hiring `4`
    - Retention `3`
    - Bench depth `2`
  - Process
    - Cadence `5`
    - Rigor `4`
  - Technology
    - Platform `4`
    - Tooling `3`
    - Automation `2`
  - Risk
    - Compliance `3`
    - Resilience `4`
```

#### `small-multiples` — small-multiples

One radar per option.

```markdown
<!-- _class: radar small-multiples -->

`Scale · 0–10`

## small-multiples deals one radar per option.

- Atlas
  - Adoption `8`
  - Margin `6`
  - NPS `7`
  - Velocity `9`
  - Risk `4`
- Beacon
  - Adoption `5`
  - Margin `9`
  - NPS `6`
  - Velocity `5`
  - Risk `7`
- Cinder
  - Adoption `7`
  - Margin `4`
  - NPS `8`
  - Velocity `6`
  - Risk `5`
- Drift
  - Adoption `6`
  - Margin `7`
  - NPS `5`
  - Velocity `7`
  - Risk `8`
```

#### `minimal` — minimal

Rings stripped to the shape.

```markdown
<!-- _class: radar minimal -->

`Scale · 0–10`

## minimal strips the rings to the shape.

- Lattice
  - Performance `9`
  - Pricing `7`
  - Support `8`
  - Ecosystem `6`
  - Security `9`
- Rival North
  - Performance `7`
  - Pricing `8`
  - Support `6`
  - Ecosystem `9`
  - Security `7`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`quadrant`](#quadrant) — two axes are enough — the other six dimensions drop out
- `verdict-grid` — the criteria are categorical (pass/fail), not graded
- [`kpi`](#kpi) — the comparison is one option's metrics, not multi-option
- `compare-table` — a precise tabular comparison reads better than a shape
- [`piechart`](#piechart) — the question is part-to-whole, not multi-criterion

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/radar>


## roadmap

> Phased multi-workstream grid — phases across the top, workstreams down the side.

**Function** progression · **Form** matrix · **Substance** structure

**Drawn with** `html` — HTML/CSS all the way down, with no `<svg>` anywhere: a real `<table>` of cells carrying state markers by default, or a transposed `.horizons` grid for that variant. The layout is a grid of text and nothing is positioned by value, so the semantic table is both the right structure for assistive tech and the right layout engine for the cells.

**Tags** `planning` · `swimlane` · `milestones` · `agile`

Use to show what ships in each phase across multiple parallel workstreams. Cells render as state-token discs (pass/warn/fail/skip).

### Agent contract

**Capacity** ~4 columns (over 5 overflows) — past that, split across slides. Columns INCLUDING the leading workstream label column, so 4 = three phases. Past four phases the landscape grid crushes; at portrait the horizons cards paginate instead (one card per page since #2016 — the four-page budget it used to name is gone).

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the plan. |
| `rows` | `table` | yes | A markdown table. The header row lists the phases (each may carry an inline-code date pill, e.g. `Q2 2026`); the first column is the workstream name; each cell leads with a state marker [x]/[-]/[ ]/[/] then the deliverable. |

#### Variant decision rule

- **default (no modifier).** A plain phased grid — deliverables with state markers, no extra framing.
- **`horizons`.** The plan is framed as Now/Next/Later strategic horizons rather than literal calendar phases.
- **`status`.** Delivery state itself is the headline read — every cell already labels its own state explicitly, so the auto-emitted legend key is suppressed.
- **`swimlane`.** Each team's track should read as its own lane rather than a uniform grid — emphasizes team ownership over the grid structure.
- **`milestones`.** The phases are named, dated release gates (Beta/RC/GA) rather than generic quarters — pins a dated path.

#### Common mistakes

- **Writing the deliverable text before the state marker in a cell.** Each cell must LEAD with the state marker (`[x] Shipped item`), not follow it — a marker placed after the text isn't recognized as the cell's state.

### When to use

- **Phased delivery across workstreams.** When the question is what each team ships in each phase. Workstreams down the side, phases across the top, deliverables in the cells — the whole plan reads in one glance.
- **State markers are the second channel.** Every cell can lead with `[x]` shipped, `[-]` in flight, `[ ]` planned, or `[/]` out of scope. The audience sees both 'what' and 'how it's going' without a separate status slide. A status key is emitted automatically below the grid for the markers present (suppressed only on the `status` variant, which already labels every cell).
- **Phase headers carry meta pills.** Append `` `Q2 2026` `` to a phase header and the renderer anchors a meta pill on the right of the column. Use it for date, owner, or status tags that frame the phase.

### When NOT to use

- **One workstream.** A single row of phases is a `timeline` or `list-steps`, not a roadmap. Roadmap earns its grid only when at least two workstreams move in parallel.
- **No state markers.** A grid of bare deliverables loses half its value. Add `[x]`/`[-]`/`[ ]`/`[/]` so the audience reads progress alongside scope.
- **Past five workstreams.** More than five rows compresses cell text and the lane stripes lose their categorical read. Group adjacent workstreams or split by phase.

### Authoring

```markdown
<!-- _class: roadmap -->

## What ships in each phase, by workstream.

| Workstream | Foundation `Q2 2026` | Hardening `Q3 2026` | Scale `Q4 2026` |
| --- | --- | --- | --- |
| First workstream | [x] Shipped item | [-] In-flight item | [ ] Planned item |
| Second workstream | [x] Shipped item | [/] Out-of-scope item | [ ] Planned item |

Markers are universal: ✓ shipped, – in flight, ○ planned, ╱ out of scope.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Phased roadmap heading.                │
│                                         │
│  ┌───────────┬───────────┬───────────┐  │
│  │           │ Q1        │ Q2        │  │
│  ├───────────┼───────────┼───────────┤  │
│  │ Track A   │ [x] done  │ [-] wip   │  │
│  │ Track B   │ [ ] plan  │ [/] skip  │  │
│  └───────────┴───────────┴───────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `horizons` — horizons

Bets spread across three horizons.

```markdown
<!-- _class: roadmap horizons -->

`Three-horizon planning`

## horizons spreads the bets across three horizons.

| Workstream    | Horizon 1 `Now`          | Horizon 2 `Next`         | Horizon 3 `Later`         |
| ------------- | ------------------------ | ------------------------ | ------------------------- |
| Signal Intake | [x] Connector v1     | [-] Dedupe pass    | [ ] Auto-routing |
| Scoring       | [x] Equal weights      | [-] Per-team weights   | [/] Decision profiles |
```

#### `status` — status

Delivery state at a glance.

```markdown
<!-- _class: roadmap status -->

`Layout · roadmap status`

## status reads delivery state at a glance.

| Workstream    | Foundation `Q2 2026` | Hardening `Q3 2026`      | Scale `Q4 2026`           |
| ------------- | -------------------- | ------------------------ | ------------------------- |
| Signal Intake | [x] Connector v1 | [-] Dedupe pass    | [ ] Auto-routing |
| Scoring       | [x] Equal weights    | [-] Per-team weights | [ ] Decision profiles |
| Decision Log  | [x] Append schema    | [x] Outcome pairing      | [ ] Auditor export        |
```

#### `swimlane` — swimlane

One track per team.

```markdown
<!-- _class: roadmap swimlane -->

`Layout · roadmap swimlane`

## swimlane gives each team its own track.

| Workstream    | Foundation `Q2 2026` | Hardening `Q3 2026`    | Scale `Q4 2026`           |
| ------------- | -------------------- | ---------------------- | ------------------------- |
| Signal Intake | Connector v1     | Dedupe pass        | Auto-routing  |
| Scoring       | Equal weights        | Per-team weights   | Decision profiles    |
| Decision Log  | Append schema        | Outcome pairing        | Auditor export            |
```

#### `milestones` — milestones

The dated path, pinned.

```markdown
<!-- _class: roadmap milestones -->

`Layout · roadmap milestones`

## milestones pins the dated path.

| Workstream    | Beta `Q2 2026`       | RC `Q3 2026`           | GA `Q4 2026`              |
| ------------- | -------------------- | ---------------------- | ------------------------- |
| Signal Intake | Connector v1     | Dedupe pass        | Auto-routing  |
| Scoring       | Equal weights        | Per-team weights   | Decision profiles    |
| Decision Log  | Append schema        | Outcome pairing        | Auditor export            |
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`gantt`](#gantt) — continuous task bars across a date axis rather than discrete phase cells
- [`kanban`](#kanban) — current state by stage rather than phased schedule
- `list-steps` — single workstream sequence without parallel lanes
- `verdict-grid` — options scored against shared criteria, not phased delivery
- `checklist` — single list with state markers, no workstream dimension

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/roadmap>


## scatter

> An XY plot with real units on both axes — one dot per entity, showing how two measures relate.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Grid, both tick ladders, the two axis captions, every dot, every point name and the bubble size key are one `<svg>`. The label engine tries eight positions around each dot against the marks, the plot bounds and the labels already placed, and draws a leader when a name still cannot sit against its dot — none of that works unless all of it shares one coordinate system.

**Tags** `metric` · `tradeoff` · `positioning` · `board-deck`

Use when the argument is that two measures move together (or against each other) and both numbers matter: cost against value, price against adoption, risk against return. Both axes carry a nice-number tick ladder in the author's own units, so a reader sees the shape of the relationship and can still take a value off the chart. For a unitless 2x2 scoring, use `quadrant`.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the relationship the dots show, not the chart type. |
| `axes` | `p > code + code` | yes | The axis captions, as TWO inline-code spans in ONE paragraph — x first, then y; a THIRD names the bubble size measure. The paragraph is consumed and painted on the axes, so it never prints twice. Two codes is the discriminator: a one-code paragraph is the ordinary chart eyebrow and is left alone, so a slide can carry both. Same idiom as `matrix-grid`. |
| `points` | `ul > li` | yes | One li per entity: the name, then TWO trailing value pills — ``Atlas `$420k` `18%` ``. The first pill is x, the second y; a third sizes the dot under `bubble`. Magnitude suffixes are scale (`1.2M` is 1 200 000) and the affix every value agrees on is carried onto that axis, so a series authored in `$` gets a `$` axis. |
| `detail` | `li > ul` | no | Optional nested sublist under a point. Drives two surfaces from one source (shared with pie/funnel/quadrant via the chart-family mark-detail substrate): the Present-mode reveal popover keyed on the dot's `data-mark`, and the PDF speaker note. Renders nowhere on the chart face — a scatter with detail bullets is pixel-identical to one without. |

#### Variant decision rule

- **default (no modifier).** Two measures per entity — the plain XY plot.
- **`bubble`.** A third numeric measure (seats, headcount, revenue) should scale each dot's AREA. Keep it to about ten entities, and name the measure in the third inline-code span so the size key has a caption.
- **`trend`.** The claim is explicitly that the two measures move together, there are at least five points, and the audience will read the line as a summary rather than a forecast.

#### Common mistakes

- **Splitting a point's two numbers into one comma-separated pill, `` `4.2, 8.1` ``, the way `quadrant` takes them.** A scatter takes TWO separate pills — `` `4.2` `8.1` `` — because each axis carries its own unit and its own affix (`$420k` on x, `18%` on y), which one shared pill cannot express. An item without two numeric pills is skipped rather than plotted, so the point disappears from the chart and from its description.
- **Expecting the axes to start at zero.** They do not, and that is deliberate. The domain is the data's own range plus about 8% of air. Two measures with narrow ranges — margin 38-44%, NPS 51-58 — forced to include zero collapse into one corner and the relationship disappears. A non-negative series still gets its air below zero — a bubble sitting at zero has to fit inside the plot — but its axis never prints a negative tick.
- **Writing the axis names as a normal one-pill eyebrow, `` `Cost vs value` ``.** That is the chart eyebrow and it stays in the masthead; the plot then has unlabeled axes, which is the one thing a scatter cannot survive. Write the two captions as two inline-code spans in one paragraph.
- **Assuming a name that does not appear on the plot was lost.** A name with nowhere left to sit is dropped rather than painted through its neighbor — two overprinted names are two names lost, not one. The name still rides `data-label` on its dot, the mark-detail popover, and the `<desc>` a screen reader reads. Fewer points, or shorter names, brings it back.
- **Encoding a third measure in the dot's RADIUS.** `bubble` scales AREA, never radius, because radius-encoding overstates by the square: double the number and a radius-scaled dot looks four times the quantity. The area runs linearly from a minimum visible size, so the smallest value is still a circle you can see, and a point with no third pill is drawn at that floor and flagged rather than given a magnitude nobody typed. It also needs a size key, which is why the third inline-code span on the axis line names the measure. Past about ten bubbles the areas stop being comparable at all — split the slide.

#### Data shape

- A point is a name plus TWO trailing inline-code pills — `` Atlas `$420k` `18%` `` — x then y, in that order. A third pill is the bubble magnitude and is ignored without the `bubble` class. Fewer than two numeric pills and the item is skipped, not plotted at zero.
- Magnitude suffixes SCALE: `1.2M` is 1 200 000 and `800k` is 800 000, so the two can share one axis. `%` is not a magnitude, so `12%` is 12. A minus written outside the currency symbol (`-$400k`) is understood as negative.
- The affix is per axis and is adopted only when EVERY value on that axis agrees on it: six values in `$` give a `$` axis, and a mixed series (`$4M`, `12%`) gets a bare one, which is the honest read of an axis that cannot describe itself.
- Both axes are linear. There is no log scale, so a series spanning several orders of magnitude will pile up at one end — take the log yourself before authoring and say so in the axis caption.

### When to use

- **Two numeric measures, and the relationship is the point.** Cost against value, price against adoption, risk against return, effort against impact — with real numbers on both. The slide's claim is that the two move together, or that one entity sits off the pattern. If only one measure carries the argument you have a ranking, not a scatter: use `progress`.
- **The units matter and the reader may want to read a value off the chart.** This is the line between `scatter` and `quadrant`. A scatter prints a tick ladder and a gridline on BOTH axes, in the author's own affix — `$0 · $100k · $200k`, `20% · 40% · 60%` — so 'Atlas costs about $420k' is readable from the picture. A quadrant prints only the two extremes on a unitless canvas; you can say which box a thing is in and nothing more.
- **Five to ten entities, each with a short name.** Below four there is no pattern to see — state it in prose or a `stats` row. Past about ten the names start needing leaders and eventually get dropped rather than overprinted. Every dot carries its own name, so keep names to a word or two: a long one wraps to three lines and crowds its neighbors out of position.

### When NOT to use

- **A unitless 2x2 score.** If the axes are unitless 1-to-10 judgments and the read is which of four named zones an item lands in, use `quadrant`.
- **A trend line over a handful of points.** `scatter trend` refuses a least-squares line under five points. Even at eight it says 'these move together', not 'this predicts'.
- **Points closer together than the eye can separate.** Four tools within four points are four dots inside one dot's width: the ring keeps the overlap visible, but the names travel.
- **Time on the x axis.** A series measured at successive dates is a line, not a cloud — the reader needs the connection between points. Use `line`.

### Authoring

```markdown
<!-- _class: scatter -->

`X measure` `Y measure`

## Two measures, one relationship.

- First entity `4.2` `62`
- Second entity `2.1` `38`
- Third entity `6.8` `81`
- Fourth entity `3.4` `55`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│   What we pay most for, nobody uses.    │
│                                         │
│       80% |            (o) Ember        │
│              |      (o) Delta           │
│            40% |  (o) Cirrus            │
│          | (o) Borealis  (o) Atlas      │
│       0  +-----------------------       │
│           $0k     $200k    $400k        │
│                   ANNUAL COST           │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `bubble` — bubble

A third measure sizes each dot by area.

```markdown
<!-- _class: scatter bubble -->

`Annual cost` `Teams adopting` `Seats`

## bubble sizes each dot by a third measure.

- Atlas `$420k` `18%` `1200`
- Borealis `$310k` `24%` `640`
- Cardinal `$180k` `52%` `900`
- Dovetail `$95k` `61%` `310`
- Everline `$240k` `31%` `180`
- Fathom `$60k` `74%` `450`
```

#### `trend` — trend

A least-squares line through the cloud.

```markdown
<!-- _class: scatter trend -->

`Annual cost` `Teams adopting`

## trend draws the least-squares line through the cloud.

- Atlas `$420k` `18%`
- Borealis `$310k` `24%`
- Cardinal `$180k` `52%`
- Dovetail `$95k` `61%`
- Everline `$240k` `31%`
- Fathom `$60k` `74%`
- Juniper `$400k` `20%`
- Keystone `$88k` `66%`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`quadrant`](#quadrant) — the axes are unitless scores and the read is which of four named zones
- `matrix-2x2` — items are placed by category, not by coordinate
- [`radar`](#radar) — each entity is rated on more than two measures
- [`progress`](#progress) — one measure per entity, compared as lengths
- `list-tabular` — the exact numbers matter more than the shape of the relationship

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/scatter>


## slope

> Two labeled columns joined by one line per entity, so a change in ranking reads as a crossing.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Lines, endpoint dots, entity names, both values, the leader lines and the two column headers are one `<svg>`. A slopegraph is a geometric claim — a change in ranking IS a crossing — so every element has to sit in one coordinate system rather than be assembled from boxes that happen to line up, and the de-collision pass that keeps two close names apart needs every label's box in those same units.

**Tags** `ranking` · `transformation` · `contrast` · `board-deck`

Use when the claim is that the ORDER changed between two points — market share before and after, unit cost at two dates, satisfaction across a program, headcount either side of a reorg. Each entity is one line from its first value to its second; a swap in rank draws itself as an X. The `dumbbell` variant redraws the same data as one row per entity when the question is how BIG each gap is rather than who overtook whom.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the change, not the chart ('Two suppliers swapped places on unit cost', not 'Slope chart'). |
| `entities` | `ul > li` | yes | One li per entity, and the entity's own name is the lead text. It carries NO value of its own — the values live in the nested sublist, so a slope is always authored two levels deep. |
| `points` | `li > ul > li` | yes | Two nested items per entity: lead text = the point's name, trailing inline-code = its value — `2024 \`31%\``. The point NAMES become the two column headers, so every entity must name its points the same way; name them differently and the chart falls back to reading them positionally. Commas, currency and magnitude suffixes are tolerated (`$1.2M` is 1 200 000). A third point renders as a third column, but past two, `line` is the better component. |
| `emphasis` | `li > code` | no | An optional status pill on the ENTITY's own lead — `- Northwind \`fail\`` — from the chart family's status vocabulary (`on-track` `done` `live` `at-risk` `warn` `blocked` `fail` `pilot` `decision` `deferred`). Mark one or two and every unmarked line recedes, so the author names the story rather than the chart guessing it. This is the emphasis register to use whenever UP IS BAD. |
| `detail` | `li > ul > li` | no | A nested item with NO numeric pill is per-mark detail, not a data point. It drives the Present-mode reveal popover and folds into the slide's speaker note (`Atlas 12 to 19: Won the Rhodes contract`); the printed chart is byte-identical with or without it. |

#### Variant decision rule

- **default (no modifier).** The question is WHO OVERTOOK WHOM. Rank is the vertical position, so a swap is a visible crossing. Best at two to six entities.
- **`dumbbell`.** The question is HOW BIG each gap is. Gap becomes a length on one shared axis, which is the most precisely comparable encoding there is — and rows stay readable past six entities where crossings turn to spaghetti.
- **`signal`.** Rising is unambiguously GOOD for this metric (revenue, adoption, satisfaction). Never on a metric where up is bad — cost, churn, cycle time, defects — where a status pill on the entity says it honestly instead.

#### Common mistakes

- **Putting the value on the entity's own line — `- Atlas \`12\`` — the way `funnel` and `bar` are authored.** A slope needs TWO values per entity, so they go in a nested sublist and the entity line carries only the name. A flat list has nothing to draw and the chart passes the list through untouched. A pill on the entity line is read as a status marker, not a value.
- **Naming the two points differently under different entities — `FY24`/`FY26` under one and `2024`/`2026` under the next.** The point names ARE the column headers, so they must agree. Where they do not, the chart falls back to reading the points positionally and takes the headers from the first entity — which draws the right picture but labels it with one author's vocabulary.
- **Expecting the printed values to appear exactly as authored.** Endpoint values are formatted so the WHOLE chart speaks one magnitude: a slope whose pills are `$800k` and `$3.4M` prints `$0.8M` and `$3.4M`, because two magnitudes on one chart is a comparison the reader has to do in their head. For the ordinary case — `31%`, `12`, `15.4` — the printed value is identical to the pill. The unit itself is only adopted when EVERY value agrees on it, so mixing `31%` with a bare `15.4` drops the `%` from both.
- **Assuming a de-collided name still sits exactly beside its dot.** Where two entities are within a point or two of each other their names are pushed apart to stay legible, and a hairline leader is drawn from each moved name back to its own dot. The order is preserved, so the names still read top-to-bottom in value order.

#### Data shape

- Two values per entity, in a nested sublist, with the point names identical across every entity — those names become the two column headers.
- One metric across all entities: they share a single vertical scale, so mixing units makes a meaningless crossing.
- The scale is the data's own range and is deliberately NOT zero-based, because a zero baseline flattens a 60-to-75 slope to nothing. Vertical distance therefore reads as CHANGE, never as proportion — if the size of a gap relative to the whole is the claim, put it in the heading.
- A value that does not parse as a number is treated as detail, not as zero: the entity keeps its other point and renders as a lone dot in the column it belongs to, rather than sliding its remaining value into the wrong column.
- Magnitude suffixes are scale, not decoration — `$1.2M` positions at 1 200 000 and `12%` at 12 — so a series may legitimately mix `800k` and `1.2M`.
- An entity left FLAT (`- Atlas `12``) among nested ones has no second point and no column to sit in, so it is not drawn. Every entity needs the same two nested points.
- Six entities is the sweet spot and ten is the ceiling — past that the endpoint names de-collide into a column and the crossings stop being legible. This is a guidance number, not a split axis: like every chart in the family a slope is a GRAPHIC, so it never paginates. An overflowing slope rings the overflow warning and wants fewer entities, not a second slide.

### When to use

- **The order changed, and that is the point.** A slopegraph earns its shape when a reader should walk away knowing WHO OVERTOOK WHOM. Rank is the vertical position and a swap draws itself as a crossing, which no other chart in the family does. If nothing crosses and no gap is surprising, the numbers belong in `stats` or a sentence.
- **Exactly two points in time.** Two columns is the designed case. Three renders — a third column with its values placed inside the plot — but at that point the chart is a trend, and `line` reads it better with an axis, a grid and room for more points.
- **Two to six entities on the slopegraph, up to ten on the dumbbell.** Every entity is named at both endpoints, so the slopegraph is limited by label space rather than by palette: past six the crossings start to read as spaghetti. Switch to `dumbbell` — flat rows, no crossings, one shared axis — and ten fit comfortably. Below two, there is no ranking to change: a single line between two numbers is a delta, and `big-number` or a two-tile `stats` says it in less space.
- **Name the line you are talking about.** Put a status pill on the entity — `- Northwind \`fail\`` — and every other line recedes to a quiet gray while keeping its name and both values. This is the strongest register on the slide and the only one that stays honest when up is bad news.

### When NOT to use

- **A two-point line chart.** A two-point `line` chart draws the same two segments, then buries the crossing under a two-tick category axis, a grid and a legend. Three or more points is `line`'s job, not this one's.
- **Values that are not on one scale.** Every entity shares one vertical scale, so a revenue line crossing a headcount line means nothing. One metric per slope; if the metrics differ, use `stats` or one slope each.
- **`signal` on a metric where up is bad.** Rising unit cost painted green says the opposite of the truth. On cost, churn, cycle time or defects, mark the lines that matter with a status pill and leave the rest neutral.
- **Reading a gap against zero.** The scale is the data's own range, not zero-based — a zero baseline flattens a 60-to-75 slope to nothing. Vertical distance shows change, never proportion.

### Authoring

```markdown
<!-- _class: slope -->

## Two of them swapped places.

- First entity
  - Before `12`
  - After `19`
- Second entity
  - Before `18`
  - After `14`
```

### Variants (component-specific)

#### `dumbbell` — Dumbbell

The same before/after model as one row per entity: two dots joined by a bar on a shared value axis, with the first point hollow and the last solid.

```markdown
<!-- _class: slope dumbbell -->

## Every team came in over plan except two.

- Platform
  - Plan `48`
  - Actual `55`
- Payments
  - Plan `52`
  - Actual `44`
- Identity
  - Plan `39`
  - Actual `47`
- Data
  - Plan `61`
  - Actual `59`
- Growth
  - Plan `47`
  - Actual `53`
```

#### `signal` — Signal

Colors each line by direction — rising reads pass, falling reads fail. Opt-in, because the chart cannot know whether up is good news.

```markdown
<!-- _class: slope signal -->

## Adoption rose everywhere but the two legacy regions.

- APAC
  - 2024 `41%`
  - 2026 `58%`
- North America
  - 2024 `62%`
  - 2026 `71%`
- EMEA North
  - 2024 `55%`
  - 2026 `49%`
- LATAM
  - 2024 `28%`
  - 2026 `44%`
- EMEA South
  - 2024 `47%`
  - 2026 `39%`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`line`](#line) — three or more points in time — a trend rather than a before/after
- [`bar`](#bar) — one point in time, comparing magnitudes across categories
- [`stats`](#stats) — a row of headline figures with no ranking relationship between them
- `big-number` — one entity's change is the whole story
- [`piechart`](#piechart) — the claim is share of a whole at one moment, not movement between two
- [`progress`](#progress) — attainment against a target per metric, with no before state

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/slope>


## stacked-bar

> Bars split into parts, so one chart carries both the total for each category and the mix inside it.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — Plot, stack and key are one `<svg>` in one viewBox. A stack is a cumulative geometry — every segment's position depends on the ones below it and on the value axis both bars share — so it has to be drawn in one coordinate system rather than assembled from boxes that happen to line up, and the key has to scale with the plot it names.

**Tags** `proportion` · `board-deck` · `metric` · `summary`

Use when the claim is that a total DECOMPOSES — revenue by product line across quarters, cost by function across years, headcount by team across sites. The bar length is the total, each segment is a part, and the segments hold the same order in every bar so a part can be tracked across categories. `share` normalizes every bar to 100 % when only the mix matters; `row` runs horizontally for long category names.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name what the decomposition shows (‘Services is carrying the growth’), not the chart type. |
| `categories` | `ul > li` | yes | One li per category, in the order they should read left to right (or top to bottom under `row`). Lead text is the category label. Optionally a trailing inline-code value — the authored TOTAL, printed instead of the computed sum when the two agree. |
| `parts` | `li > ul > li` | yes | The nested sublist under each category: one li per part, lead text = the series name, trailing inline-code = its value (`Product \`2.4\``). Series order is taken from the FIRST category that names each one and is then held identical in every bar. A part a category does not name is simply absent from that bar, and a part valued zero draws nothing; nothing is inferred. |
| `detail` | `li > ul > li` | no | A nested item whose trailing inline-code pill is NOT a number is per-category detail, not a part — the chart-family mark-detail payload. It drives the Present-mode reveal on the whole bar and folds into the slide's speaker note; it paints nothing, so a chart with detail is pixel-identical to one without. |

#### Variant decision rule

- **default (no modifier).** The totals differ and that difference is part of the claim — segment length is the value, so the bar height and the mix are both read off one axis.
- **`share`.** Only the mix matters, or the totals are so unequal that the smaller bars' segments collapse to a few units. Every bar fills the axis; the absolute total is printed above it so the scale is not lost.
- **`row`.** Category names are long enough to wrap or collide under the bars — the bars run horizontally and the names take a left column.

#### Common mistakes

- **Authoring a flat list (one value per category, no nested parts).** A flat list has nothing to decompose; it renders as a single-part stack, which is just a bar chart. Nest the parts under each category, or switch the slide to `bar`.
- **Expecting the parts to keep each category's own order.** Series order is the AUTHOR's order, taken from the first category that names each part, and it is then identical in every bar. That is deliberate — a stack whose order changes between bars cannot be compared at all. Reorder the first category's sublist to reorder the stack.
- **Putting a total on the category line that does not equal the parts.** The authored total is printed only when it agrees with the sum of the parts to within 0.5 %; otherwise the computed sum is printed, because the drawn bar IS the sum and a caption contradicting the mark is worse than a rounded one.
- **Reading the named figures beside the chart as though they described every bar.** That column is the LAST bar's own mix — its parts named and valued at the height of the band each one names — and it is headed by that category's name for exactly this reason. Every other bar is read off the value axis. When a part name is too long for the column the chart falls back to the family's key, which carries the same reading under the same heading.
- **Expecting a per-segment number on every part.** Only the last bar's parts are numbered. A number on every segment was built and rendered: it needs the gutter between bars, that gutter narrows as categories are added, and past four categories the figures print over the next bar. Rather than crowd or truncate, the chart gives one bar's exact figures and the axis for the rest. Every value is in the accessible description and in the hover payload regardless.

#### Data shape

- Two to six parts per category, and two to six categories. A seventh part is not dropped: the kernel keeps the first five named and sums everything after them into one 'Other' part, so the total stays exact and the folded names are listed in the accessible description. Author the consolidation yourself rather than leaving it to the chart — you know which tail belongs together.
- A part below about 3 % of the bar renders as a sliver roughly one unit high, unlabeled. Nothing is done to rescue it: a minimum visible height would make the picture lie about the value, and every part above it would shift to pay for the lie. Fold slivers into 'Other' before authoring.
- Values are the shared Cartesian pills, so a magnitude suffix is SCALE, not decoration: `1.2M` is 1 200 000 and `800k` is 800 000, and the two sit correctly on one axis. `%` is not a magnitude — `12%` is 12. An affix every value agrees on (`$`, `kg`) is carried onto the axis; a mixed series gets a bare axis. A computed total is printed to the number of decimals you typed, so author every part to the same precision.
- Part names are set beside the last bar, so keep them short — about twenty characters fits the column. A longer name is not truncated; the whole chart falls back to the family's key instead, which costs the plot about a third of its width.
- Negative parts are drawn below the zero rule and the total is the net sum, which is honest but hard to read — the parts above zero no longer sum to the bar. If contributions are signed, `waterfall` tells that story properly.
- Under `share` the denominator is the sum of each category's ABSOLUTE part values, so every bar fills exactly 100 % of the axis and the printed percentages sum to 100 (largest-remainder rounding, never three 33s adding to 99). The absolute total is printed above each bar so normalization does not destroy the scale — unless every total is the same, in which case it says nothing and is dropped.

### When to use

- **The total AND the mix are both the story.** A stacked bar is the only chart in the family that answers ‘how big’ and ‘made of what’ in one mark. If only the total matters, use `bar`; if only the mix matters and there is a single total, use `piechart`.
- **Two to six categories, two to six parts.** Six is the categorical palette's perceptual cap (Wong 2011), and a stack is harder than a pie because the parts do not share a baseline. Four parts across five categories is the comfortable middle.
- **Reach for `share` when the totals are wildly unequal.** If one bar is five times another, the small bars' mix collapses into a few units of height and cannot be read. `share` normalizes every bar to 100 % and prints the absolute total above it, so the mix becomes readable without losing the scale.

### When NOT to use

- **Tracking a part that is not at the bottom.** Only the bottom segment shares a baseline, so a reader sees where 'Services' sits, not whether it grew. Put that part first.
- **Parts that are not parts.** Stacking revenue, headcount and NPS gives a bar whose height means nothing. The parts must sum to something a reader can name.
- **A long tail of slivers.** A 2 % part is one unit of bar height: too thin to see and impossible to label. Consolidate the tail into one 'Other' part.
- **One category.** A single stacked bar is a pie drawn as a column, and a pie reads proportions better. This chart earns its shape ACROSS bars.

### Authoring

```markdown
<!-- _class: stacked-bar -->

## What the total is made of.

- First category
  - Part one `40`
  - Part two `25`
  - Part three `15`
- Second category
  - Part one `46`
  - Part two `31`
  - Part three `12`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│     A total, and the mix inside it.     │
│                                         │
│                             FY25        │
│   [///] [///] [///]    Support   5.2    │
│   [###] [###] [###]    Licenses 19.6    │
│            -----------------            │
│            FY23  FY24  FY25             │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `share` — share

Every bar normalized to 100 %, so only the mix is comparable — the absolute total moves to a caption above the bar.

```markdown
<!-- _class: stacked-bar share -->

## share normalizes every bar, so only the mix is compared.

- FY23
  - Licenses `18.4`
  - Services `6.2`
  - Support `4.1`
- FY24
  - Licenses `19.1`
  - Services `9.8`
  - Support `4.6`
- FY25
  - Licenses `19.6`
  - Services `15.4`
  - Support `5.2`
```

#### `row` — row

The stack runs horizontally, so long category names sit in a left column instead of wrapping under a bar.

```markdown
<!-- _class: stacked-bar row -->

## row turns the stack on its side for long category names.

- Professional services
  - Delivery `4.2`
  - Training `1.6`
  - Advisory `0.9`
- Platform subscriptions
  - Delivery `11.8`
  - Training `2.1`
  - Advisory `1.4`
- Managed operations
  - Delivery `6.4`
  - Training `0.8`
  - Advisory `2.2`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`piechart`](#piechart) — one total to decompose, with no comparison across categories
- [`progress`](#progress) — independent attainment bars with no parts and no shared value axis
- [`funnel`](#funnel) — the stages are a narrowing pipeline, not parts of a total
- [`matrix-grid`](#matrix-grid) — the cells are qualitative judgments rather than values that sum

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/stacked-bar>


## state-chart

> Native state machine diagram — states as a numbered list, transitions as nested inline-code refs.

**Function** progression · **Form** timeline · **Substance** graph

**Drawn with** `hybrid` — States are authored as an HTML `<ol>`, which the browser pass measures and then paints as nodes, edges and edge labels into the `<svg>` overlay — edge routing needs each state's measured box, so the HTML has to exist first. Once painted the list is hidden, so a default slide is SVG in practice; what keeps the component hybrid is the `inline` variant, whose chip row stays HTML and is never painted over. LAYOUT IS HYBRID TOO: a chain keeps the numbered column (`state i at row i`), and a machine that BRANCHES is re-ranked by dagre using the same measured boxes. The browser measures, dagre positions — dagre cannot measure text, so it replaces the positioning half of the layout and nothing else. Self-transitions are never handed to dagre (it does not route them) and keep the hand-written router, so one machine can use both.

**Tags** `flowchart` · `states` · `workflow`

Use to show a finite-state machine — the discrete states a system can be in and the events that move between them. Authors write a numbered list; each state's index becomes its stable ref so transitions cite numbers, not names. The numbering is the REF, always: transitions cite `=> 4`, and the index badge is painted on the node. It is also the LAYOUT for a chain, where a single column is not an approximation of good layout but the right answer. A machine that branches is re-ranked by dagre, because no column can show a fan-out — the states would read as a sequence.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the state machine. |
| `eyebrow` | `p > code` | no | Optional eyebrow naming the machine or domain. |
| `states` | `ol > li` | yes | One li per state. Index is the stable ref. Trailing inline code is a closed metadata vocabulary: `start`, `end`, or one of the chart-status keywords (on-track, at-risk, blocked, done, live, decision, deferred, warn, pilot, fail). Multiple metadata tokens allowed; order is irrelevant. Unknown trailing codes are left in the rendered label. |
| `transitions` | `ol > li > ul > li` | no | Outgoing transitions from a state — one per nested bullet. Each carries a single inline-code arrow `event=>N` or `=>N` (event optional). Target is a state index or the literal `self` for self-loops. Whitespace inside the inline code is insignificant. The event text may carry explicit line breaks — a literal `\n` or an HTML `<br>` / `<br/>` — which are honored on any machine. On a BRANCHING machine (the one dagre re-ranks) the label also sits OFF the line — BELOW it on `lr`, to the RIGHT of it on the default — and text still too long for the rank gap wraps on its own there, never mid-word. A machine that lays out as a single column keeps its label ON the line under a halo, as it always has, and does not auto-wrap: a second line there would cut a gap out of the connector it labels. |
| `detail` | `ol > li > ul > li (prose, no arrow)` | no | Optional per-state reveal detail (the shared chart-family detail substrate). A nested bullet under a state that is NOT an inline-code transition (plain prose — the entry/exit action, the rule, the why) is captured as that state's detail rather than a transition. It drives two surfaces from one source: (1) Present/Practice/Preview — the state node is tagged `data-mark` and the prose rides an inert `<template class="chart-detail">` the reveal layer shows in a popover on hover/tap, with the active node lifted, the rest dimmed, and the whole figure tilting (the edge-router skips re-measuring while the tilt is live, so the routed edges stay aligned); (2) the static PDF — the same detail folds into the slide's speaker note (`Label (status): item · item`) as a Marp-faithful comment. Renders nothing on the slide face, so a machine with no prose bullets is byte-identical. Must be a bullet (`-`/`*`), not numbered. |
| `tint` | `ol > li (::: suffix), ol > li > ul > li (::: suffix)` | no | Optional `:::token` naming a THEME TOKEN to paint with — `:::state-fail-hue`, never a color literal. On a state it tints the node's gradient and stroke; on a transition it tints the line and its arrowhead. A transition takes an optional second slot for its edge-label background: `:::state-fail-hue/surface-raised`. The name is used verbatim as `var(--<token>)` and must match `^[a-z][a-z0-9-]*$` with no `--` prefix (the engine adds it); anything else is dropped whole and the element keeps its inherited paint. Existence is NOT checked at build time — this is a pure string transform and cannot read the theme's declared tokens — so a typo falls back to the untinted default and the deck degrades rather than breaking. Nothing names the typo today: it is silent on every surface, including `lint:deck`. |

#### Variant decision rule

- **default (no modifier).** The default top-to-bottom vertical stack — the plainest read, no extra framing needed.
- **`lr`.** The states read more naturally as a left-to-right flow (e.g. a pipeline direction) than top-to-bottom.
- **`inline`.** The chart needs to sit directly beside its explanatory prose rather than take the full canvas.
- **`curved`.** Eased, curved connectors fit the deck's visual tone better than straight arrows.

#### Common mistakes

- **Writing a transition's event/target as plain text instead of a single inline-code arrow.** The transition/detail distinction is purely mechanical — a nested bullet whose SOLE content is one inline-code token matching `event => N` or `=> N` (N a digit or `self`) is a transition; anything else — plain text, or an inline-code token with a non-numeric target like `` `approve => Approved` `` — is captured as detail prose instead. A transition written as plain text (or with a named target) is silently treated as detail, not as an edge, and no arrow renders.
- **Using a state's NAME instead of its numeric index as a transition target (`` `approve => Approved` `` instead of `` `approve => 4` ``).** Transitions target the state's INDEX — its position in the numbered list, which is the stable ref — not its name; a name in the target position won't resolve to any state.

### When to use

- **Finite, named states with discrete events.** When the slide is about a system with a small set of named places it can be in (Draft / Submitted / Approved / Archived) and the events that move between them (submit, approve, reject). The numbered authoring forces you to enumerate every state up front; the inline refs force you to be explicit about every transition.
- **Sequential authoring as a forcing function.** Numbering the states makes the author commit to an order. Reading the list top-to-bottom is reading the machine from start to terminal. This is the same forcing function that `list-steps` and `agenda` apply — a sequence the reader can scan in one pass.
- **Native theming without Mermaid overhead.** Mermaid's `stateDiagram-v2` works but requires a CSS override cascade with `!important` to theme cleanly (see `docs/theming.md`). A native state chart uses palette tokens directly — no overrides, no mmdc subprocess, no version-coupled SVG class names.

### When NOT to use

- **More than ~8 states.** Vertical stacks of ten or more states stop reading as a machine and start reading as a list. If the system has many states, group them into phases and show one phase at a time, or step back to a higher-level abstraction. The chart's job is to make the topology obvious in one glance.
- **Hierarchical or parallel states.** v1 grammar is one flat list of states with one outgoing arrow per nested bullet. Composite states, orthogonal regions, history nodes — anything Mermaid's `stateDiagram-v2` does and this layout doesn't — belong in a Mermaid fence via the `diagram` component.
- **Continuous processes.** If the diagram is really a workflow with stages that overlap or block (queue depth, throughput, capacity), a `gantt` or `kanban` chart reads better. State charts are for discrete, mutually-exclusive states the system flips between.

### Authoring

```markdown
<!-- _class: state-chart -->

`Submission lifecycle`

## Document approval flow.

How a draft moves from author to archive.

1. Draft `start`
   - `submit => 2`
   - `discard => 6`
2. Submitted `on-track`
   - `review => 3`
3. In Review
   - `approve => 4`
   - `reject => 1`
   - `revise => self`
4. Approved `done`
   - `publish => 5`
5. Published `live`
   - `archive => 6`
6. Archived `end`

*Rejected drafts return to the author; revisions stay in review.*
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│          State machine heading          │
│                                         │
│     [Draft ] → [Review] → [Pub   ]      │
│                                         │
│       (back-edge: Review → Draft)       │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `lr` — Left-to-right

States flow left to right.

```markdown
<!-- _class: state-chart lr -->

## lr flows the states left to right.

1. Source `start`
   - `compile => 2`
2. Compiled
   - `test => 3`
3. Tested
   - `deploy => 4`
   - `fail => 1`
4. Deployed `end`
```

#### `inline` — Inline

The chart sits beside its prose.

```markdown
<!-- _class: state-chart inline -->

## inline sets the chart beside its prose.

1. Connecting `start`
   - `retry => self`
   - `ok => 2`
   - `fail => 3`
2. Connected `live`
   - `disconnect => 1`
3. Failed `end`
```

#### `curved` — Curved

Eased arrows between states.

```markdown
<!-- _class: state-chart curved -->

## curved eases the arrows between states.

1. Draft `start`
   - `submit => 2`
   - `discard => 5`
2. In Review `at-risk`
   - `approve => 3`
   - `revise => self`
   - `reject => 1`
3. Approved
   - `publish => 4`
4. Published `live`
   - `archive => 5`
5. Archived `end`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `diagram` — the machine has hierarchical states, parallel regions, or guards that need Mermaid's full state-diagram grammar
- [`journey`](#journey) — the sequence is a user's path through tasks with mood / affect, not a system's discrete states
- [`timeline-list`](#timeline-list) — events are points in time rather than transitions between named states
- `list-steps` — a linear procedure with no branching — state-chart is overkill if there are no choices to make
- [`roadmap`](#roadmap) — parallel workstreams across phases, not a single machine's transitions

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/state-chart>


## timeline-list

> Date-stamped event list rendered as a horizontal spine — a dot per event with its date pill above and title, status pill, and body stacked below.

**Function** evidence · **Form** timeline · **Substance** series

**Drawn with** `html` — Entries stack as HTML rows against a CSS rule. The only geometry is the ordering, and document order already carries it; the bodies are paragraphs that need to wrap, so they stay HTML.

**Tags** `changelog` · `milestones` · `status` · `retrospective`

Use for milestone history or annotated timelines. Each event sits on a left-to-right spine: a dot with its date pill above it, then the title, an optional status pill, and a short body stacked beneath.

### Agent contract

**Density** aim ~16 words per item; past ~24 it reads as a wall of text — one stage in a sentence.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the timeline. |
| `events` | `ol > li` | yes | Ordered list (numbered). One li per event: a leading inline-code date pill, then the title, then an optional trailing inline-code status pill, then nested body bullets — e.g. 1. `2025 Q1` Framework approved `decision`. Status vocabulary: decision / live / at-risk / blocked / done / on-track / deferred. |

#### Common mistakes

- **Writing the date as a trailing chip after the title instead of a leading chip before it.** Unlike most other chart components (where value/status chips trail the label), timeline-list's date pill LEADS the line — `` `2025 Q1` `` then the title — a date placed after the title is treated as a stray status-shaped chip instead of the event's date anchor.

### When to use

- **Milestones in time.** Project history, regulatory deadlines, deployment phases, incident post-mortems — anywhere the sequence is in calendar time and each entry needs a date, a verdict, and a sentence of body. The date pill anchors the spine.
- **Annotated, not just chronological.** Reach for timeline-list when each milestone needs a status read (`decision`, `live`, `at-risk`, `done`) AND a sentence of context. For a plain ordered list use `list-steps`; for time-bound bars use `gantt`.
- **Four to seven entries.** Below four the spine looks empty; past seven the body bullets compress. Trim the long tail or split the timeline by phase — a 'past' deck and a 'next' deck both read better than a twelve-item spine.

### When NOT to use

- **Date-less steps.** No calendar dates? You have a sequence, not a timeline. Use `list-steps` for an ordered list or `journey` for stage-by-stage progress.
- **Date-range bars.** If each milestone needs a start and end on a shared axis, it's a Gantt chart. Use `gantt` — bar geometry conveys the durations a pill cannot.
- **Status pills as decoration.** The status pill is a verdict — `decision`, `live`, `at-risk`, `blocked`, `done`. Don't invent freeform tags; the engine tints only the known vocabulary.

### Authoring

```markdown
<!-- _class: timeline-list -->

`Eyebrow · context`

## How it unfolded.

1. `2024 Q3` First milestone
   - One-sentence description of what shipped.
2. `2025 Q1` Second milestone `decision`
   - One-sentence description.
3. `2025 Q3` Third milestone `live`
   - One-sentence description.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│        Dated milestones heading         │
│                                         │
│          ●─────────●─────────●          │
│      2024-01    2024-03    2024-05      │
│    Event one  Event two  Event three    │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `regulatory-update` — the dated entries are regulatory changes and every row carries a citation
- [`gantt`](#gantt) — milestones occupy date ranges, not single moments
- `list-steps` — the sequence has no dates, just an order
- [`journey`](#journey) — stage-by-stage progress without calendar dates
- [`roadmap`](#roadmap) — the timeline is forward-looking and bucketed by horizon
- [`progress`](#progress) — the events are parallel workstreams with completion percentages

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/timeline-list>


## waterfall

> A bridge from one total to another through signed contributions, each bar starting where the last one ended.

**Function** progression · **Form** canvas · **Substance** series

**Drawn with** `svg` — The bars, the connectors that carry the running total between them, the value axis and every printed delta are one `<svg>`. A waterfall is an arithmetic claim before it is a picture — each bar starts exactly where the previous one ended — so the whole walk has to be solved in one coordinate system rather than assembled from boxes that happen to line up.

**Tags** `board-deck` · `metric` · `transformation`

Use for a variance walk — budget to actual, an EBITDA bridge, price/volume/mix, a headcount reconciliation. Increases and decreases take the semantic pass/fail hues and float; totals anchor to zero in a neutral third register; a dashed connector carries the running total across each gap so the geometry does the arithmetic.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading — name the movement, not the chart ('We ended the year 2.2M below plan'). |
| `steps` | `ul > li` | yes | One li per bar, in walk order. Lead text = label, trailing inline-code = the value. THE SIGN IS THE SYNTAX: a value written with an explicit `+` or `-` is a signed step and floats from the running total; a value written bare is a level and anchors to zero. The first and last items are levels whatever their sign, so a walk that closes in the red still anchors. A magnitude suffix scales (`1.4M` is 1 400 000) and the authored currency or unit is carried onto the axis. |
| `marker` | `li > code:last-child` | no | An optional SECOND inline-code pill that overrides the sign rule for one bar — `total` (also `subtotal`, `sum`, `level`) anchors it to zero, `step` (also `delta`, `change`) floats it. Needed only for the two shapes the sign cannot express: a walk that opens or closes on a step, and a mid-walk subtotal the author wants stated as a level. Follows the family's two-pill convention (see `progress`). |
| `detail` | `li > ul` | no | Optional nested sublist under a step. Drives two surfaces from one source, via the shared chart-family mark-detail substrate: the Present/Practice reveal popover on the bar, and the slide's speaker note in the static PDF. It renders NOWHERE on the chart face — a walk with detail bullets is pixel-identical to one without. |

#### Common mistakes

- **Writing a driver's value bare — `Price \`1.4M\`` — when you meant a rise of 1.4M.** Sign it: `Price \`+1.4M\``. A bare value is a LEVEL and renders as a zero-anchored neutral bar, which is loud and obvious rather than a silent misread — but it is still not what you meant.
- **Expecting the default value axis to start somewhere other than zero so the small drivers read bigger.** It does not, and that is deliberate: the anchor bars are magnitudes, and a raised baseline would misstate them by whatever it was raised to. A step too small to see is floored to a visible sliver and always prints its exact figure. When the drivers genuinely ARE the slide, ask for it explicitly with `waterfall zoom`, which re-bases the axis on the walk and draws a torn edge across every anchor it clips — so the chart says out loud that it is not zero-based, instead of quietly pretending.
- **Assuming the `detail` sublist appears somewhere on the printed chart.** It renders nowhere on the chart face — it drives the on-screen reveal popover and folds into the PDF's speaker note. A walk with detail bullets is pixel-identical to one without.

#### Data shape

- Values are signed by the author, not inferred: `+1.4M` rises, `-0.8M` falls, `1.4M` is a level. A pasted U+2212 minus sign is accepted and normalized, so a figure copied out of a spreadsheet or a PDF does not silently invert.
- The magnitude suffix is scale, not decoration — `1.4M` is 1 400 000 and `800k` is 800 000, so a walk may mix the two on one axis. `%` is not a magnitude: `12%` is 12.
- An affix every value agrees on is carried onto the value axis, so a walk authored in `$` gets an axis reading `$0M · $5M · $10M`. Only the affix is read off the sign-stripped text; mixing `$4M` with `12%` in one walk yields no affix, which is the honest read of an axis that cannot describe itself.
- The signed steps should sum from the opening level to the closing level. They are not forced to: each bar is drawn at the figure the author gave it, and a walk that does not reconcile shows the gap where the last connector meets the closing bar rather than silently absorbing it.

### When to use

- **The story is how a number MOVED.** A waterfall earns its shape when the audience already knows the opening and closing figures and needs to see which contributions got you from one to the other. Budget to actual, an EBITDA walk, price/volume/mix, headcount in to headcount out. If the bars do not sum to anything, you want `bar`.
- **Four to nine bars.** Two anchors plus two to seven drivers. Three bars is a subtraction with extra steps; past nine the category names crowd and the smaller drivers stop being separable — consolidate the tail into one 'Other' step, which is also the more honest read of a long tail nobody will discuss.
- **The drivers reconcile.** The signed steps between the opening and closing levels should sum to the difference between them. That is the promise the geometry makes; when it is broken the connector visibly misses the closing bar's corner, which is the chart telling on your data.

### When NOT to use

- **Independent magnitudes with no running total.** Revenue by region, spend by department — nothing accumulates, so the floating geometry is a lie. Use `bar`.
- **Parts of one total, all positive.** Every contribution a positive share of one whole is a stack, not a walk: use `stacked-bar`, or `piechart` for one total.
- **A monotonic pipeline that narrows.** Visitors to signups to paid is a subset at every stage, not signed contributions. Use `funnel`, whose taper IS the rate.
- **Drivers that are 1% of the anchors.** A walk from 12.0M to 11.9M in steps of 20k is two anchors and a row of hairlines. Say it in a `big-number` instead.

### Authoring

```markdown
<!-- _class: waterfall -->

## How the number moved.

- Opening `100`
- First driver `+18`
- Second driver `-7`
- Third driver `-11`
- Closing `100`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│       Price paid for volume lost.       │
│                                         │
│                      +1.4               │
│          [####]  [##] .. -0.8           │
│      [####]   :   [##]  :  [####]       │
│      [####]   :    :    :  [####]       │
│      ----------------------------       │
│       Plan  Price Volume   Actual       │
│      12.0M                   9.8M       │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `zoom`

Re-bases the axis on the walk itself and tears the anchors it clips. For a compressed bridge — a 12.0M to 9.8M walk moved by steps of a few hundred thousand — where the zero-based default spends most of the plot on the two anchors and renders every driver as a hairline. Opt-in, because a silently re-based axis is the truncated-axis lie; the tear is what makes it honest.

```markdown
<!-- _class: waterfall zoom -->

`FY26 · cash`

## The drivers are the story, so the anchors are cut.

- Opening cash `12.0M`
- Price `+0.3M`
- Volume `-0.4M`
- Mix `-0.2M`
- Cost base `-1.9M`
- Closing cash `9.8M`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`bar`](#bar) — the categories are independent magnitudes with no running total, or you want the drivers alone without the anchors
- [`stacked-bar`](#stacked-bar) — the contributions are all positive parts of one total rather than signed changes to it
- [`funnel`](#funnel) — each stage is a subset of the one before and the drop-off rate is the story
- `big-number` — the net movement is the whole point and the drivers are not worth a slide
- [`line`](#line) — the total moved over time and you want the shape of the path, not the attribution

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/waterfall>


## word-cloud

> Spiral-packed word cloud — items sized by weight.

**Function** evidence · **Form** canvas · **Substance** series

**Drawn with** `svg` — The words are `<svg>` `<text>` — the packer places them at arbitrary sizes and angles, which CSS text flow cannot do — and since the 2026-07-27 conversion the `size = frequency` key and the spine share that same viewBox. Key and cloud used to scale by two different rules (`--fs-*` against the slide, the words against the svg box); now they are locked together at any size, and an export carries the legend that makes the words readable. The key stays `aria-hidden`: a screen reader gets the words themselves, not the A-ramp.

**Tags** `tag-cloud` · `themes` · `proportion`

Use for qualitative summaries — retrospective themes, survey verbatims. Word size encodes frequency or weight; not a precise data viz.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading framing the cloud. |
| `words` | `ul > li` | yes | One li per word. Format: `word `weight`` where weight is any positive number — a frequency count, a 1–5 rating, a percentage. Words are sized and colored RELATIVE to each other: the lightest maps to small/muted, the heaviest to the hero size and the loudest ink the variant has. |

#### Variant decision rule

- **default (no modifier).** The standard spiral pack — the plainest read for a moderate-sized cloud.
- **`constellation`.** The words should scatter like a starfield rather than pack tightly — a lighter, more open composition.
- **`dense`.** The corpus is large (15-20 items) and needs to pack tightly to fit without shrinking below legibility.
- **`spectrum`.** Weight should also read as a color gradient, not just size — reinforces rank with a second visual channel. The four loud tiers are stops on the theme's sequential ramp (`--seq-900/700/500/400`), so they stay ordered on a light and a dark canvas alike; the quietest tier is `--text-muted`.
- **`focal`.** One single term dominates the theme and deserves an outsized size ceiling — every variant already centers the top-weight word at the spiral's origin; `focal` widens the size range so the leader dwarfs the rest, rather than changing where it sits.

#### Common mistakes

- **Assuming a zero, negative, or non-numeric weight breaks the sizing scale.** None of these break anything — weight is min-max normalized across the whole cloud, so zero and negative numbers still get a well-defined proportional size, and a non-numeric or non-finite weight (e.g. a typo) is silently mapped to the MIDDLE of the scale rather than erroring. That silence is the actual hazard: a mistyped weight doesn't fail loudly, it just quietly lands a word at a plausible mid-size.
- **Using ascending rank numbers (1st place, 2nd place, …) as the weight, expecting rank 1 to render biggest.** Weight is a MAGNITUDE where higher means bigger — a rank-style scale where '1' means 'most important' renders as the SMALLEST word, not the biggest. Invert rank into magnitude before authoring (the top-ranked term gets the highest number).

### When to use

- **Qualitative themes at a glance.** Retrospective summaries, survey verbatims, theme extraction, sentiment scans. The cloud lands what the corpus is about; the silhouette and the biggest words are the read.
- **Weight is approximate, not exact.** Word size encodes relative frequency or weight, but the eye reads 'biggest' and 'second biggest' before any precise ratio. Reach for word-cloud when the rank matters more than the count. A 'size = frequency' key sits in the right rail to make the encoding explicit.
- **Eight to twenty items.** Below eight the spiral looks bare and the layout wastes the canvas. Past about twenty the smallest words become unreadable. Trim the long tail or cap the cloud at a 'top 15' before authoring.

### When NOT to use

- **Precise comparisons.** If the audience needs to know that 'manifest' is 1.6× 'function', the spiral packing actively misleads. Use `progress` or a bar chart where the eye can compare lengths directly.
- **Two or three words.** A three-word cloud is a list with extra steps. Use `stats` for a metric row or `big-number` for a single weighted headline.
- **Multi-word phrases.** Each li should be a single token. Multi-word phrases blow out the layout and crowd the spiral; if your data is phrases, normalize to keywords first or use `quote` for verbatim text.

### Authoring

```markdown
<!-- _class: word-cloud -->

## What the team called out this quarter.

- velocity `12`
- ownership `9`
- handoffs `7`
- review `5`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│         Weighted words heading          │
│                                         │
│         alpha   BIG_TERM   beta         │
│          emergent   HUGE                │
│            minor   medium               │
│         tiny      LARGE   keyword       │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `constellation` — constellation

Words scattered like stars.

```markdown
<!-- _class: word-cloud constellation -->

## constellation scatters the words like stars.

- component `5`
- manifest `4`
- function `3`
- form `3`
- substance `2`
- gallery `1`
```

#### `dense` — dense

The cloud packed tight.

```markdown
<!-- _class: word-cloud dense -->

## dense packs the cloud tight.

- component `5`
- manifest `5`
- function `4`
- form `4`
- substance `4`
- gallery `3`
- folder `3`
- variant `3`
- universal `2`
- cascade `2`
- scaffolder `2`
- bundler `1`
- transform `1`
- selector `1`
- palette `1`
```

#### `spectrum` — spectrum

Words colored along a scale.

```markdown
<!-- _class: word-cloud spectrum -->

## spectrum colors the words along a scale.

- component `5`
- manifest `4`
- function `4`
- form `3`
- substance `3`
- gallery `2`
- variant `2`
- universal `1`
```

#### `focal` — focal

One word crowned the center.

```markdown
<!-- _class: word-cloud focal -->

## focal crowns one word the center.

- variants `5`
- gallery `2`
- manifest `2`
- docs `1`
- declared `1`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`progress`](#progress) — the weights need precise visual comparison
- [`stats`](#stats) — the headline metrics are independent numbers, not a corpus
- [`piechart`](#piechart) — the items are parts of a whole, not free-form themes
- `quote` — the verbatim language matters more than the frequency
- `list` — single-line takeaways — the `takeaway` variant

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/chart/word-cloud>


