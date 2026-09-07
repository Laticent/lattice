<!-- Design-competition candidate, 2026-09-07. Track 1 — visual-designer.
     Title: The Three Inks — a chart design language for Lattice's 21 members
     This is a PROPOSAL, not a decision. The judged ranking and the
     verdict live in ../judgement.md; the brief it answers is in
     ../../2026-09-07-chart-design-language.md. Nothing here is
     implemented until a candidate is picked. -->

# The Three Inks

**A chart design language for Lattice's 21-member family.** One spec layer above the
curated palette. Every rule keys on the *shape of the data*, never on a member's name.

---

## 0. The one idea

> **The data is the only thing allowed to be loud. Everything else is a reference, and
> a reference is drawn at the weakest strength that still does its job.**

Three inks, in strict rank:

| Tier | What it is | What it may spend |
|---|---|---|
| **Data ink** | the marks — bars, wedges, dots, lines, bands, cells | full chroma from the categorical/semantic cycle, full weight. The only tier allowed a hue at full strength. |
| **Reading ink** | labels and values — what a mark *is* and what it's *worth* | neutral (`--text-heading` / `--text-body` / `--text-muted`). Never a categorical hue, never sat on a colored mark. |
| **Reference ink** | furniture — grids, axis rules, plot fields, zone tints, webs, frames | achromatic, off `--muted-mark` or `--state-mute-hue`. Never the categorical cycle. |

And the law that makes it enforceable, because the failure mode is not brightness, it is
**area**:

> ### The Loudness Law
> Rank every element by **area × contrast-against-canvas**. The ordering must be
> `data mark > reading ink > axis title / zone caption > baseline > axis > gridline > reference region`.
> **A reference region is last because it is largest**, and area is the one term a
> designer cannot reduce.

Four rules fall straight out, and they are the whole answer to "how does a mark stay
louder than its own backdrop":

1. A reference region is **achromatic** and at most **one value step** off the canvas.
2. A reference region **never draws from the categorical cycle.**
3. A caption on a reference region takes the **axis-title register** — mono, uppercase,
   `--text-muted` — never the category register.
4. A data mark's label may be larger and heavier than a reference caption. **Never the
   reverse.**

**This is not an invention. It is already shipped, in `bullet`.** Its qualitative bands —
reference regions — are `color-mix(in oklab, var(--state-mute-hue) 36/22/10/4%, var(--bg))`:
one achromatic hue, stepped in value, four steps, quietest at the top of the scale. Its
measure bar is `color-mix(… var(--chart-cat-1-hue) 88%, var(--bg))` with an ink hairline.
Figure and ground, correctly ranked, with the numbers measured. `funnel` and `map` do the
same thing with their marks. **The quadrant is the member that contradicts it**, and it
contradicts all four rules at once.

---

## 1. Six data shapes — the key every rule turns on

Every rule below keys on one of these. All 21 members land in exactly one.

| Shape | The reader's question | Members |
|---|---|---|
| **Magnitude** (7) | *How big, and how much bigger?* | bar, stacked-bar, waterfall, bullet, funnel, progress, word-cloud |
| **Share** (1) | *What fraction of one whole?* | piechart |
| **Position** (5) | *Where does this sit in a value space?* | scatter, quadrant, radar, map, matrix-grid |
| **Sequence** (6) | *What happened, in what order?* | line, slope, gantt, roadmap, timeline-list, journey |
| **Relation** (1) | *What connects to what?* | state-chart |
| **Partition** (1) | *What is in which bin?* | kanban |

Shape is a property of the data, not the drawing. `word-cloud` is Magnitude because it
encodes frequency as type size. `map` is Position because a region's identity is its
location. That is why the rules generalize.

---

## 2. The census tool needs three detector fixes — a cost item, not a finding

The brief already records these, and they are repeated here only because they are work
somebody owes:

- **Skip non-text containers.** The radar `tick` "split" is the `<g class="radar-ticks">`
  group element matching `[class*="tick"]`; every painted tick is `.radar-tick`, one face.
- **Add a `.cart-zero` pattern.** `bar` draws a zero rule (`cartesian.js` `buildGrid`,
  called from `bar.transform.js` `referenceLines` with `ticks: [0]`); the furniture
  detector looks only for `.cart-baseline`.
- **Add the quadrant's furniture classes** — `.quadrant-bounds`, `.quadrant-split`,
  terminal ticks — none of which match `plot-box|plotbox|frame-box|axis-line`.

Until they land the census will keep reporting a radar split that does not exist and will
misreport the new state. What matters for the language: **three members already implement
data-keyed furniture rules the census cannot see** — `bar.wantsValueAxis` (measured),
`bar.referenceLines` (zero-only), and `line`'s `ax.lo === 0 ? buildAxisRule(...) : ''`.
**The language's job is to generalize rules the tree already has, not to impose new ones.**

---

## 3. Q1 — Mark and fill

### The rule

> **One mark, one value. A fill is flat unless the ramp varies with the mark's own datum
> along an axis the reader is not already measuring.**

The second clause is doing real work: it is what separates `progress` (a ramp keyed to
`--pct`, read as intensity, while length carries the number) from a decorative wash, and
it is what the wash's own authors already implemented (below).

### Two strengths, chosen by whether text sits on the mark

The "flat 17 vs gradient 9" split is a *strength* difference misfiled as a *finish*
difference. Every washed member is a member whose mark **carries text**.

- **Plot fill** — nothing is printed on the mark: **`color-mix(in oklab, <hue> 82%,
  var(--chart-cat-base))`**, bounded by its own ink at hairline weight. Used today by
  funnel bands, map regions, stacked-bar segments, the pie's *rim* stop, the quadrant's
  *rim* stop — **and by every legend swatch in the family** (`swatchFill: … 82%` in
  `piechart.transform.js`, `map.transform.js`, `quadrant.transform.js`,
  `stacked-bar.transform.js`). 82% is not a new number. It is what the family already
  voted for, in six members and four keys. **`bullet` is a declared second strength at
  88%**, and it stays there: `bullet.styles.css` records that its measure is the one mark
  whose contrast must survive the CLI's PDF export, sampled at 150 dpi at every height of
  the bar. Moving it to 82% requires re-running that export measurement first.
- **Card fill** — the mark carries text: the shared `--chart-fill-*` recipe, so
  `--text-heading` clears AA on it, with the vivid ink on the **edge** and the
  `--chart-fill-accent` stripe. Kanban card, gantt bar, state-chart node, status pill,
  timeline pill.

### The dome dies. The wash survives — measured, not argued.

`tools/chart-mark-separation.js` is the instrument the brief built to settle this, and it
scores self-range against separation. It **condemns the dome**: 2.9× on onyx, 9.4× on the
cuoio pie, 54× on the cuoio quadrant, unbounded on indaco — a mark whose own internal range
exceeds the distance to its neighbor is a mark that stops identifying itself. Tested for the
same defect, it **clears the wash**: the mark is identified by its edge, at 5.34:1 (bar),
10.06:1 (gantt), 11.93:1 (waterfall) against the dark canvas.

**And the wash's own rationale already implements this document's rule.**
`bar.transform.js` rotates the gradient axis — `...(shape.row ? {} : { x2: 1, y2: 0 })` —
under a comment that states the argument verbatim: *"THE WASH RUNS ACROSS THE BAR'S
THICKNESS, NEVER ALONG ITS LENGTH… a column shaded dark-at-the-top to light-at-the-bottom
puts a second, meaningless gradient on the axis the reader is measuring."* `line` re-aims
its area wash for the same reason, and records that flipping the stacked-area direction was
*"tried, rendered, rejected"* because each band densest at its own base is what separates
tiled series with no gap.

So the honest residue is narrow:

- **The radial dome dies** on `piechart` and `quadrant`. Flatten each at **its own rim
  stop, 82%** — which is where the dome already ends. The wedge gets slightly *more*
  present, not less, and lands exactly on the funnel's material.
- **The vertical wash stays** on `bar`, `gantt`, `line` areas, `state-chart`,
  `timeline-list` — across-thickness shading on a mark identified by its edge, with the
  separation numbers to show for it.
- **`waterfall` is the one member where the ramp runs along the measurement axis.** Its
  columns are vertical and it takes `buildFillDefs`' default vertical axis. **Fix: rotate
  its call**, one argument, exactly as `bar` does. That is a one-line change, not a
  family-wide retirement.
- **`progress` keeps its ramp.** `calc(20% + var(--pct) * 0.52%)` is a function of the
  datum, read as intensity while length carries the number.

**The one argument that survives independently is parity, and it is worth stating.**
`themes/a11y-base.css` and `lib/base/base.print-textures.css` replace the fill outright:
`fill: url(#latt-a11y-chart-tex-N) !important` — a `<pattern>`. On an a11y theme and in
print, nine members are already pattern-filled, so the wash is not the family's finish
there. That argues the language must **hold under substitution** — the a11y render should
be a texture-substitution of the same picture — not that the screen finish must be retired.
It is answered in §9, not here.

### On radar

`radar.transform.js`'s `areaGradient` is `gradientUnits="userSpaceOnUse"`, centered on the
hub with `r=GEOM.R` — so a polygon's ink density does vary with its radius, and on a radar
radius *is* the datum. Under the rule as sharpened above, that ramp runs **along the axis
the reader measures**, which is the disqualifying case. So radar's ramp goes and its
**translucency stays** — translucency is load-bearing, because series overlap and you must
read through them.

**But the flat alpha is not perceptually neutral and must be verified, not integrated.**
Area-weighting the piecewise-linear stops over the full disc gives ≈0.157, which is where
0.16 comes from. A polygon at 60% of max only samples `r ∈ [0, 0.6R]`, where the mean alpha
is ≈0.115 — so a flat 0.16 makes low-value polygons ~35–40% denser while high-value ones
barely move, removing a magnitude cue. **Settle it by rendering:** `npm run preview` on the
radar gallery page at 0.16 against today, plus `tools/pixel-check.js`. HARD RULE #23 —
the artifact, not the integral. Ship the alpha the render agrees with.

### One more thing the flat rule fixes for free

**On dark, the pie's key swatch and its own wedge resolve to different colors.** The
swatch is `color-mix(… 82%, var(--bg))` (`piechart.transform.js:75`); the wedge's rim stop
is `color-mix(… 82%, var(--chart-cat-base))` (`:122`), and `--chart-cat-base` is
`light-dark(var(--bg), black)`. Identical on light, divergent on dark — and visible on the
dark gallery page, where the blue swatch is a pale slate beside a deep steel wedge. The
same mismatch is in `funnel`, `map` and `bullet`, which all mix toward `--bg` on dark: the
exact "warm hue into a navy canvas neutralizes to brown" hazard the family's own recipe
warns about, and the dark funnel page shows it (dull terracotta, muddy olive).

> **Rule: one base. Every categorical mark mixes toward `var(--chart-cat-base)`, on both
> canvases, in marks and in key swatches alike.**

### Edges and corners

> **A mark's edge is drawn only where two things must be told apart.**
> Against the canvas — no edge; the fill already clears 3:1.
> Against another mark of the same kind — the separator is the **canvas**, not more ink
> (`funnel` already does this: `stroke: var(--bg)`, 0.75).
> Against a reference region it sits on — its **own ink**, at hairline weight.
> A card mark keeps its `--chart-fill-accent` stripe: with a deliberately pale fill, the
> accent is the mark's only hue channel. It is meaning, not trim.

**Corner radius is unowned today** — gantt bars and kanban cards are pill-rounded while
bar, stacked-bar and quadrant zones are square, and no token governs it. One token,
`--chart-corner`, keyed on data shape: **a card mark is rounded, a measured mark is
square**, so the radius says *surface* versus *measurement* instead of saying nothing.

---

## 4. Q2 — Type

### Ratify five, name three more

The five roles in `chart-family.css` are right and resolve to one face each. Three roles
exist in the tree without a name, and each absence shows on a slide.

| Role | Class | Face | Ink | Case |
|---|---|---|---|---|
| `value` | `.cart-value` | display 700 | `--text-heading` | tabular |
| **`value-2nd`** *(new)* | `.cart-value-2nd` | label 600 | `--text-body` | tabular |
| `category` | `.cart-cat` | body | `--text-body` | as authored |
| `series` | `.cart-series` | body 600 | the series' own ink | as authored |
| `tick` | `.cart-tick` | label/mono | `--text-muted` | tabular |
| `axis-title` | `.cart-axis-title` | label/mono 600 | `--text-muted` | UPPER, 0.12em |
| **`zone`** *(new)* | `.cart-zone` | label/mono 600 | `--text-muted` | UPPER, 0.12em |
| **`key`** *(new)* | `.chart-key-label` | label/mono | `--text-muted` | as authored |

**`value-2nd` ratifies a convention three members reached independently** — funnel's
conversion rate, bullet's plan marker, stacked-bar's segment part, all the label face at
6.5px against the primary's display face at 9px. A census that lumps it with `value`
reports a deliberate distinction as a split. The obligation: **a Magnitude mark carrying
both an absolute and a rate owes `value` + `value-2nd`, never two `value`s.**

**`zone` shares the `axis-title` register exactly**, because a zone caption and an axis
title are the same kind of thing: a caption on the reference frame.

**`key` closes the family's most repeated incoherence.** gantt, journey, roadmap and
state-chart paint key labels in Outfit; map, piechart, radar and word-cloud paint JetBrains
— because `svg-legend.js:166` sets `.chart-key-label` while each HTML member styles its own
key. Nobody chose that. Give the four HTML members the shared class and the register is set
once in the family stylesheet. One class, one rule, four member stylesheets; no geometry, no
fill, no PDF byte moves outside those members' key text.

`roadmap`'s `heading` face folds into `category` — it is a bin name, and Partition and
Sequence both already spend `category` on the bin.

### Size is not shareable across viewBoxes — the one thing that must be built, not declared

`.cart-*` sizes are viewBox user units, and the boxes differ: cartesian is 320×180, quadrant
420×348, radar 300×300, each scaled into the same frame with `preserveAspectRatio`. So
`.cart-axis-title` at 6.5px renders materially smaller inside quadrant's box than inside a
cartesian one, and moving `.quadrant-axis-name` (14px in a 420-unit box) to `.cart-axis-title`
(6.5px in a 320-unit box) is a ~3.7× size change, not a register change.

> **Rule: a shared type role fixes face, ink, case and tracking; its SIZE is a family
> constant scaled by the member's viewBox factor.** `--chart-fs-axis-title` × the member's
> factor, so one editorial decision resolves to the same visual size in every box.

The numbers move in lockstep with `cartesian.js` `FS`, `quadrant.transform.js` `FS` and both
stylesheets — `test/unit/components/cartesian.test.js` pins that mirror, and it should be
extended to cover the scaled roles.

### The two splits

**`axis-title`: JetBrains-uppercase wins; `quadrant` moves.** Three reasons: (1) an axis
title is *chrome*, and the mono-uppercase register is what the chart eyebrow already
occupies — the existing `.cart-axis-title` comment says exactly this and is right; (2) it is
the majority — scatter, slope, stacked-bar; (3) `.quadrant-axis-name` today is
`--text-heading` at body-600 — the *category* register, chrome dressed as data.
`--quadrant-axis-size: 14px` retires into the scaled constant.

**`tick`: there is no split.** See §2 — fix the census.

### Which roles a member is *obliged* to print — keyed on shape

| Shape | Owes | Forbidden |
|---|---|---|
| **Magnitude** | `category` for every mark; **`value` XOR `tick`** — never both for the same number; `value-2nd` when a rate accompanies the absolute | both `value` and `tick`; two `value`s |
| **Share** | `category` + `value` per slice (direct or in the key) | `tick` — a pie has no scale to read off |
| **Position** | `axis-title` on **both** axes; `tick` at least at the extremes; `category` per plotted entity | `value` on the two positional dimensions — position *is* the value |
| **Sequence** | `category` on the time axis; `series` per line/lane; `value` at the endpoints that carry the claim | `value` on every point |
| **Relation** | `category` per node; `zone` per lane | `tick` |
| **Partition** | `category` per item and per bin; `value` per bin when the count is the point | `tick`, `axis-title` |

One refinement, keyed on data: **a third dimension encoded by size or weight owes its
`value` printed** — which is why the quadrant's `bubble` variant prints inside the bubble
and the default does not. Area is read poorly; the number earns its place.

---

## 5. Q3 — Furniture

### The rule

> **Furniture is what it takes to read a number off the chart. Print the number and you
> owe no furniture. Make the reader measure and you owe all of it.**

This rule is already in the tree — `bar.wantsValueAxis` decides it by **measuring** the
room one label has (a whole band for single series, its own slot when grouped), after an
earlier mark-count heuristic got it wrong in both directions. Generalize that, don't
reinvent it.

**Three tiers, keyed on what the reader must do:**

| Tier | Reader does | Furniture | Shapes |
|---|---|---|---|
| **Rank** | *which is bigger?* | **baseline only** | Magnitude with direct labels (bar, funnel, word-cloud, progress) |
| **Level** | *how much is this one?* | baseline + **value ticks**, no gridlines | bullet, single-series line with endpoint labels |
| **Compare across the plot** | *this one vs that one, at a distance* | baseline + ticks + **gridlines** | stacked-bar, waterfall, multi-series line, scatter |

Gridlines exist only to carry the eye *across* the plot. A chart whose marks all touch the
baseline does not need them.

**Position shapes get different furniture, because the reader locates rather than measures:**

> **plot field + plot bounds + both axis titles + terminal ticks + the split or web that
> defines the space. Interior gridlines are forbidden** — the reader reads a *region*, not a
> value, so a grid is ink for a reading nobody takes. This is why radar's web *is* its
> furniture: the web is the coordinate system, not a grid.

**Sequence with spans** (gantt, roadmap) → **period rules only**. **Relation / Partition** →
no plot furniture; the lane and column rules *are* the structure.

### The plot field — one device, four members

Position charts draw **one neutral wash over the whole plot box** at `--chart-zone`, so the
plot reads as a defined field distinct from the slide. `scatter`, `quadrant`, `matrix-grid`
and `radar` (inside the outer ring) all get the same device, and suddenly four members look
like one hand drew them.

### Furniture color — the real incoherence

One conceptual thing — "the quietest reference mark" — is spelled **four ways**:

| Where | Base token | Space | Steps |
|---|---|---|---|
| `chart-family.css` cartesian chrome | `--border` (grid, axis), `--text-body` (zero) | oklab | 62 / 88 / 42% |
| `radar.styles.css` | `--muted-mark` | **srgb** | 42/20/34%, re-declared at 26/13 for `.minimal` and 62/32/52 for `.dark` |
| `quadrant.styles.css` | `--muted-mark` | **srgb** | 18/28, re-declared at 42/28 and 58/42 |
| `journey.styles.css` | `--text-body` | **srgb** | 32%, twice |

Three base tokens, two color spaces, eight distinct percentages, and **no theme hook**.

> **Rule: all reference furniture builds on `--muted-mark`** — the token whose documented
> job is exactly this ("de-emphasized DECORATION — rules, hairlines… 3:1 graphical"),
> curated in all 13 themes — **in oklab, at three named values and ONE weight.**

**One weight, three values.** Today the three strokes are `0.5 / 0.6 / 0.7` user units on a
420-unit viewBox: sub-pixel differences nobody sees. Separating by *tone* instead of weight
is both more editorial and one fewer axis of variation. The `.cart-zero` comment's point
survives intact — the baseline is the reference the data is read against and must survive a
theme that softens the grid to near-nothing — because it keeps its own token and its own
value.

---

## 6. Q4 — Key

> **A key exists only when a mark's identity cannot be written next to it.**

Two questions decide it, in order:

1. **Does the reader need to know which mark is which?** No → **nothing.** The nine
   key-less members are right: on `bar`, `bullet`, `progress`, `waterfall`, `funnel`,
   `word-cloud`, `timeline-list` the row *is* the name.
2. **Can the name be seated adjacent to its own mark without collision?** Yes → **direct
   label** (`series` role). Otherwise → **rail**, SVG-native, inside the viewBox.

"Can it be seated" is **measured, not guessed** — `svg-label.js` `placeLabels` already
tries eight anchors at three distances, prefers above/below, draws a `.chart-leader`
hairline when the seat travels, charges `ORDER_COST` against a stacked column that would
read backwards, and drops a name rather than overprint. That machinery *is* the key rule's
implementation; the language just points at it.

**One rail geometry.** The family ships five physically different treatments — right rail
with hairline; centered row below the plot (gantt); inline bottom-left mono italic
(matrix-grid); direct; nothing. Name the right rail as *the* rail and move gantt and
matrix-grid onto it. With the `key` type role from §4, a legend then has one face, one
placement and one swatch recipe across all 21 members.

**And the binding requirement, which is cheap and which the family gets wrong today:**

> **A key entry is a SAMPLE of its mark — same fill, same edge, same texture.**

This is the tree's own hard-won lesson, already written into `base.print-textures.css`:
without explicit swatch rules *"the bars carried six distinct textures while the key carried
six flat grays, which on the one palette whose whole job is the non-color channel makes the
key unusable."* Today the pie's swatches are flat 82% squares beside domed wedges, and on
dark they are a different color entirely (§3). **Both defects close automatically when the
dome goes flat and the base is unified** — zero extra work.

---

## 7. Q5 — Motion

The vocabulary exists and is right: three styles (`build` / `together` / `rise`) × five
roles (`bar` / `sector` / `point` / `region` / `label`) in `docs/src/lib/chart-anima.ts`.
The gap is that role assignment is per-member and six members cannot animate at all.

> **Rule: a chart builds along the axis its claim is read along. Never stagger an axis the
> data does not order.**

| Shape | Role | Build | Why |
|---|---|---|---|
| Magnitude | `bar` | staggered along the value axis, authored order | the claim is length; growing along it *is* the claim |
| Share | `sector` | **all together** | a staggered wedge leaves a hole — a shape that never exists in the data |
| Position | `point` | together, then labels | a point has no growth direction; a stagger implies an order the data does not have |
| Sequence | `bar` (spans) / path draw | left to right, in time order | time is the axis |
| Relation | `region`, then edges | nodes together, edges after | an edge without its endpoints is meaningless |
| Partition | `region` | by bin, bins together | the bin is the unit |

One rule generates all six rows — including the pie exception the code already carries as a
special case.

### journey is a kernel fix, not a CSS one

`chartToScene` reads the **first `<svg>` in the section**. `journey` emits eight, and its
first carries neither an anima role nor a `<text>`, so it silently never moves — even though
it is SVG-rendered. **Fix the kernel: select the first `<svg>` that carries an anima role.**
That is one change in `chartToScene`, it generalizes (HARD RULE #1), and it is the reason
journey does not belong in the CSS-build list below.

### The five non-SVG members: a declared CSS build, not a restructure

`kanban`, `progress`, `roadmap`, `timeline-list`, `matrix-grid` have no `<svg>` at all.
**Restructuring them to SVG is the wrong trade.** They are HTML precisely because their
content must wrap and reflow; `svg-label.js` exists to fake exactly that, and faking it for
a kanban card of prose buys nothing. Each of the five is a `region` — a card, a bar, a row,
a cell — a role the vocabulary already has.

**So: one declared CSS build.** An opacity + translate reveal on `[data-anima-role]`,
staggered by `--i`, on the same clock as the SVG scene (`--chart-motion-dur`,
`--chart-motion-stagger`, §10). **This is five transform edits plus CSS, not CSS alone** —
none of the five emits `data-anima-role` or `--i` today. Stagger order follows the shape
rule: **Partition builds by bin**, so kanban staggers *columns* and reveals each column's
cards together.

Three constraints the implementation owes:

- It ships in the **motion bundle, not the layout bundle** — a deck with no chart and no
  authored scene ships no motion code at all.
- It is gated by `motion:` and scoped `:not(section.print)`.
- Its end state is `opacity: 1; translate: none`, so **print renders the final frame and
  existing PDF/PPTX bytes do not move.** No `margin` anywhere near it (HARD RULE #20).

`chart-family.docs.md` § "Motion + mark-detail support, by member" is stale — it lists none
of the eight members added since. Under this language that table stops being a hand-kept
roster: motion support becomes a consequence of the shape rule plus the `render` manifest
field, which is already gated by `npm run check:render-nature`.

---

## 8. Q6 — Detail reveal

Everything needed already exists in `_chart-family/mark-detail.js`: the authored grammar
(a nested sublist under the mark's `<li>`), `detailPayload` emitting inert
`<template class="chart-detail" data-mark="i">`, and `detailNote` folding the same content
into a Marp-faithful speaker-note comment that `notes-core` lifts into the PDF text
annotation and strips **before render**.

> **Rule: a mark owes a popover when it has a name and a datum the slide cannot show —
> that is, when the mark comes from an `<li>` and the author wrote a nested list under it.**

The obligation is on the **kernel**, not the author: every member whose marks come from
list items must emit `data-mark` and route `splitDetail`. That is 20 of 21; `roadmap`'s body
is a markdown table and keys off its rows the same way.

**Which members gain it:** `journey`, `kanban`, `matrix-grid`, `progress`, `roadmap`,
`timeline-list`, `word-cloud` — the census's seven. Mechanical: the substrate is pure
string-in/string-out with one `lib/core` import, already imported by four kernels (HARD
RULE #1 satisfied by construction).

**Print fallback:** already defined and already proven. A member that gains a popover gains
a speaker note and **loses no pixel** — the comment is stripped before render, so the chart
is byte-identical.

---

## 9. Q7 — The non-color channel

> **Rule: the second channel is chosen by what the color carries — and the second channel
> is exactly as wide as the channel it backs up.**

| Color carries | Second channel | Members |
|---|---|---|
| **category** | **texture** — a `<pattern>` from the shared set, and the same pattern on its key swatch | the ones that still encode category by hue after §3 and §11 |
| **status** | **shape + word** — the masked `--mark-*` prefix and the pill's own text label | gantt, progress, state-chart, timeline-list |
| **magnitude / sequence** | **nothing — but the ramp must be monotonic in lightness** | map choropleth, progress, bullet |

### The channel is at its ceiling, and that is the real Q7 defect

The mechanism is *not* done. `themes/a11y-base.css` and `lib/base/base.print-textures.css`
wire `nth-of-type(6n+1 … 6n+6)` — **six patterns** — while the engine emits
`latt-a11y-chart-tex-1..8` and the categorical cycle is `--chart-cat1..8` (a11y's own ramp
runs `#2e2e2e` → `#929292`, eight steps). **Categories 7 and 8 silently wear the textures of
1 and 2**, and at the piechart's documented 11-slice ceiling, slices 7–11 repeat 1–5. So
"the a11y render is a texture-substitution of the same picture" is false past six
categories — and adding members to a channel that merges makes the merge more visible, not
less.

Two ways out, and the language must pick one out loud:

- **Widen the wiring to 8**, matching the emitted pattern set and the cycle; or
- **declare a family-wide 6-category ceiling** — which is what `funnel.styles.css` already
  does deliberately (Wong 2011, six hues) — and enforce it everywhere, including the pie.

Either way, **gate it**: a test that reads the declared cycle width and the wired
`nth-of-type` modulus and fails when they diverge. A redundant channel narrower than the
channel it backs up is a silent merge, and a silent merge is worse than no channel.

### Two members dissolve rather than get patched

The figure/ground rule and the accessibility rule turn out to be the same rule seen twice:

- **`quadrant`** stops encoding category by hue at all (§11). Nothing left to texture.
- **`word-cloud`** encodes magnitude by *size*; its hue is decorative, so it goes to one
  ink, and nothing is left to texture either.
- **`matrix-grid`** spends six categorical hues on **row labels** — the axis a reader
  decides least from, and the exact defect `2026-06-22-kanban-chart-redesign.md` records
  fixing. Apply the same rule: **row labels lose categorical hue.** A design language is
  what stops that recurrence.
- **`bullet`** is already correctly exempt and the print sheet says why: *"its three layers
  are separated by VALUE, not hue… and value is exactly what survives grayscale."*

**Real additions: two** — `map` (categorical mode only; its sequential mode is already
lightness-monotonic by design) and `kanban` — plus their key swatches. Two rule blocks
against an existing pattern set, once that set's width is settled.

**And four of the twelve "uncovered" members are covered by a different channel.**
`a11y-base.css` already prefixes every `.chart-status` pill with a masked shape via
`content: "\2713\00a0" / ""` — the sanctioned grayscale shape channel under HARD RULE #29,
with the empty alt keeping it out of the a11y tree. Listing those four as gaps overstates
the debt.

---

## 10. Q8 — Tokens

Everything reused unchanged: the whole palette (`--chart-cat-N-hue/-fill/-ink`,
`--chart-state-*`, `--chart-cat-base`, the `--chart-catN` override hooks), the
`--chart-fill-top/-bottom` wash stops (the wash survives, §3), `--chart-hairline`,
`--chart-accent-lg`, `--chart-fill-accent`, `--chart-fill-edge`, `--chart-rule`,
`--chart-text-min`, `--muted-mark`, `--mark-*` / `--shape-*`, `--cat-N-texture`.
**The palette is not touched.**

**Retired (1):** `--quadrant-axis-size`, which folds into the scaled family constant.

**New (10):**

| Token | Group | What it is |
|---|---|---|
| `--chart-plot-fill` | fill | the plot-fill strength — `82%`, the family's existing constant, named once |
| `--chart-corner` | fill | the card radius; a measured mark takes 0 |
| `--chart-grid` | furniture | the quietest reference line |
| `--chart-axis` | furniture | the plot bound |
| `--chart-baseline` | furniture | the zero/reference rule the marks are read against |
| `--chart-furniture-w` | furniture | one stroke weight, **user units** (not `--chart-hairline`, which is a `px` clamp and the wrong unit inside a viewBox) |
| `--chart-zone` | reference | the neutral wash a plot field or reference region takes |
| `--chart-fs-*` + per-member viewBox factor | type | shared type sizes that resolve to one visual size across unequal viewBoxes (§4) |
| `--chart-motion-dur` / `--chart-motion-stagger` | motion | the shared clock, so an HTML-bodied build matches an SVG scene |

Every rule in this document is now expressible in `var(--token)` (HARD RULE #3), and a
theme can curate furniture and zone tone for the first time.

**`--chart-zone` is a value ramp, not a single tint**, promoted from bullet's measured
scale: `color-mix(in oklab, var(--state-mute-hue) 36 / 22 / 10 / 4%, var(--bg))` light,
`40 / 26 / 13 / 5%` dark. `bullet` keeps its bands by *consuming* the family token instead
of declaring its own.

---

## 11. The quadrant — the sharpest case, worked

The quadrant violates all four Loudness rules simultaneously, and both halves of the
inversion are verifiable in source and visible in the render:

**Color.** Four zone rects consume `--chart-cat-1..4-hue` on the four largest areas of the
slide, painted with an inline `<radialGradient>` running 42% → 82% toward
`--chart-cat-base`, at `fill-opacity: 0.6`. The dots take `--cell-ink` — **the hue of the
zone they sit in**. So figure and ground are the same hue family, and the ground has 100×
the area. `chart-mark-separation.js` scores the dome here at 9.3× (a11y) and 54× (cuoio):
each zone's internal range dwarfs the distance to its neighbor.

*(The inline `style="fill:url(#…)"` on `.quadrant-tint` is deliberate and documented —
`--cell-fill` is unavailable inside a `<defs>` stop, which is not a descendant of the rect
that sets it. The class's `fill-opacity: 0.6` is not overridden and is live: the "~40% into
the quiet register" mechanism did ship. It is simply not enough against four zones at 82%
hue.)*

**Type.** The zone caption `.quadrant-label` is `12px / 700 / uppercase / 0.04em`, colored
from `--cell-ink`. The data point's own name `.quadrant-dot-label` is `9.5px / 500 /
sentence case`, neutral. **The chrome is 26% larger, 200 weight units heavier, tracked,
uppercase and chromatic; the data is smaller, lighter and neutral.**

### What the quadrant becomes

1. **The four zone tints go.** The cells are defined by their position relative to the
   split, and the split line already says that; four hues were never information. In their
   place: **one plot field** at `--chart-zone-3`, the same device scatter, matrix-grid and
   radar get.
2. **The dots become one ink** by default — the quadrant has no categorical dimension. The
   **`cohort` variant keeps hue**, because there the author supplied one. A data-shape rule,
   not a member rule.
3. **The zone captions move to `.cart-zone`** — mono, uppercase, `--text-muted`, at the
   scaled family size. Chrome reads as chrome.
4. **The axis names move to `.cart-axis-title`**, likewise scaled — not transplanted at
   6.5px into a 420-unit box.
5. **Optional emphasis, earned:** the author may tint exactly one cell, at `--chart-zone-2`,
   when that cell is the point (the `threshold` variant's target). The loudest chrome on the
   slide becomes the quietest, most meaningful chrome.

Result: from 4 hues of chrome + 4 hues of data, to **1 hue of data + 1 neutral field.**
Figure and ground invert back the right way round, and the member drops off the
accessibility debt list without a single texture rule.

**One consequence to state plainly:** any deck that read "dot color = which quadrant"
loses a channel. It was fully redundant with position, and position is still drawn — but it
is a real change to a real deck's appearance, and it belongs in the export sign-off.

---

## 12. All 21 members

| Member | Shape | Fill after | Furniture after | Key after | 2nd channel | Changes? |
|---|---|---|---|---|---|---|
| bar | Magnitude | wash, across thickness *(unchanged)* | baseline; ticks+grid only when labels don't fit | none | texture | furniture + type tokens |
| stacked-bar | Magnitude | plot 82% flat *(already)* | baseline + ticks + grid | direct | texture | furniture tokens only |
| waterfall | Magnitude | wash **rotated across thickness** | baseline + ticks + grid | none | texture *(by meaning)* | **gradient axis** |
| bullet | Magnitude | plot 88% *(declared 2nd strength)* | ticks; band = `--chart-zone` | none | value *(exempt)* | consumes family zone token |
| funnel | Magnitude | plot 82% *(already)* | none | none | texture | base → `--chart-cat-base` |
| progress | Magnitude | **value ramp — keeps** | none (prints %) | none | status shape+word | detail + CSS build |
| word-cloud | Magnitude | flat, one ink | none | none | size | hue → one ink; detail |
| piechart | Share | **flat 82%** | none | rail; direct when it fits | texture *(width gate)* | **dome dies**; swatch base |
| scatter | Position | flat | field + bounds + titles + ticks + grid | direct | texture *(already)* | field; furniture tokens |
| quadrant | Position | **flat, one field** | field + bounds + split + titles + terminal ticks | none (cohort: rail) | dissolves | **rebuilt — see §11** |
| radar | Position | flat alpha, **verified by render** | web *(already)* | rail | dash *(already)* | ramp → flat alpha |
| map | Position | flat 82% *(already)* | none | rail | **texture (categorical)** | base; texture rules |
| matrix-grid | Position | flat, **row labels lose hue** | field + cell rules | rail *(moves to the family rail)* | dissolves | field; detail; CSS build |
| line | Sequence | stroke; area wash *(unchanged, re-aimed already)* | baseline *(when 0 in domain)* + ticks + grid | direct *(already)* | dash *(already)* | furniture tokens |
| slope | Sequence | stroke | ticks + titles | direct *(already)* | dash *(already)* | furniture tokens |
| gantt | Sequence | card wash *(unchanged)* | period rules | rail *(moves to the family rail)* | status shape+word | key face; rail |
| roadmap | Sequence | card wash | period rules | rail | status shape+word | detail; CSS build |
| timeline-list | Sequence | card wash *(unchanged)* | none | none | status shape+word | detail; CSS build |
| journey | Sequence | none/stroke | mood axis | rail | — | furniture token; detail; **kernel scene fix** |
| state-chart | Relation | card wash *(unchanged)* | none | rail | status shape+word | key face; corner token |
| kanban | Partition | card wash | column rules | none | **texture** | texture; detail; CSS build |

**Out of scope, stated rather than left silent:** kanban's vertical composition (the board
top-aligns and leaves roughly half the slide empty) is a layout problem, not a chart-language
one. It needs its own issue.

---

## 13. Does it hold everywhere?

**cuoio / indaco (hue-differentiated).** Unchanged palette; the pie and quadrant marks get
*more* present, and the family's share charts finally match its magnitude charts in material.

**onyx (value, not hue).** The biggest winner. Onyx's eight categories are a grayscale ramp
`#2e2e2e…#929292`; four of those as *quadrant backdrops* were near-indistinguishable to
begin with, and the dome scored 2.9× self-range-over-separation there. One data ink plus one
neutral field is strictly better.

**a11y-achromatopsia / print.** These surfaces replace fills with flat `<pattern>`s, so the
language must hold under substitution — which is exactly why §9's width gate is part of the
answer rather than a footnote. Once the pattern set is as wide as the cycle, the a11y render
becomes a texture-substitution of the same picture instead of a different one.

**Light and dark.** One base — `--chart-cat-base` — on both, in marks and in swatches, kills
the dark-canvas mud in funnel/map/bullet and the dark-canvas swatch mismatch in the pie.

**Print.** No motion, no hover, possibly no color. The CSS build's end state is the poster
frame; the popover's content is already in the speaker note as a PDF annotation; the
non-color channel is texture, shape and value. Nothing in the language requires a screen.

---

## 14. What it costs

### Members that change

**20 of 21 change something; 3 change visibly.** The visible three: `piechart` and
`quadrant` (dome → flat, and quadrant rebuilt) and `radar` (ramp → flat alpha, delta to be
measured). `waterfall`'s rotation changes its shading direction but not its silhouette or
its separation. The wash members keep their fill.

### Committed PDF churn — measured

Counted over `git ls-files '*.md'` matching `_class:` and their sibling PDFs:

| Group | Decks | Committed PDFs |
|---|---|---|
| dome (piechart ∪ quadrant) | 41 | **31** |
| radar | 25 | 19 |
| waterfall | 7 | 7 |

Plus `chart.gallery.light.pdf` and `chart.gallery.dark.pdf`. **Retiring the dome instead of
the whole gradient family cuts the churn from 79 committed PDFs to roughly 31 plus radar and
waterfall.** Treat these as an upper bound: `\bbar\b` also matches `stacked-bar`.

### What breaks

1. **The export sign-off gate fires, and this is the single biggest cost.** Every one of
   these changes the bytes of committed PDFs. CLAUDE.md's QUALITY BAR makes that a hard
   stop: render a representative deck in **both dark and light** and get human sign-off
   before merge.
2. **`check-viz-render.js` gates the quadrant label's measured 65% hue-mix floor** (largest
   share that clears AA in every theme; worst case `concrete` light at 4.99:1). Moving that
   caption to `--text-muted` on a neutral field changes what the gate is protecting — it must
   be **re-pointed, not deleted.**
3. **`test/unit/components/cartesian.test.js` pins the CSS ↔ kernel font-size mirror**, and
   the scaled type roles (§4) widen what it must pin: the family constant, each member's
   viewBox factor, and both stylesheets move together.
4. **The texture-width decision is a fork with a real cost either way** — widen the wiring to
   8 (two members' worth of new rules, and the pie's 11-slice ceiling still merges) or declare
   and enforce a 6-category family ceiling (a change to what an author may write). Pick it
   before adding members to the channel.
5. **Five transform edits** for the CSS build (`data-anima-role` + `--i` on kanban,
   matrix-grid, progress, roadmap, timeline-list), plus one kernel edit to `chartToScene` for
   journey.
6. **`tools/chart-language-census.js` needs its own three detector fixes** (§2).
7. **Two docs go stale on contact:** `chart-family.style.md` § "Fill finish (a future
   variant)" (the held pie+quadrant variant is now decided) and `chart-family.docs.md` §
   "Motion + mark-detail support, by member".
8. **Deck-visible behavior change:** the quadrant's dot color stops encoding its cell
   (default and `threshold`; `cohort` is unaffected).

### What does not change

The palette and all 13 curations. The override hooks. `--chart-cat-N-fill/-ink` derivations
and `derive-chart-cat-ink.js`. The `--chart-fill-*` wash stops. Label placement
(`svg-label.js`). The `.chart-frame` skeleton and every inset token. Every PDF of a deck
carrying neither the dome nor radar nor waterfall.

### The implementation is smaller than the churn suggests

The dome lives in **two transforms** — `piechart.transform.js` and `quadrant.transform.js` —
plus `radar.transform.js` `areaGradient`. Waterfall's fix is one argument to an existing
call. Three files carry the whole fill question.

### Phasing

**P1 — figure/ground, and no re-scoring.** The quadrant rebuilt, the dome flattened, the
plot field on four members, one `--chart-cat-base` (a genuine bug: the pie's swatch mixes
toward `--bg` while its wedge mixes toward `--chart-cat-base`, and they diverge on dark),
the shared `key` face and rail, and the texture-width gate. Every item here is
high-confidence, evidenced by the separation scores or by a source-visible mismatch, and
none of it depends on a contested verdict. One export sign-off covers it.

**P2 — furniture and type.** The `--muted-mark` unification, the three furniture values, the
scaled type roles, `value-2nd`, `--chart-corner`, waterfall's rotation, the census fixes.
No new capability; low visual delta; the type work is where the viewBox-scaling design must
be built rather than declared.

**P3 — coverage.** The CSS build for five members plus the `chartToScene` fix for journey,
detail reveal for seven, texture for two. Additive; no existing pixel moves.

---

## 15. The verdict on fill, in one paragraph

Kill the dome; keep the wash. The **radial dome** on `piechart` and `quadrant` goes,
flattened at its own rim stop so the wedge joins the funnel's material exactly and the key
finally samples its mark — because `chart-mark-separation.js` measures each domed mark's own
internal range at 2.9× to 54× the distance to its neighbor, which is a mark that has stopped
identifying itself. The **vertical wash stays**, because the same instrument clears it: the
mark is identified by its edge at 5.34:1 to 11.93:1, and `bar` and `line` already rotate the
gradient so it shades thickness and never length — the argument for killing it is an argument
their authors implemented. `waterfall` is the one member still ramping along the axis the
reader measures, and it is fixed by rotating one call. `progress` keeps its ramp because
`calc(20% + var(--pct) * 0.52%)` is a function of the datum. `radar` keeps its translucency,
which is functional, and loses a ramp that runs along its own measured radius — at an alpha
the render decides, not the integral. After that, one number, 82%, paints every plot mark and
every key swatch in the family (with `bullet`'s 88% declared and justified), on one base, on
both canvases, in 13 themes, in print and in grayscale — and the grayscale channel is finally
as wide as the palette it stands in for. That is what makes 21 charts look like one hand.