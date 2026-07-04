---
status: shipped
summary: The SVG chart-family charts (piechart, radar, map, cohort + default quadrant) sized their figure by binding ONE axis — `height:100cqh; width:auto` — which is a chart binding ITSELF rather than being confined by its container. Switch the FORM (default) rendering path for all five, plus the non-form path for pie/radar/map/cohort, to the standard responsive container-fill: `width:100%; height:100%` against their definite `container-type:size` parent, letting the SVG's `preserveAspectRatio="xMidYMid meet"` shrink-to-fit inside the box. The non-form default quadrant keeps its proven slide-relative `50cqh`/`aspect-ratio` rule (#180); hero/bleed keep their own sizing. Same pixels as the height-bound approach (the horizontal "void" on square charts is aspect-ratio, not a sizing bug), print-safe (the `height:100%`-collapses-in-print gotcha applies to a flex figure, NOT to a container-type:size box). Verified: pie/radar/map/quadrant(default+cohort) across roomy + tight-chrome + PDF + non-form + portrait + alt-theme — every chart fills its box and NONE clips.
---

# Chart SVG sizing: fill the container, don't bind the chart

**Date:** 2026-07-04
**Status:** SHIPPED
**Scope:** `lib/components/chart/piechart/piechart.styles.css`,
`lib/components/chart/_chart-family/chart-family.css`,
`lib/components/chart/quadrant/quadrant.styles.css`,
`lib/components/chart/map/map.styles.css` (CSS-only; `dist/` regenerated).
**Predecessors:** `2026-06-15-form-chart-clip.md` (why the SVG sized off a
`container-type:size` chart-body via `cqh`, not `height:100%` on the flex
figure — the latter collapses to a thumbnail in print), `2026-06-13-svg-native-legend.md`
(diagram + spine + key are ONE `<svg>` viewBox).

---

## 1. What prompted this

Investigating the "horizontal void" on square charts (a pie/radar/quadrant is
~1:1; the stage below the header is wide-short ~3.5:1, so a correctly-sized
chart leaves an empty band beside it). The investigation proved
the void is **aspect-ratio, not a sizing defect**: the chart is already as big
as the short stage allows, and no binding or geometry change enlarges a square
in a wide box without cropping or distorting it (see §4). (This is a chart
observation, distinct from issue #742, which is the *vertical* fill-to-height
panel void on the redline / statute-stack legal components.)

But the investigation surfaced a real inconsistency worth fixing on its own:
**the charts each bound a different single axis to size themselves**, rather
than being confined by their container the way responsive SVG should be.

## 2. The model — container defines the box, SVG fills it

Responsive SVG confinement is a **parent-container** concern: the parent has a
definite width AND height; the child fills it on both axes and its
`preserveAspectRatio="xMidYMid meet"` fits the content inside, letterboxing the
slack. A chart should not bind *itself* — it should be bound by its box.

```
 before:  .svg { height:100cqh; width:auto }   ← chart binds its OWN height, width follows
          (map:  width:100%; height:auto)       ← the one chart binding its OWN width instead
 after:   .svg { width:100%; height:100% }      ← the CONTAINER binds both axes; meet fits inside
```

The parent (`.chart-body`, or the pie/quadrant figure) is already a
`container-type:size` box under the Form (`2026-06-15-form-chart-clip.md`), and
the figure is `display:contents`, so the SVG sizes straight off that definite
box. `width:100%; height:100%` therefore resolves cleanly — **including in the
print/PDF path**: the `height:100%`-collapses gotcha from #2026-06-15 was a
`height:%` read against a *flex figure* (indefinite), NOT against a
`container-type:size` box (definite). Verified in a real PDF export.

Result: whichever axis binds, the whole unit (diagram + key) **shrinks to fit
and never clips** — the graceful-degradation property the height-binding also
had, now expressed as the standard responsive idiom and applied uniformly.

### Default quadrant

The default (non-cohort) quadrant carries `aspect-ratio:420/320` +
`max-height:50cqh` on its base rule. The in-form container-fill rule must keep
`max-height:none` (clear the slide-relative 50cqh cap, which container queries
re-base to "half the body") and `flex:0 0 auto` (the base is `flex:0 1 auto`,
whose shrink would re-clamp the plot) — otherwise the plot renders at half
size.

## 3. Scope — what changed, what didn't

- **Form (default) path — all five** container-fill (`piechart.styles.css`,
  `chart-family.css` radar/map/cohort, `quadrant.styles.css` default).
- **Non-form path — pie/radar/map/cohort** container-fill; the **non-form
  default quadrant keeps its slide-relative rule** (`height:100%; max-height:50cqh;
  aspect-ratio:420/320`, #180 — outside a query-container the `cqh`/50cqh cap is
  the resolution-stable choice; converting it would drop that guard).
- **Map**: its base `.map-svg` rule (`width:100%; height:auto`) is left as-is —
  it now governs only hero/bleed maps; the Form and non-form non-hero maps
  container-fill via the shared `chart-family.css` rules. (The map had appeared
  to be "on its own model," but the shared rules already out-specified its base
  rule for every non-hero surface, so no map-file change was needed.)
- **hero/bleed** keep their own sizing rules (untouched).
- **funnel and word-cloud** — the other two SVG chart-family members — were
  **already** on `width:100%; height:100%` (`funnel.styles.css` `.funnel-svg`;
  `word-cloud.styles.css` `.wc-svg`, inside an explicitly-sized `.word-cloud-canvas`
  whose children are %-relative to it). No change needed; this PR brings the five
  height-bound charts into line with them, so the **whole SVG family is now
  uniformly container-fill**.

## 4. What this does NOT change — the void is aspect

Container-fill leaves the horizontal void on square charts exactly as it was,
which is the point: a ~1:1 unit correctly contained in a ~3.5:1 box letterboxes.
Ruled out with renders during the investigation:

- **50/50 centered-hairline split** — starves the map: forcing each half to
  `max(diagramWidth, keyWidth)` doubles the wide map's footprint (unit viewBox
  1375→~2158 wide, 3.08:1 → 4.84:1), so container-fit shrinks it. Fine for
  narrow diagrams, wrong for the map.
- **Width-binding (mermaid-style, `height:auto`, no cap)** — clips square
  charts in real chrome: a pie forced to full width is ~800px tall in a ~340px
  stage, and `.chart-body{overflow:hidden}` cuts it. Reproduced in HTML + PDF.
- **height:100% vs width:100% (with a cap)** — a no-op: max-height re-imposes
  the height limit, identical render.

The void is only closed by matching the *unit's* aspect to the container
(spread the legend to widen it, or a portrait/legend-below layout) — a separate
composition decision, not a sizing one. This change is the cleaner sizing
foundation that future void work builds on: because the chart now fills whatever
box it is given, reshaping the container (portrait, a squarer zone) "just works."

## 5. Verification

Real renders (`lattice-emulator.js`): pie, radar, map, default quadrant, cohort
quadrant, each across **roomy + tight-chrome (2-line title/subtitle + caption +
footer + page number) + PDF export + non-form + portrait (legend-below) +
alt-theme**. Every chart fills its box; none clips; the PDF (the surface that
birthed the height-binding) is clean. Gates: `lint`, `build:check`, unit suite
(2919) all green.
