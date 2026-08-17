# Gotchas — Charts

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## Pie wedge borders off-by-one (`nth-child` vs `<defs>`)

- **Symptom:** A pie wedge's border doesn't match its fill — most
  visibly, the small teal slice rendered a rose/red border, drawing a
  stray red line at the 12-o'clock seam. Every wedge border was actually
  one slot ahead of its fill (blue wedge → orange border, etc.).
- **Cause:** The piechart SVG is `<svg><defs>…gradients…</defs><path
  class="wedge"/>…</svg>`. The `<defs>` block is the SVG's **first
  child**, so the wedge paths are children 2…N+1. Wedge fills are set
  inline per slice (correct), but wedge *borders* were assigned by
  `.wedge:nth-child(6n+k)` — and `nth-child` counts `<defs>` as #1, so
  every wedge picked up the *next* slot's `--catN-ink`. The 5th wedge
  landed on `nth-child(6)` → `--cat6` (rose).
- **Mitigation:** Wedge borders count by `nth-of-type` instead, which
  considers only `<path>` siblings and ignores `<defs>`
  (`lib/components/chart/piechart/piechart.styles.css`). Legend swatches
  keep `nth-child` — their flex container has no leading non-swatch
  sibling.
- **Triggered by:** Any piechart render (the `<defs>` is always emitted
  for the per-wedge radial gradients).
- **Removable when:** Never, while the gradients live in an in-SVG
  `<defs>`. (Moving wedges into a `<g>` wrapper would also fix it.)
- **Commits:** the per-color-mode audit fix.

---

## `chart-anima`: a gradient-filled chart animates as bare OUTLINES (duplicate `<defs>` ids)

- **Symptom:** an opted-in pie/quadrant/radar (`chart-anima`) animates on the
  live surfaces with its wedges/areas rendered as **unfilled outlines** — the
  `fill:url(#pie-wedge-N)` gradient paints nothing — while the still poster and
  the legend swatches look correct.
- **Cause:** the host animates by mounting a **copy** of the chart's svg beside
  the original, which it merely hides (`display:none`), so BOTH carry the
  renderer's identical `<defs>` ids (`pie-wedge-N`). `url(#pie-wedge-N)` resolves
  to the *first* match in the document — the `display:none` poster's def — which
  a hidden subtree does not serve as a paint server. → empty fill. The funnel
  never hit this (CSS fills, no gradient defs).
- **Fix:** `chartToScene` (`docs/src/lib/chart-anima.ts` `namespaceInternalRefs`)
  prefixes the copy's `<defs>` ids + their `url(#…)`/`href` refs with a unique
  per-hydration token, so the animated svg is self-contained.
- **Boundary (host property):** the hazard is really a property of the shared
  host mount (`anima/hydrate.ts` hides + copies identical markup), NOT of charts.
  A baked `data-scene-spec` **svg scene** carrying gradient/clip/mask defs would
  inherit the same bug — today's spec scenes are Vivus line-art (no such defs),
  so they're unaffected. If that changes, the host mount needs the same
  namespacing (or `poster.remove()` instead of `display:none`).

---

## Chart renders as a thumbnail after an ancestor gains `container-type` (cqh re-basing)

- **Symptom:** A chart that used to fill its slide renders tiny — correct
  proportions, correct chrome, just a fraction of its intended size. Every
  automated gate stays green (the regression goldens were blessed *with* the
  shrunken render, so nothing drifts). Hit the common quadrant
  (default/magic/bubble/trail/threshold): it shrank to ~a third of its size
  and shipped that way in the blessed gallery PDFs.
- **Cause:** `cqi`/`cqh` resolve against the **nearest** `container-type`
  ancestor, so giving any intermediate box size containment silently
  re-bases every container unit below it. The quadrant SVG carried
  `max-height: 50cqh` written when the slide `section` was the only query
  container ("cap at half the slide"). The Form work later made
  `.chart-body` a size container (`chart-family.css` §IN-FORM — needed so
  in-form SVGs can size off the real available area), and the same `50cqh`
  became "half the chart-body" ≈ a sixth of the slide. The cohort variant
  was already on the Form-aware `100cqh` pattern and never shrank — the
  discrepancy between variants is the tell.
- **Mitigation:** The common quadrant now mirrors the pie's in-form pattern
  (`piechart.styles.css` §IN-FORM, `2026-06-15-form-chart-clip.md`): figure
  collapsed with `display:contents`, SVG `height:100cqh` off the chart-body
  (`quadrant.styles.css`). When adding a `container-type` to any wrapper,
  grep the subtree for `cq*` units first — each one's basis just changed.
- **Triggered by:** Adding `container-type` to an element whose descendants
  already use container units sized against a higher container; blessing
  goldens without eyeballing the pages (HARD RULE #23 — a bless is a claim
  you looked).
- **Removable when:** Never — it's how container units scope. The guard is
  the grep habit plus actually looking at re-blessed goldens.
- **Commits:** the quadrant in-form fill fix.

---

## Chart caption swallowed when `_footer` is set

- **Symptom:** A trailing caption paragraph on a chart-frame slide
  (piechart, gantt, radar, timeline-list, …) renders as a raw,
  full-width, body-size `<p>` flush against the slide's **left edge**
  instead of the centred, mono, meta-size `.chart-caption` with its
  hairline. Looks like content "overflowing" the chart. Reproduced on
  the `gallery-jargon.md` donut slide; the per-component galleries
  never tripped it because none pairs a trailing caption with a footer
  on a non-`cover` chart.
- **Cause:** `wrapChartFrame` lifts the caption from the last `<p>` in
  the post-body region with an **end-of-string** anchor
  (`/<p…>(…)<\/p>\s*$/`). A `_footer:` directive makes Marpit append
  `<footer>…</footer>` after the user's paragraph, so the section ends
  `…</p><footer>…</footer>` — the `$` never matches, the caption is
  never lifted into `.chart-caption`, and it survives as a bare
  `<section>`-level paragraph (full content width, left-aligned).
- **Mitigation:** `wrapChartFrame`
  (`lib/components/chart/_chart-family/chart-family.js`) peels a
  trailing `<footer>…</footer>` off before matching the caption, then
  re-appends it so footer order is preserved. The fix is single-source
  — the emulator and runtime bundle the same kernel, so all three
  render paths and all 13 chart-frame layouts are covered by the one
  change.
- **Triggered by:** Any chart-frame slide that has BOTH a trailing
  caption paragraph AND a `_footer` (or deck-level `footer:`) — i.e.
  essentially every real deck slide that wants a caption.
- **Removable when:** Never, while a `_footer` directive can follow the
  caption in the section body.
- **Commits:** the chart caption + footer fix.

## Charts export black/unstyled from the Studio image PDF or PPTX

- **Symptom:** A deck exported through the browser's one-click image PDF (or PPTX) renders every CSS-only slide perfectly, but SVG **chart** slides come out corrupted: radar/pie shapes solid black, gradient fills gone, the chart drawn at the wrong scale, axis/label text huge and overlapping in default black. The same deck renders the charts perfectly in the live preview AND through lattice-emulator.
- **Cause:** html-to-image (the export rasterizer's clone step) inlines computed styles onto **HTMLElements only** — nested `SVGElement`s keep just their classes/attributes. Chart styling lives in the stylesheet (`chart-family.css`) and gradient `<stop>`s carry raw `var()` expressions, so the serialized clone loses all of it: unspecified `fill` paints SVG-default black, unresolvable `var()` stops go black, the CSS-sized root (viewBox, no width/height attributes) rescales, and label font-sizes vanish. Mermaid/function-plot survive because they embed their own `<style>` **inside** the svg, which `cloneNode` keeps.
- **Mitigation:** `flattenChartSvgs` (studio/export/deck-export.js `sectionsOf`) bakes every stylesheet-styled chart `<svg>` in the capture frame with `flattenSvgStyles` — the "download chart as SVG" kernel (`standalone-svg.js`): computed paint/text inlined, gradient stops probe-resolved to literal rgb — and pins the root's layout box. Skips svgs that carry their own `<style>`. If you add a NEW way for deck content to depend on document-level CSS from inside an `<svg>` (or a new svg-emitting component), it must either self-style or be covered by this flatten; the `chart-export` e2e journey pins the mechanism. For any export-pipeline change, eyeball `test/fixtures/export-coverage-deck.md` through the real Share → PDF (see `engineering/visual-review.md` § The export surface).
- **Triggered by:** Any stylesheet-styled inline `<svg>` (the chart family) in a deck exported via the browser image pipeline. Found exporting the jargon gallery on an iPhone — masked until the export-crash fix (#709) let large decks finish; pre-existing all along.
- **Removable when:** html-to-image inlines computed styles for SVGElements too (upstream), or the capture pipeline is replaced by something that carries the document stylesheet.
- **Commits:** The chart-flatten branch (#715); mechanism regression-pinned by `docs/e2e/journeys/chart-export.spec.ts` (verified to fail on the pre-fix build).
