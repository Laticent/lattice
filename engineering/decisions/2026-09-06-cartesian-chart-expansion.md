---
status: in-progress
summary: >
  The chart family ships fourteen components and not one of them plots a value against an
  axis — `progress` is a percentage fill with no scale, `quadrant` scores on a unitless 2x2,
  and `gantt`'s only axis is time. So a deck that needs "revenue by quarter", "where the
  budget went" or "actual against plan" has nothing to say it with, which is the largest gap
  in the catalog and in the most-used direction. Seven Cartesian members close it — bar,
  stacked-bar, line, waterfall, scatter, slope, bullet — each admitted because it makes a
  claim no existing member can make. The load-bearing decision is that the axis machinery
  landed FIRST, as one shared substrate: seven charts built one at a time would have minted
  seven private tick generators, seven gutter conventions and seven gridline weights, which
  is seven charts that look like seven products.
---

# Cartesian chart expansion — the family had no plot

**Scope**: `lib/components/chart/_chart-family/cartesian.js` (new shared kernel),
seven new chart components, `chart-family.css` § Cartesian chrome.

---

## 1. The finding

Lattice ships fourteen chart components. Not one of them plots a value against
an axis.

| Existing member | What it actually is |
|---|---|
| `funnel` | proportional trapezoid stack — no axis |
| `gantt` | time bars on a **date** axis, no value axis |
| `journey` · `kanban` · `roadmap` · `state-chart` · `timeline-list` | board / flow layouts |
| `map` | choropleth |
| `matrix-grid` | qualitative verb × reach **table**, cells tagged at parse time |
| `piechart` | parts of a whole |
| `progress` | HTML `<div>` percentage bars — a `--pct` fill, no scale, no grouping |
| `quadrant` | 2 × 2 scoring on a **unitless** canvas |
| `radar` | multi-attribute polygon |
| `word-cloud` | frequency typography |

So a deck that needs to say *"revenue by quarter"*, *"where the budget went"*,
*"actual against plan"*, or *"cost against value"* has nothing to say it with.
Those are not exotic asks — in a proposal or a board pack they are most of the
chart slides. The two closest members mislead an author into the wrong claim:
`progress` looks like a bar chart but encodes a percentage with no axis, and
`quadrant` looks like a scatter but its axes carry no units.

This is the largest single gap in the component catalog, and it is a gap in the
**most-used** direction, not an exotic one.

## 2. What we are adding, and why each earns its place

Seven components. Each is here because it makes a **claim** no existing member
can make — the family is organized by claim, not by geometry (`funnel` and
`progress` are both horizontal bars and are separate components for exactly this
reason).

| Component | The claim it makes | Why not an existing member |
|---|---|---|
| `bar` | *these categories differ in magnitude* — column or row, single or grouped, optionally diverging | `progress` has no value axis and cannot group; a percentage is not a magnitude |
| `stacked-bar` | *this total decomposes into these parts, across categories* — absolute or 100 % | `piechart` decomposes ONE total; comparing two pies is the anti-pattern its own docs warn against |
| `line` | *this moved over time* — multi-series trend, with `area` / `stacked-area` | nothing in the family plots a continuous series at all |
| `waterfall` | *we got from A to B via these signed contributions* — the bridge | no member can show a running total with signed steps |
| `scatter` | *these two measures are related* — XY, optionally `bubble` for a third | `quadrant` scores on a unitless 2 × 2; a scatter carries real units and a real scale |
| `slope` | *the ranking changed between two points* — before / after per entity | `line` at n = 2 is a worse slopegraph: a slope chart's whole design is the crossing |
| `bullet` | *actual against target, inside a qualitative band* | `progress` shows attainment with no target and no band |

### Considered and deliberately deferred

Recording these matters as much as the seven — a list of what we chose *not* to
build is what stops the next session re-litigating it.

- **`sankey`** (flow / allocation). A real gap. Deferred because its layout —
  node ranking, crossing minimization, ribbon routing — shares nothing with the
  Cartesian kernel and is a component-sized project on its own. It should be its
  own branch, not a rider on this one.
- **`treemap`**. Hierarchical size. Squarified layout is self-contained; in the
  proposal use case it overlaps `piechart` and `matrix-grid` enough that it did
  not outrank the seven.
- **`heatmap`** (numeric matrix). `matrix-grid` covers the qualitative grid.
  A numeric one is a genuine gap but a narrower one.
- **`pareto`** (bars + cumulative line). Reachable later as a `bar` variant now
  that `bar` and `line` share a kernel and a plot box. Kept out of v1 so the
  first release of each member is one claim, not two.
- **`gauge`** / radial KPI. `big-number` and `bullet` both say it better; a
  gauge spends a quarter of the slide on a dial to encode one number.
- **`histogram`** · **`box plot`**. Distribution charts are analyst tools. They
  belong in the catalog eventually; they are not what a board deck is short of.
- **`marimekko`** · **`candlestick`** · **`radial bar`**. Niche or actively
  discouraged.

## 3. The architectural decision: one shared plot substrate

Adding seven Cartesian charts one at a time would have minted **seven private
tick generators, seven gutter conventions, and seven gridline weights** — that
is, seven charts that look like seven products. The family's existing bespoke
geometries get away with it because none of them shares furniture with another;
a plot is the opposite case.

So the axis machinery landed first, as
`lib/components/chart/_chart-family/cartesian.js`, and every member consumes it
(HARD RULE #1). It owns:

- **the series DSL** (`parseSeries`) — one authoring shape, two depths;
- **nice-number ticks** and affix-preserving tick formatting;
- **linear and band scales**;
- **the plot box** — one gutter convention, one viewBox per orientation;
- **the painted chrome** — grid, zero rule, axis rule, tick labels, category
  labels (wrapped, collision-culled), axis titles;
- **the canonical rectangular fill**, as SVG `<defs>`.

It owns **no color** and **no marks**. Paint lives in `chart-family.css`
§ Cartesian chrome; the marks are each member's own geometry.

### Three details in the kernel that are decisions, not defaults

**One viewBox per orientation, shared by every member.** Landscape is
`320 × 180`, matching the funnel, so the whole family shares a canvas aspect.
Portrait is `320 × 300`, *not* the funnel's `320 × 420`: a funnel is a vertical
stack and grows happily to 420, but a plot at that ratio letterboxes its own
plot area into a narrow column and throws the type ratio out — the viewBox
height maps to the body height, so a taller viewBox scales the whole unit down.
Square keeps the landscape box, matching `roadmap`'s decision for the same
reason: a square deck's chart body is wide enough, and a third geometry buys
nothing `preserveAspectRatio="xMidYMid meet"` does not give for free.

**Detail versus data is settled by whether the pill is a NUMBER.** The family
already uses a nested sublist two ways: `radar` reads it as the series values,
`funnel` and `piechart` read it as the mark-detail reveal payload. A Cartesian
member needs both. The rule is that a nested item whose trailing inline-code
pill parses as a number is a data point, and anything else is detail. Testing
for a *number* rather than merely for a *pill* is what keeps a detail bullet
that happens to end in inline code — a region, a code name, a ticket id — from
being silently plotted at zero.

**The magnitude suffix is scale, not decoration.** `parseValue('1.2M')` is
1 200 000. The funnel's parser takes the first numeric run and drops the suffix,
and its own manifest warns authors off `$12k` because of it — which is fine for
a chart whose values are all one magnitude and wrong for an axis that has to put
`800k` and `1.2M` on one scale. `%` is explicitly not a magnitude, so `12%` is
12. The authored affix is then carried onto the axis: a deck that writes `$4.2M`
gets an axis reading `$0M · $2M · $4M`, not a bare `0 · 2 · 4` with the unit
stranded in the title. Only an affix **every** value agrees on is adopted — a
mixed series gets none, which is the honest read of an axis that cannot describe
itself.

## 4. What is NOT covered

- `sankey`, `treemap`, `heatmap`, `pareto` — see §2; each needs its own branch.
- The kernel does **no** log or time scale. Every member here is linear-on-value
  and categorical-on-the-other-axis. A time scale would be `gantt`'s, and
  merging the two axis models was out of scope for this change.
- `parseSeries` caps distinct series at 6 (Wong 2011, and the categorical
  palette curates 8 slots). Past the cap it reports the overflow rather than
  truncating silently — dropping data quietly is worse than an unreadable chart.

## 5. Canonical sources

- `design/skills/chart-component.md` — the recipe every member followed.
- `lib/components/chart/_chart-family/cartesian.js` — the substrate.
- `lib/components/chart/_chart-family/chart-family.css` § Cartesian chrome — the paint.
- `lib/components/chart/_chart-family/chart-family.docs.md` — the frame and dispatcher.

## 6. Known, recorded, not fixed here

Four things the adversarial trio, the visual sweep and the accessibility-tree
check found that this change records rather than repairs, each with the reason.

**`scatter`'s tight cluster labels are not in value order.** On the twelve-tool
stress slide, four dots inside one dot's width get four labels, and
`placeLabels` — greedy, eight candidate positions per point, each point placed
independently — settles `Cardinal` above `Granite` when their dots run the other
way. Every leader line is correct and present, so the attribution is recoverable;
a reader pairing by proximity alone gets that one pair wrong. Sorting the input
by `cy` was tried and made it worse (it swapped a different pair). The real fix
is an ORDERED pack, which `slope` now has for its gutter columns — lifting that
into `placeLabels` touches `quadrant` as well and is a substrate change on its
own, not a rider on this one.

**The `cards-stack` anti-pattern slide reserves no bottom padding for a second
line of body copy.** A one-line card has generous air under it; a two-line card
grows into the padding, so the closing code chip is drawn across the card's
bottom border. Every one of the seven galleries' "When NOT to reach for X" slides
hit it, and every one is now written to one line — which is a workaround, not a
fix. The form is shared by every component's anti-pattern slide in the tree.

**`scatter`'s `domainFor` is a second implementation of the substrate's
`niceTicks({ tight: true })`, and the better one.** Both docblocks justify
themselves with the same anecdote. Folding `domainFor` back into the substrate is
right, and it moves `slope`'s axis as well as `scatter`'s, so it belongs in its
own change with its own renders.

**`role="img"` does not prune the SVG subtree, so a reader hears the desc AND
every text node under it.** Dumping the real accessibility tree over the rendered
deck (Chromium CDP `Accessibility.getFullAXTree`) shows all seven charts exposing
a correct accessible name and a correct description — and also 24 unignored
descendants under `bar` alone, one `StaticText` per category label and tick. A
screen reader therefore announces the curated sentence and can then walk into
`North America`, `EMEA`, `$4.2M` as loose text: verbose, not wrong. **This is not
new here.** `funnel`, `gantt`, `map`, `piechart`, `quadrant`, `radar` and
`state-chart` all use the same `role="img"` + `<title>`/`<desc>` idiom and all
behave the same way, so the fix is one `aria-hidden` decision taken once for the
whole chart family — off the path of this change under HARD RULE #18, and worth
its own render pass because hiding the subtree also hides it from find-in-page.

## 7. Surfaces driven, and what each one showed

HARD RULE #23 asks a verification claim to name its surface and carry an
artifact from it. These are the surfaces a Cartesian chart can reach, each
driven on this branch rather than argued from a proxy.

| Surface | How it was driven | What it showed |
|---|---|---|
| CLI PDF export | 151 slides rasterized, three reviewers, `indaco` light + dark plus a `cuoio` pass | Geometry decodes to the printed values — the bridge closes to 0.03M, bullet bars and ticks match their readouts, stacked shares sum to 100 |
| Docs-site component preview | `/components/chart/<name>/` in a real browser, screenshotted | A different builder from the CLI draws the same chart |
| Studio — Write | Markdown inserted through CDP `Input.insertText`, live re-render watched | The preview redraws on edit; the slide chip resolves the component |
| Studio — Read·Article | The Read tab, same session | The chart re-hosts at article width; the widened band ladder reads better there than on the slide |
| Studio — Present | The Present button, same session | Full-bleed render keeps endpoint labels, ticks and the crossing legible |
| Accessibility tree | Chromium CDP `Accessibility.getFullAXTree` | All seven expose a correct name and a description carrying the real numbers — and it caught "down 1 points", which no unit arm could |
| Print texture channel | `color-mode: print` render of the demo deck | Series separate by hatch, not hue |
| CVD texture channel | The deck rendered under `theme: a11y-deuteranopia` | The waterfall's three registers survive total loss of color as three distinct textures: diagonal hatch for the rise, horizontal for falls, dot grid for anchors |

**PPTX is not on this list on purpose.** `lib/export/pptx-export.js` is an
image-per-slide writer that full-bleeds one PNG per slide, rasterized from the
same headless-Chromium render the PDF sweep already covered. It cannot
distinguish a chart from any other slide content, so driving it would re-test
the rasterizer rather than these components.

One useful accident: the ad-hoc waterfall typed into the Studio dropped two
steps, so its drivers did not reconcile — and the component said so, both in
the geometry (the dashed connector visibly misses the closing bar's corner) and
in words (`<desc>`: "Actual restates the total at 9.8M where the steps landed on
10.7M, which does not reconcile"). The chart refuses to launder bad arithmetic,
which is the promise `waterfall.docs.md` makes under "The drivers reconcile".

