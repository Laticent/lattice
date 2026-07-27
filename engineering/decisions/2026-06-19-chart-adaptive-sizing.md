---
status: in-progress
summary: Charts restructure to the box they occupy, not just scale — all 13 are own renderers (HTML/CSS or native SVG; none are Mermaid — §10 corrects an earlier mislabel) that re-lay-out per box family (sequential charts go vertical, radial stack-over-legend, square fill, gantt label-over-bars, state-chart fills + lr→tb, journey vertical reflow). Phase 1 landed timeline-list as the proven vertical-rail pattern; phases 2–4 sequenced.
version: 1
supersedes: none
builds-on: 2026-06-18-component-adaptive-sizing.md, 2026-06-13-svg-native-legend.md
---

# Chart adaptive sizing — charts restructure to the box, not just scale

**Status:** in progress (Phase 1 landed: shared diagnosis + `timeline-list`
vertical restructure as the proven pattern). Phases 2–4 sequenced below.
**Related:** `2026-06-18-component-adaptive-sizing.md` (the box-local `@container`
foundation this builds on), `2026-06-13-svg-native-legend.md`.

---

## 1. The problem

Every chart renders its **landscape** internal layout (chart-beside-legend, bars
across the width, a left-to-right timeline) and is then scaled to fit its box. In
a tall box, fit-to-width shrinks that whole landscape-shaped composition into a
short horizontal band — tiny, illegible, with most of the canvas empty. Charts
**scale but don't restructure**. (Evidence: the 9:16 render of piechart, radar,
progress, funnel, quadrant, timeline-list, journey — every one a small band under
a sea of white.)

This is the chart-shaped instance of the box-local adaptive-sizing thesis: a
component should adapt to the **box it occupies**, not just scale.

## 2. Why it's tractable

**All 13 charts are own CSS/HTML/SVG renderers** — the `_chart-family` kernel pulls
the list out of the section and emits reflow-able markup wrapped in `.chart-frame`
(`.chart-header` / `.chart-body` / `.chart-caption`). **(Correction — see §10: an
earlier draft of this doc called `gantt`/`journey` "Mermaid SVG". They are NOT —
`gantt` is an HTML/CSS grid, `journey` and `state-chart` are hand-rolled native
SVG. The only true Mermaid surface is the separate `diagram` component, which
already reorients flowchart/graph `LR↔TB` and is out of this chart scope.)** So the
HTML/CSS charts restructure with the *same* box-local
`@container lattice (aspect-ratio …)` mechanism the component sweep uses; the
native-SVG charts restyle in their kernel. Because the rules gate to tall/square
aspects, **landscape output stays byte-identical** (normal visual review, not the
export-gated path).

## 3. The decision (confirmed)

- **Own-renderers (11): CSS box-local restructure.** Not "fill/center better" —
  genuinely re-lay-out per box family. Keyed on the nearest `lattice` container,
  so it fires on a portrait deck AND inside a narrow nested cell.
- **Native timeline/graph charts (gantt, journey, state-chart): restyle in the
  kernel.** *(Corrected from the original "switch the Mermaid LR→TB direction" —
  these are native, not Mermaid, and `gantt`/`journey` have no "direction" to flip:
  a Gantt is a horizontal time axis, a journey is horizontal stages. §10.)* `gantt`
  reflows box-local in CSS (label-over-bars, full-width); `state-chart` is already
  vertical by default (fill + `lr`→`tb` fallback); `journey` gets a true vertical
  reflow in its kernel. Keyed on the deck-wide
  orientation stamp (the pragmatic limit for opaque SVG — it's baked at render
  time, before the final box is known; the nested-cell case is out of reach for
  Mermaid and that's acceptable).

Rejected: a render-time kernel that emits different markup per family — it only
knows the deck-wide orientation (reintroducing the limitation the whole effort
moves away from) and it alters exported bytes (sign-off gate). CSS box-local is
the cheaper path that also composes with nesting.

## 4. Taxonomy — intrinsic dimensionality drives the move

| Class | Charts | Tall-box move |
|---|---|---|
| **Sequential / 1-D** | `timeline-list`, `progress`, `kanban`, `roadmap`, `funnel`* | **go vertical** — stack the sequence down the page, each item a full-width row on a left rail |
| **Radial / fixed-aspect** | `piechart`, `radar` | **stack chart-over-legend + enlarge** the dial to fill the width, centered |
| **Square / matrix** | `quadrant` | **fill width + center**; reflow axis labels / caption into the freed vertical space |
| **Spatial / graph** | `map`, `state-chart`, `word-cloud` | `word-cloud` already fills; `map` = **graceful letterbox**; `state-chart` is already vertical → **fill the height + `lr`→`tb` fallback** (§10) |
| **Native timeline** (NOT Mermaid — §10) | `gantt`, `journey` | `gantt` = **label-over-bars, full-width, fill height** (CSS box-local); `journey` = **vertical reflow** in the kernel. Neither has a "direction" to switch — a Gantt is a horizontal time axis, a journey horizontal stages |

\* `funnel` is already vertical; it needs to *fill*, not restructure.

## 5. The proven pattern (Phase 1 — `timeline-list`)

The horizontal grid spine (`grid-auto-flow: column`) becomes a vertical timeline
via one `@container lattice (aspect-ratio <= 0.9)` block:

- `.timeline-spine` → `grid-auto-flow: row`, one column, `align-content:
  space-evenly`, full height — items distribute down the page.
- `.timeline-spine::before` (the spine line) → rotated to **vertical** (a left
  rail: `top/bottom` + `width: 2px` instead of `left/right` + `height`).
- `.timeline-item` → `display: grid; grid-template-columns: auto 1fr` — the **dot
  rides column 1 (the rail)**, everything else fills column 2 and left-aligns.
- Chips (date pill, status) get `justify-self: start` so they hug their content;
  title/body keep the default stretch so prose fills and wraps.

Verified by render at `size: story` (a clean vertical timeline) and landscape
(byte-identical horizontal timeline). **This `auto 1fr` rail is the template** the
other sequential charts reuse.

## 6. Per-chart plan (the queue)

- **`progress`** ✅ *(Phase 2)* — bars already stack but crowd the top; rows now
  fill the height (`space-evenly`) and tracks thicken. (Fill, not restructure.)
- **`kanban`** ✅ *(Phase 2)* — `.kanban-board` `row → column`, lanes distribute
  down the canvas, cards within a lane wrap as a row.
- **`funnel`** ⏭ *(Phase 4, render-time)* — SVG viewBox is baked landscape
  (`0 0 320 180`); CSS can only letterbox. Needs a portrait viewBox from
  `funnel.transform.js`.
- **`roadmap`** ✅ *(Phase 4, render-time — see §10)* — the kernel auto-selects the
  transposed `.horizons` card form on a portrait deck and the cards stack to one
  column (box-local), compacted to fit a tall box.
- **`piechart` / `radar` / `quadrant` / `map`** ✅ *(Phase 4, render-time — see §9)* —
  **CSS cannot reflow these.** Per `2026-06-13-svg-native-legend.md`, the dial/plot
  **and its legend share ONE `<svg>` viewBox** and scale as a single unit (pie `0 0
  viewW viewH`, radar `300×300`, quadrant `420×320`) — the legend is SVG geometry, not
  an HTML sibling, so "chart-above-legend" can only be done by the kernel emitting a
  *tall* viewBox (legend below the dial). Same class as `funnel`. **(This corrects
  the original Phase 3 plan, which assumed a CSS-reflowable HTML legend.)** Built as the
  portrait **legend-below** layout in `svg-legend.js` (§9).
- **`gantt`** ✅ *(Phase 4 — see §10)* — native HTML/CSS grid (NOT Mermaid), so it
  reflows box-local: on a tall box the lane label rides ABOVE full-width bars and the
  lanes distribute down the canvas. No "direction" to switch.
- **`journey`** ⏭ *(Phase 4 — next slice)* — native SVG (NOT Mermaid); needs a true
  vertical reflow (stages stacked, mood as a vertical rail), not a direction flip.
- **`state-chart`** ✅ *(Phase 4 — see §10)* — native SVG graph; default is already
  vertical, so it fills the height and an `lr` machine falls back to `tb` on portrait.
  real reflow emerges. **`word-cloud`** already fills any aspect (no change).

`adapt.families` is set on each chart manifest only once its layouts are
render-verified (the schema's render-backed rule).

## 7. Sequencing

1. **Phase 1 (landed):** diagnosis + `timeline-list` vertical (the pattern).
2. **Phase 2 (landed):** `kanban` (board `row → column`, lanes distribute, cards
   wrap as a row) + `progress` (rows fill the height, tracks thicken). Verified
   portrait + landscape; landscape byte-identical.
3. **CSS box-local work is COMPLETE.** Verifying Phase 3 before writing CSS showed
   the radial/square charts can't be reflowed in CSS (single-SVG, §6) — so the only
   CSS-figure charts (`timeline-list`, `kanban`, `progress`) are all done in Phases
   1–2. Everything else bakes its composition into an SVG/table/Mermaid render.
4. **Phase 4 — render-time (kernel) work; ONE effort; touches exported bytes →
   explicit sign-off + maker-checker.** All the remaining charts converge here
   because they all bake layout at render time:
   - **`piechart` / `radar` / `quadrant` / `map`** — emit a *tall* viewBox with the
     legend below the dial (via `svg-legend.js`), keyed on deck orientation.
   - **`funnel`** — portrait viewBox from `funnel.transform.js` (`0 0 320 180` →
     tall).
   - **`roadmap`** — *(done, §10)* kernel auto-selects the transposed `.horizons`
     card form for tall boxes; the cards stack box-local.
   - **`gantt`** — *(done, §10)* native HTML/CSS, so it's actually a box-local CSS
     reflow (label-over-bars), not a render-time bake. **`state-chart`** — *(done,
     §10)* native, fill + `lr`→`tb`. **`journey`** — *(done, §10)* native SVG, its own
     vertical board (stages stacked, tasks as rows, mood washed + plotted). *(None
     are Mermaid; the original "LR→TB" framing was wrong — §10.)*

   These are deck-orientation-keyed (render-time can't see a nested cell) — the
   pragmatic limit for baked-SVG/Mermaid, and acceptable since CSS can't reach them.

**Runtime ordering (the footgun a JS geometry-baking transform introduces).** A
chart transform that bakes orientation into geometry must see `data-orientation`
on its FIRST build — the `chart-frame` idempotency guard means a late stamp never
triggers a rebuild. On the export/engine path this is free (the slide pipeline
stamps during `md.render`, before `applyAllToHtml`). On the **runtime** path the
stamp lived in `patchSectionGeometry()`, which ran *after* the content transforms —
so the live preview rendered a landscape funnel on a portrait deck while the export
rendered the tall one (caught in maker-checker review). Fixed by hoisting a
lightweight `stampOrientation()` pass ahead of `runAllContentTransforms()` in the
runtime bootstrap; verified in a real browser that the preview now matches the
export. (CSS-reflow consumers are immune — a late attribute just flips a rule;
geometry-baking transforms are the first to need the early stamp.)

Each phase: render at portrait + landscape, confirm reflow fires and landscape is
byte-identical, before setting `adapt.families`. The four-family thresholds stay
the single source in `lib/adaptive/families.js` (drift-guarded).

## 8. Mobile padding — chart-frame width reclaim (landed with funnel)

A portrait/mobile chart read squeezed and its labels/numbers were hard to read.
Root cause is general, not funnel-specific: `--canvas-scale` reaches **2.29× on
9:19.5 mobile** and multiplies every `--sp-*` token, so a component with a large
horizontal inset (`.chart-body` used `--sp-2xl` in both its width calc and its
padding) balloons that inset on a narrow canvas and starves the figure. The outer
`section` gutter (5cqi, raw — NOT canvas-scaled) is fine; the gap is internal
horizontal insets scaling up where width is most precious.

Fix is **box-local, not systemic** (chosen after rendering both): a
`@container lattice (aspect-ratio <= 0.9)` rule pulls `.chart-body`'s side inset in
(`width: 100cqi − 2·--sp-sm`, `padding: --sp-md --sp-sm`). This is the right axis —
the squeeze is a *centered-figure* problem (the SVG sits centered in the body), so
it bites charts (incl. the SVG-baked `quadrant`/`radar`/`piechart`, all chart-frame
members) but NOT stacked-text components, which reflow full-width on mobile and were
visually unchanged by either option. A systemic `--canvas-scale` dampen was tried
and rejected: huge blast radius, and it mostly retunes *vertical* rhythm — the wrong
axis for this problem.

**Follow-up (separate — a reflow, not padding): `image`.** Its half-canvas split
stays side-by-side on a 9:19.5 mobile (text-left / image-right both ~540px wide),
crushing the text panel. The fix is a portrait box-local *reflow* — stack the image
over the text — not a padding tweak; tracked here for a later pass.

## 9. Legend-below for the keyed charts — ✅ built (#445)

`piechart` / `radar` / `quadrant` / `map` bake the diagram **and** a right-rail
legend into ONE wide viewBox via `buildSvgLegend` (`svg-legend.js`). On a portrait
deck that wide unit letterboxes. The fix is a portrait **legend-below** layout —
diagram on top, legend stacked beneath, both centered — emitted at render time
(the orientation thread from §7 is already merged and read by the kernel).

**Why it was the biggest slice (a focused pass, not an end-of-session rush):** it's
a redesign of the shared legend keystone plus a caller-contract change.

What shipped:
- `buildSvgLegend({ …, orientation })`. **Landscape path stays byte-identical** —
  a branch so the existing right-rail code runs untouched when `orientation !==
  'portrait'` (guarded by golden-diff + `svg-legend.test.js` byte-identity assertions
  with the per-call spine id normalized).
- **Contract change:** the builder returns a new **`diagramDx`** (horizontal offset).
  All four callers changed `transform="translate(0 ${dy})"` → `translate(${dx} ${dy})`
  (`buildPieChart` in `chart-family.js` + the `radar`/`quadrant`(cohort)/`map`
  `.transform.js` kernels). `dx` defaults to `0`, so landscape is unchanged.
- **Portrait geometry** (`buildPortrait`): the wrap budget (`PORTRAIT_LABEL_COL_R`)
  widens — the label uses the full width below, not a narrow rail, so the measurement
  branches too. `viewW = max(diagramRight + 2·diagramPadX, legendBlockW)`;
  `diagramDx = (viewW − diagramRight)/2`; `diagramDy` = a small top margin; the legend
  block is centered below at `y = diagramHeight + diagramDy + gap`;
  `viewH = diagramDy + diagramHeight + gap + stackH + margin`; the spine rotates to a
  **horizontal** accent rule between the diagram and the key. The row-emit + a11y
  `<desc>` are shared (`emitRows` / `buildDesc`) so a row reads identically in either
  orientation — only the anchors and start-y differ.
- **`diagramPadX` (a real-implementation finding).** Radar's axis labels are anchored
  at `R + labelGap` and spill PAST its 300-wide box; the landscape right rail absorbs
  that overflow, but portrait has no rail, so "Geometry" clipped at the viewBox edge.
  Added an optional portrait-only `diagramPadX` that reserves symmetric side room and
  re-centers the diagram; radar passes `PORTRAIT_LABEL_PAD = 64`, the other three pass
  `0` (their content fits `[0, diagramRight]`). Caught by looking at the render, fixed
  before extending past the piechart proof.
- **`adapt.families` — deliberately NOT set** on these four. That field is the
  box-local `@container` CSS contract (adapts to the *occupied* box, incl. a nested
  cell). These charts are render-time, **deck-orientation keyed** — exactly like
  `funnel`, which carries no `adapt.families`. Their manifests already omit an
  `orientation` restriction (= "both"), and that is now genuinely honored. Setting a
  box-family list would over-claim a nested-cell reflow they can't do.

Verified: all four at `size: story` (portrait) in dark (`indaco-dark`) + light
(`indaco`) — diagram on top, key stacked below — and landscape byte-identical (unit
byte-identity assertions + the full suite green). Export sign-off taken on the
piechart proof before extending to `radar`/`quadrant`/`map`. Maker-checker run over
the keystone diff (blast radius across four charts). Demo deck:
`examples/legend-below-portrait.md` (+ committed `.pdf`).

Sequencing followed: `svg-legend` below-mode + `piechart` as the proof → sign-off →
`radar`/`quadrant`/`map`.

## 10. Native timeline/graph charts — `gantt` + `state-chart` portrait (✅ built)

**Correction first (this is the important part).** Earlier sections called `gantt`
and `journey` "Mermaid" and proposed an "LR → TB direction-switch." Both claims are
wrong, and the wrongness is load-bearing — it would have sent the work down a path
that can't exist:

- **None of these are Mermaid.** `gantt` is an HTML/CSS grid (`buildGanttChart` in
  `chart-family.js`); `journey` and `state-chart` are hand-rolled native SVG. The
  *only* Mermaid surface in the repo is the separate `diagram` component (fenced
  ` ```mermaid `), which already reorients flowchart/graph `LR↔TB` via
  `lib/integrations/mermaid/reorient.js` and passes non-switchable types through. It
  is out of this chart-adaptivity scope.
- **A Gantt / journey has no "direction" to flip.** Even Mermaid's own `gantt` and
  `journey` are fixed horizontal layouts (time axis / stage row) with no vertical
  mode. So "switch LR→TB" was never available. The honest move is a **restyle**, per
  the chart's structure — which is exactly what being native lets us do.

**`gantt` — CSS box-local reflow (it was misfiled as render-time).** Because it's
HTML/CSS, it reflows with the same `@container lattice (aspect-ratio <= 0.9)`
mechanism as `timeline-list`/`kanban`/`progress` — no kernel change, landscape
untouched. On a tall box: the lane label moves ABOVE its bars (freeing the 14cqi
label column), the axis spacer collapses so the Q-ticks span the full width and stay
aligned, the bars run full-width and grow taller, and lanes distribute down the
canvas. Bar labels stay **left-aligned** (the base): adjacent tasks that share a
boundary quarter overlap by a column (span is inclusive) with the later bar drawn on
top, so a left-aligned label sits in the visible left portion — a *centred* one
slides under the neighbour and clips (caught in render review; the cause was
self-inflicted by an initial centre-align experiment). Residual: a *sandwiched*
mid-window bar has a narrow visible window and can clip a long label by a char or
two — the same inherent behaviour as landscape, just tighter; accepted, not a
regression.

**`state-chart` — fill + `lr`→`tb` fallback (native SVG, browser-measured edges).**
The default machine is already a vertical top-to-bottom column, so a tall box needs
no reflow — but the inter-node gap is `cqi` (a share of *width*), so on a narrow box
it shrinks and the chain strands in the middle. Fix: the node column takes the full
height and distributes the states (`justify-content: space-evenly`); the browser
edge-pass re-measures the laid-out positions, so the arrows follow. An `lr` (or
`horizontal`) machine can't fit a tall box, so on a portrait deck the direction is
forced back to `tb` — and crucially **at the transform**, not in CSS, because the
edge router keys off `data-sc-dir`: CSS and the router must agree or the arrows
desync from the nodes. `orientation` is threaded `chart-family → buildStateChart`.

**Contract.** Both relax `orientation` to `["landscape", "portrait"]` and drop out of
`LANDSCAPE_ONLY_LAYOUTS` (matching the `timeline-list`/`progress` precedent;
`adapt.families` stays unset like the other reflow charts). Verified at `size: story`
in dark + light; landscape byte-identical (full suite green); maker-checker over the
diff. Demo deck: `examples/portrait-gantt-statechart.md` (+ committed `.pdf`).

**`journey` — vertical reflow (✅ built, the deepest of the three).** Native SVG,
horizontal stages — it genuinely needed a restructure, not a transpose: the
landscape board is three *parallel* column-grids (stages / tasks / moods aligned by
a shared column count), which can't express "a stage label grouping its task ROWS"
in CSS. So portrait gets its own emission (`emitJourneyBoardVertical`, behind the
`orientation` thread): stage groups that physically contain their task rows, each
row = actor dots + label + a mood marker. Mood treatment (chosen with the user from
three rendered prototypes — face-offset, row-wash, gridded-axis) is the **A+B
blend**: the row is *washed* by mood (pain warm → delight cool, the instant arc) AND
the face is *plotted* by mood with a dashed reach to the spine (the exact value) — so
a dip like a `:1` task reads twice (pink row + sad face pulled to the pain edge).
Stages grow proportional to their task count (`--span`) so a busy stage doesn't
overflow; rows are natural height (no ballooning on sparse decks). The five variants
(heatmap/curve/swimlane/weighted) fall back to this unified vertical view in
portrait — coherent, not broken; their distinct landscape reads are a follow-up.

**Two threading findings (journey):**
- **The class must stay EXACTLY `journey-board`.** The chart-frame body matcher
  (`chart-family.js` `bodyRE`) keys on `class="journey-board"`; emitting a second
  class (`journey-board--vertical`) made the wrap silently reject the board and
  revert to the raw markdown list. The vertical flag moved to `data-orient`.
- **Both render paths thread orientation.** Build/HTML goes through
  `journey.applyToRenderedHtml` (now reads `data-orientation` per section);
  runtime/preview goes through `chart-family.applyToDom` → `transformChartSection`
  (already passes it). Verified both emit the vertical board, so preview matches
  export (the §7 stamp-ordering footgun).

**`roadmap` — auto-select the horizons card form (✅ built, the cheapest).** The
default roadmap is a wide workstream × phase table that letterboxes in a tall box
(columns crushed, header collisions). It already ships a `horizons` modifier that
transposes the table into phase cards — so portrait just **auto-selects it**: the
chart-family dispatch appends `horizons` to the section class on a portrait deck,
which drives BOTH the transpose (`transformRoadmapSection` reads the token) AND the
section-class-gated card CSS (it rides into `newCls`, so the live section carries
the class). The cards then **stack to one column** box-locally (`@container`), and
the card chrome compacts for the tall box: the phase header collapses to one row
(eyebrow · title) and each workstream row goes single-line (`LABEL · value`) so a
3–4 phase roadmap fits without overflow. All roadmap treatments (`status`,
`swimlane`, `milestones`) unify to the horizons stack in portrait — coherent, like
the journey variants. A CSS source-order trap surfaced: the portrait `@container`
block had to sit **after** the base horizon-card rules (equal specificity) or they
override it. Landscape (N-across) untouched.

With this, **Phase 4 is complete**: funnel, the four keyed charts, gantt,
state-chart, journey, and roadmap all adapt to a tall box — the whole chart family
now restructures to the box it occupies. Demos: `examples/portrait-journey.md`,
`examples/portrait-roadmap.md` (+ committed `.pdf`s).

> **Mechanism superseded (2026-07-27).** The per-family chart recipes below still
> hold; the `@container lattice (aspect-ratio …)` trigger they are written with does
> not. It measures the section's CONTENT box, which drifts off the deck aspect
> (#1218), so charts now select the engine's `data-family` stamp instead. See
> `2026-07-27-family-stamp-replaces-container-queries.md`.
