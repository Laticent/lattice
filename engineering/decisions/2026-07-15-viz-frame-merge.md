---
status: in-progress
summary: Implementation design for the `.viz-frame` merge — the owner-approved (2026-07-13 §2.2 go-ahead, satisfied 2026-07-15) unification of the chart group's `.chart-header/.chart-body/.chart-caption` skeleton and diagram's `section.diagram` skeleton into ONE Frame/Cell structure (cell-masthead[masthead-lede] / cell-stage / cell-footer). Charts stop being special: chart-family.js emits eyebrow/h2/subtitle as TOP-LEVEL section chrome (drops the `.chart-header` wrapper), `chart-frame` joins the `wrapsStageBody` set, and the standard masthead transform hoists the chrome into `masthead-lede` and wraps the figure + caption into `.cell-stage` — the SAME path diagram uses. The caption (visible `.chart-caption` AND the popover `<template class="chart-detail">`) stays component-owned in the stage cell; it is NOT hoisted. `claim-hero`/`claim-bleed` are NOT a special case — their bleed title treatment (keyed on `.chart-header h2` + `::after`) is fallout of the uniform hoist, reworked or retired at export sign-off, not exempted. One restructure PR across all 13 chart-frame layouts (byte-moved → dark+light export sign-off), then `conformance:strict` flips per-chart as cheap follow-ons. Protected overflow machinery (§5 of the model-driven doc) proven per chart family; verified by the full adversarial trio (HARD RULE #25). No color token touched (the 2026-07-13 palette decision stands: do NOT migrate the palette).
---

# `.viz-frame` merge — one Frame/Cell skeleton for the chart + diagram groups

**Date:** 2026-07-15
**Area:** charts / diagrams / forms / masthead transform / architecture
**Owner go-ahead:** given 2026-07-15 (the "A" decision — build `.viz-frame` first,
then flip charts strict on top). This is the go-ahead `2026-07-13-viz-color-and-frame-unification.md`
§2.4 was waiting on.
**Builds on:** `2026-07-13-viz-color-and-frame-unification.md` (the frame-merge
recommendation + caveats), `2026-07-14-one-frame-model.md` (§3.1 — the stage region
is multiple flowed siblings; a single stage Cell needs a wrapper, byte-identity
re-earned), `2026-07-15-model-driven-frame-render.md` (the conformance:strict
program; §5 PROTECTED overflow machinery; diagram = the byte-proven first canvas).

---

## 1. What this is (one move, stated plainly)

Charts and diagrams are the same presentation object — a captioned, full-bleed
visual with a title. Today they use two different skeletons:

| Group | Today's DOM (section children) |
|---|---|
| **charts** (13 chart-frame layouts) | `.chart-header` (eyebrow+h2+subtitle) · `.chart-body` (canvas) · `.chart-caption` |
| **diagram** (already conformance:strict) | `.cell-masthead > .masthead-lede` (eyebrow+h2+subtitle) · `.cell-stage` (dek + mermaid + Key Insight) · `.cell-footer` |

`.viz-frame` makes charts adopt **diagram's** structure. After the merge, a chart
renders:

```
<section class="<layout> viz-frame form">
  <div class="cell-masthead"><div class="masthead-lede"> eyebrow + h2 + subtitle </div></div>
  <div class="cell-stage"> <figure the chart canvas> + <caption> </div>
  <div class="cell-footer"> footer + progress + pagination </div>
</section>
```

**The owner's framing, adopted verbatim:** *"charts are not immune or special when it
comes to hoisting. There is nothing special about them beyond the actual chart along
with its label. Its header, eyebrow, subtitle are all standard."* So the eyebrow, the
title (h2), and the subtitle are ordinary masthead chrome and **hoist into
`masthead-lede`** exactly like every other component's. Only the chart figure and its
caption stay in the stage.

## 2. Mechanism (single source of truth, both render paths)

The chart DOM is built in ONE kernel — `lib/components/chart/_chart-family/chart-family.js`
(`transformChartSection` / `applyToRenderedHtml`), which both the emulator/engine
string path and the runtime DOM path route through (`lib/transformers/chart-family.js`).
HARD RULE #1 stays intact: change the kernel, both paths follow.

Three edits, in dependency order:

1. **`chart-family.js` — stop burying the chrome.** `transformChartSection`
   (`:1009-1013`) currently emits `<div class="chart-header">eyebrow + h2 +
   subtitle</div>`. Change it to emit **eyebrow + h2 + subtitle as top-level section
   children** (no `.chart-header` wrapper), followed by the figure and caption. The
   `liftChartEyebrow` / `liftChartSubtitle` / `liftChartCaption` helpers stay; only the
   final assembly changes — the chrome is emitted flat so the masthead transform can see
   a **top-level** `<h2>`.

2. **`masthead.transform.js` — charts join the wrap set.** Today `wrapsStageBody(cls)`
   is false for charts, so they get no `.cell-stage` and no `.cell-footer` (they used
   the legacy absolute footer). Add `chart-frame` to the set that `wrapsStageBody`
   returns true for. Then the existing generic path (`:305-318`) fires for charts:
   it hoists the (now top-level) eyebrow + h2 + subtitle into `.cell-masthead >
   .masthead-lede`, wraps the remaining body (figure + caption) into `.cell-stage`, and
   builds `.cell-footer`. The `depthAware = wraps || chartFrame` line can simplify —
   charts are now `wraps`, and their h2 is top-level, so the depth-aware lift finds and
   hoists it (the #1012 "keep the nested chart h2 in place" behavior is intentionally
   REVERSED here; that was the converge-now half, this is the hoist half §3 always
   deferred to the strict migration).

3. **`chart-family.css` — re-scope onto the cell structure.** Selectors written against
   `.chart-header` / `.chart-body` move onto the cell tree: chart chrome styling that was
   `.chart-header *` becomes `masthead-lede` styling (mostly already provided by the
   shared masthead band — delete chart-specific header chrome that the band now owns);
   `.chart-body` canvas styling re-scopes under `section.<layout> > .cell-stage`. The
   Mermaid width `calc()` inset caveat does NOT apply here (that is diagram's; charts
   size their canvas via `100cqi − padding`, which still resolves against the section —
   verify per the 2026-07-13 §2.2 caveat).

## 3. The caption — component-owned in the stage (NOT hoisted)

Two distinct "caption" things; neither hoists:

- **Visible bottom caption** (`<p class="chart-caption">`, `chart-family.js:981`): a
  trailing paragraph after the figure. Per the ratified §3 caption rule
  (`2026-07-15-model-driven-frame-render.md` §3: *"caption — component-owned inside its
  stage cell; not hoisted, not a new cell"*), it lives **inside `.cell-stage`** with the
  figure — exactly like diagram's Key-Insight blockquote. Not footer (§3 reserves the
  footer cell for footer + progress + pagination).
- **Popover detail** (`<template class="chart-detail" data-mark="i">`,
  `chart-family.js:660`): the per-mark reveal payload the parent-hosted reveal layer
  shows on hover/tap. It is a `<template>` — renders nothing, layout-invisible, already
  parent-hosted. The frame merge does not touch it. **Owner: "that's a chart property and
  not some global thing that can be hoisted."** Confirmed — it stays a chart property.

## 4. `claim-hero` / `claim-bleed` — fallout, not an exception

The pie/radar/map/quadrant full-bleed variants key their bottom-shelf title treatment on
`.chart-header h2` and `section.chart-frame:is(.claim-hero,.claim-bleed) .chart-header::after`
(`chart-family.css:715`), with the subtitle `display:none` but kept in the DOM. #1012
revived this by keeping the h2 in `.chart-header`. Once the h2 hoists to `masthead-lede`,
`.chart-header` is gone and this treatment breaks.

Per the owner ("charts are not special"), this is **not** an exemption — the title hoists
for claim-hero too. The bleed treatment is **reworked to follow the hoisted title, or
retired**, decided at export sign-off with a before/after in hand. Recorded as a known
visible consequence so it is not mistaken for a regression.

## 5. What this does NOT touch (guardrails)

- **No color / token migration.** The 2026-07-13 decision stands: charts, diagrams,
  Mermaid already share one design-system palette contract; do NOT collapse the palette.
  `.viz-frame` is LAYOUT only. Mermaid keeps its own color path (CSS + the JS
  `themeVariables` bridge) untouched.
- **No manifest-driven render** (`forms.md` §11) — the frame is built by the kernel +
  the masthead transform, not interpreted from data.
- **The PROTECTED overflow machinery** (`2026-07-15-model-driven-frame-render.md` §5):
  every chart family must prove the `probeSectionOverflow` verdict + autosplit decisions
  are unchanged pre/post. Re-run the §6 **self-scaling test** per chart family: an SVG
  chart (pie/radar/map/quadrant/funnel/word-cloud) self-scales like diagram → `flex:1`,
  no pin; a **vertical-list chart** (progress/gantt/kanban/timeline-list/roadmap/
  state-chart) grows in content-height ROWS that can overflow → it needs `flex:0 0 auto`
  like contact/wifi to keep the probe honest. **`journey` is NOT pinned** — it is
  horizontally-oriented (adding stages/tasks adds `1fr` columns, never vertical rows), so
  its height is bounded and it never vertically overflows; pinning it forced natural
  height that pushed the mood legend past the stage (see §8). Classify each before wrapping.

## 6. Staging + verification

- **One restructure PR**, all 13 chart-frame layouts at once (shared kernel — cannot be
  split per-chart). Byte-MOVED (a deliberate layout change), so a **dark+light export
  sign-off** on a representative deck per chart family is required before merge (QUALITY
  BAR; the 2026-07-13 §2.2 caveat). NOT yet `conformance:strict` — the flag flips
  per-chart as cheap follow-ons once the DOM matches the model.
- **Full adversarial trio (HARD RULE #25)** — 13 components + both render paths + export
  bytes is critical/high-blast-radius. Red team + Munger inversion + independent checker
  on the shipping diff, hardest on the overflow-probe preservation and the self-scaling
  classification per chart family.
- **Per-chart overflow-preservation gate** mirroring `diagram-overflow-preserved.test.js`.

## 7. Why `.viz-frame` before the strict flags (the owner's "A")

Doing the frame merge first means each chart flips `conformance:strict` exactly ONCE,
into its correct final shape (title in the masthead band, body in the stage). The
alternative (flip strict with the title still in `.chart-header`, then hoist later)
would move the title twice and churn every chart deck's export twice. The owner chose A
for this reason: *"we don't settle"* — one move to the right resting state.

## 8. Follow-ups (from the adversarial trio)

The full trio (red team + Munger inversion + independent checker) ran on the shipping
diff. Two findings were BLOCK/MEDIUM and are FIXED here (both independently found by the
checker AND Munger, both verified resolved):

- **HARD RULE #1 subtitle divergence (was BLOCK).** The string kernel's `extractSubtitleP`
  hoisted a plain-text `.chart-subtitle` into the band, but the runtime DOM mirror
  (`masthead-lift.js`) only recognized a code-only `<p>` — so a chart with a one-line
  subtitle banded it on the PDF/engine path and stranded it in the stage on the web
  path. Fixed by mirroring the `.chart-subtitle` branch in `masthead-lift.js`; gated by a
  plain-text-subtitle parity case (the prior case used a code-wrapped subtitle that both
  paths already handled, hiding the bug).
- **state-chart mis-classified (was MEDIUM/silent-overflow).** state-chart's body is
  `<ol class="state-nodes">` content-height HTML nodes (the `<svg>` is a JS-sized edge
  overlay, NOT a scaling container), so it belongs in the `flex:0 0 auto` pin group, not
  the self-scaling SVG group. At the un-pinned tip a 12-state machine silently clipped
  ~635px with `over:false`. Fixed by adding `.state-chart` to the pin; gated by an
  overstuffed-state-chart case (`over:false→true`).

Tracked (not blocking):

- **No automated classification gate (Munger #4).** The SVG-vs-list overflow split is a
  hardcoded manual `:is(...)` list. state-chart slipped because the doc listed it but the
  implementer dropped it and only progress was tested. A future content-height chart
  added to the family defaults to `flex:1` and would silently clip. **Follow-up:** a
  per-family overflow-preservation matrix over all 13 layouts (extend
  `chart-overflow-preserved.test.js` to every pinned type + assert every SVG type is
  genuinely self-scaling), or a build gate that fails an unclassified chart layout.
- **state-chart export re-sign-off.** The state-chart pin changes its exported layout, so
  its dark+light export sign-off must be taken after the fix (folded into the §6 sign-off).
- **Titleless chart (red team, pre-existing).** A chart with an eyebrow but no `<h2>`
  doesn't become a `chart-frame` at all (the chart builder's `extractChartBody` requires
  an h2), so it gets no band and no stage — an inconsistency, but pre-existing (charts
  have always needed a title) and graceful (falls back to the section-level overflow
  probe, no silent-clip). Not actionable for this PR; noted for completeness.
- **`journey` mis-classified as a vertical-list chart — caught by the full-deck export
  render (owner-requested).** The initial pin set included `journey`, but journey is
  HORIZONTALLY-oriented: adding stages/tasks adds `1fr` columns (thinner), never vertical
  rows, so its height is bounded — it never vertically overflows. Pinning it (`flex:0 0
  auto`) forced its natural height, which under the cell-partitioned stage pushed the mood
  legend past the stage bottom → the densest journey (the coverage deck's `journey curve`
  with board + curve + two legends + running header on 4K) clipped. Rendering the actual
  `examples/chart-family-coverage.md` export surfaced it (the synthetic gate + trio, which
  probed vertical overstuffing, did not — journey's overstuffing is HORIZONTAL, its own
  pre-existing timeline-scroll behavior). Fix: remove `journey` from the pin (it self-scales
  like the SVG charts). Coverage deck then exports with ZERO overflow. Lesson reinforcing
  Munger #4: the manual `:is()` classification needs the per-family overflow matrix, and a
  real-deck export render is a distinct check from the synthetic probe.
