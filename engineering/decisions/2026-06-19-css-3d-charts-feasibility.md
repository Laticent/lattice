---
status: shipped
summary: CSS-3D can't replace SVG for the chart family (PDF zoom rasterizes CSS, vector SVG stays crisp; preserve-3d is inert inside SVG). Decision — SVG stays canonical; CSS 3D is a present-mode-only tilt of the whole SVG. Shipped — piechart per-slice detail as an inert data-slice/<template> payload (byte-identical chart pixels) + a dispatch depth-aware fix, AND a parent-hosted present/practice interaction layer (hover/tap/number-key reveal, autoplay-pause) keeping the iframe a pure paint surface. Print fallback shipped (#452.1) as the speaker-notes channel (detail → slide note → PDF annotation, chart pixels byte-identical).
last-updated: 2026-06-20
companion:
  - ../../lib/components/chart/piechart/piechart.docs.md
  - ../../lib/components/chart/_chart-family/chart-family.docs.md
---

# CSS-3D charts — feasibility, and the per-slice-detail slice it produced

**Date:** 2026-06-19 · **Status:** investigation settled; one kernel slice landed,
present-mode wiring deferred; print fallback shipped as the speaker-notes channel.

## Question

Could the chart family be built in **CSS 3D** instead of SVG — for "interactivity
and visual pop", with a flat 2D fallback for PDF?

## What the spikes showed (all rendered, in `.scratch/css3d/`)

1. **"CSS 3D draws more shapes" is a category error.** CSS 3D adds *forms* (flat
   faces oriented in perspective), not 2D *outlines*. Richer outlines come from
   `clip-path: path()` / SVG, not 3D.
2. **CSS can match the family look — gradient and legend included.** A flat CSS pie
   (conic + radial dome) and a CSS radar (hex grid, dashed target, delta markers,
   legend) were near-indistinguishable from the shipped SVG and survived the print
   path. So "it can't look like ours" is **false** — the earlier claim was wrong.
3. **The real SVG edge is generation + scale-independence + export, not looks.**
   The CSS versions are hand-computed trig and dozens of positioned nodes; SVG is
   `points` + `stroke-dasharray` + one `viewBox` that scales geometry *and* text as a
   unit, and is standalone-exportable. Per-chart bytes are a wash (single-digit KB,
   sub-2KB gzipped either way).
4. **CSS 3D on an SVG: tilt the whole sheet — yes; extrude internals — no.** A CSS
   3D transform on the `<svg>` element tilts/pans/zooms the whole vector chart,
   crisp, and it survives the PDF print path. But `transform-style: preserve-3d` is
   inert on SVG *children* — you cannot give the chart internal depth/parallax.
   (Empirically confirmed: `translateZ` on inner wedges does nothing.)
5. **PDF zoom is the decider.** Zoomed into the exported PDF, SVG stays razor-sharp
   (vector path operators) while CSS gradients are **rasterized to a fixed-resolution
   bitmap** and pixelate. For a boardroom-PDF engine that disqualifies CSS for the
   canonical path.

## Decision

**SVG stays canonical** for the chart family (crisp, scalable, exportable, print-true).
**CSS 3D is a present-mode-only flourish**, applied to the *whole* SVG as a restrained
tilt (≤~16° envelope, pointer-follow, damped, snaps back to flat — starts 2D). Never
extrude data marks (it's both impossible inside SVG and a proportion-distorting
dataviz anti-pattern). The interactive value worth shipping is **per-slice detail**, not
3D depth.

## Shipped this branch (kernel substrate + prototype)

- **`buildPieChart`** now captures an optional nested sublist per slice and emits it as
  an inert `<template class="piechart-detail" data-slice="i">`; every wedge `<path>`
  carries `data-slice="i"`. Both render nothing in print → exported PDF/SVG is
  **byte-identical**; a pie without sublists is unchanged. (`piechart.manifest.json`
  documents the `detail` slot.)
- **Dispatch fix:** the piechart branch now extracts its `<ul>` with the depth-aware
  `extractFirstList` (like gantt/kanban/radar) instead of a naive non-greedy
  `/<ul>…<\/ul>/` that truncated at a slice's nested `</ul>`. Detail capture uses the
  same depth-aware extractor (a maker-checker pass caught a first cut that re-used the
  lazy regex and diverged between the string and DOM render paths).
- **Prototype** at docs route `/proto/css3d-pie/` (`docs/src/pages/proto/css3d-pie.astro`,
  one isolated file): flat-by-default pie, restrained CSS-3D tilt of the SVG, per-slice
  popover fed by the **real kernel templates** (rendered through `transformChartSection`
  in frontmatter), responsive (desktop/tablet/mobile bottom-sheet), a11y + reduced-motion.

## Present/practice interactive integration — the architecture (designed, not yet built)

Without an interactive **present AND practice** mode the per-slice detail has no
value (it's a presenter's reveal). The integration is non-trivial because both modes
render the slide in a **scaled `srcdoc` iframe** with a full-stage **pointer-capture
overlay** (`db-pp-layer`) that owns swipe / tap-to-reveal / edge-arrows. As-is, an
in-slide popover is intercepted by that overlay and a `position:fixed` popover inside
the scaled iframe mis-positions. So the proto's "in-slide hydration" model does NOT
survive contact with present/practice.

### Why the iframe stays (do not re-litigate)

It is **not** legacy cruft. Two documented reasons
(`2026-06-13-shared-deck-preview.md`, `2026-06-10-drawing-board-huge-deck-preview-perf.md`):

1. **Cascade isolation = the screen===PDF promise.** The deck theme CSS uses global
   selectors (`section`, headings, `:root` tokens); sharing a document with the app
   chrome collides both ways, and the chrome's `position:fixed` can't share a cascade
   with the slide's `transform:scale`. The iframe is a real document (own `@page`,
   `:root`, viewport units) → on-screen === exported.
2. **The runtime `MutationObserver` model.** The runtime observes `document.body` and
   idempotently re-applies every transform to inserted `<section>`s — in an iframe that
   works for free. **Shadow DOM** can't be pierced by `document.querySelectorAll` and
   the observer doesn't watch shadow roots → it would force a root-aware refactor of the
   runtime *across all three render paths*, plus a PDF-parity risk (`@page` gone,
   `:root`→`:host`, `position:fixed` semantics differ). Two serious costs to fix an
   interaction problem we can fix on the parent side. An earlier draft recommended Shadow
   DOM and withdrew it. Revisit Shadow DOM only as a deliberate future project if the app
   needs seamless slide↔chrome animation or charts that break the slide bounds everywhere.

### The principle that dissolves the conflict

**The iframe is a paint surface, not an interaction wall.** `srcdoc` is same-origin, so
the parent has full reach into the slide (today it talks via `postMessage` by
convention — the door is open). **Interaction lives on the parent side of the
boundary**, not inside the iframe.

### Verified input facts (read from the present/practice source)

- **No click-to-advance** — advance = keyboard / edge-arrows / swipe; a flat *tap* only
  toggles chrome. (So "I hate accidental click-advance" is already mostly honored.)
- **Keyboard already pierces the iframe** — the slide doc forwards arrows/space/PageDown
  via `postMessage`, so the clicker/keyboard always advances even if the chart holds the
  pointer. This is the safety net that makes ceding the chart's surface safe.
- **Wheel/scroll is unwired** — a free channel (advance, or scrub slices).
- **The edge-arrow overlay** (`elEdgePrev`/`elEdgeNext`, auto-hiding) is a pointer-free
  nav lifeline on the margins.

### The model

- On an interactive chart slide, the capture layer becomes a **frame**: punch a hole
  (`pointer-events:none`) over the chart's rectangle so the chart owns its surface; the
  margins keep swipe + tap-to-reveal. (This *is* the settled "hit-test zones" tap call.)
- One `revealSlice(i)` command, bound to: **pointer** (in the hole), **number keys**
  (1–6 → slice n, 0/Esc clears), and a **presenter-window** control.
- The popover renders as **parent present-chrome** in stage coordinates (reads the
  slice's `<template>` by `data-slice`) so it stacks above the iframe and positions
  correctly.
- Navigation never leaves keyboard / edge-arrows / wheel — all pointer-free — so freeing
  the chart's center is safe; there's no click-advance to lose.

### Present vs practice — diverge the primary trigger

- **Present** (audience-facing, lectern): number-keys + presenter-window-driven reveals
  primary; pointer optional. The audience screen shows the result.
- **Practice** (solo): direct pointer manipulation primary; **autoplay pauses** while a
  chart is being explored, resumes on advance.

### Open (decide before build)

- **Tilt in present/practice** — leaning **interaction-coupled**: the tilt fires only
  while a slice's detail is open, then settles flat (resting chart stays
  proportion-true; the same reason we refused to extrude). Alternatives: none-in-present,
  or a one-time entrance tilt. Not locked.
- Presenter-window trigger detail (a slice list / mini-chart in the private view).
- "Enter interactive on first click" vs always-on; number-key collision check.

### Built (this branch)

The model above shipped as `docs/src/playground/drawing-board-chart-interact.js`,
wired into **both** present (`drawing-board-present.js`) and practice
(`drawing-board-practice.js`): hit-surface over the chart rect, `revealSlice`
bound to pointer (hover/tap) + number keys, popover anchored to the active wedge
within the chart band, interaction-coupled wedge-lift + tilt, autoplay-pause on
reveal (practice). Verified in-browser in the real Drawing Board for both modes
(`.scratch/css3d/present-2-reveal.png`, `practice-reveal.png`). Tilt landed as
interaction-coupled (the recommended synthesis).

### Superseded: the whole-sheet tilt and the hub nudge (2026-09-25)

The interaction-coupled tilt is gone. On the real Playground it did what this note
warned CSS 3D would do to data: `perspective(900px) rotateX(7deg)` on a sheet about
1000px wide keystoned it, so bars turned into trapezoids and every label rendered
skewed. The 7-unit "nudge away from the mean of all mark centers" moved values: a bar
rose off its baseline and into its own value label, a funnel's end bands moved in
opposite directions, and a dot left its coordinates. Both also moved the mark out from
under the cursor, so near an edge the card closed and reopened.

`chart-interact.js` `emphasize()` now keeps every mark where the data puts it. The
active mark stays at full opacity while the rest dim to 0.45, and it casts a two-layer
elevation shadow. Two geometries get one extra move that cannot misstate the value.
A pie slice (`data-anima-role="sector"`) steps out along its own bisector from the true
disc center, by 3% of the radius. A dot (`point`) grows about its own center by about
3 slide px of radius. The sizes are set in slide px and converted to each svg's user
units. A 10-slide-px hold zone around the open mark keeps the card open across small
gaps. The host option `tilt` is renamed `lift`.

## Open / deferred

- **In-editor preview reveal — SHIPPED (#452.2).** Hovering a pie wedge in the Drawing
  Board's live preview now reveals the slice detail *as you author*, so you don't enter
  Present and page to the slide to check it. The same `createChartInteract` module gained
  a `hoverAny` mode: instead of a hit-surface pinned over one `onSlide()`-designated chart,
  it listens on the same-origin preview iframe document and reveals whichever chart is
  under the pointer (wedge/legend queries scoped to that section — fixing a latent
  whole-doc-query bug that would have mixed up multiple charts). Re-bound on every srcdoc
  rewrite (`db-frame-ready`). No hit-surface is mounted (it would eat the iframe's own
  pointer events); the popover stays a parent overlay, so the exported SVG/PDF is
  untouched. The earlier "filmstrip thumbnails are awkward for a popover" worry is moot —
  the editing preview shows full-size slides, so the reveal lands on the chart directly.
  Verified at 1440/820/390px. Wired in `drawing-board-render.js`.
- **Print fallback — SHIPPED (#452.1) as the speaker-notes channel.** Decision: the
  authored detail is folded into the slide's **speaker note** (`Label (value): item ·
  item`, one line per detailed slice) as a Marp-faithful `<!-- … -->` comment that
  `buildPieChart` emits; `notes-core` lifts it into the per-slide note channel (a PDF
  text annotation + the hidden `aside`) and strips the comment before render. So the
  detail surfaces *off the slide face* — the **chart pixels stay byte-identical**
  (verified: 0-px diff vs a plain pie), and a PDF reader gets the context a presenter
  would reveal. Always-on (any pie with detail); a plain pie emits no note. Chosen over
  a visible on-slide note block / footnotes / appendix slide because it reuses the
  existing notes pipeline and keeps the boardroom slide clean. The Present/Practice
  `<template>` reveal is unchanged — same source, two surfaces.
- **Presenter-window trigger + legend cross-light:** the dual-screen presenter view
  could drive reveals on the audience screen; legend cross-lighting needs `data-slice`
  on the SVG-native legend rows (`svg-legend.js`). Both additive, not yet built.
- **Demo deck (#9):** the static PDF of a detail-pie is identical to a normal pie, so a
  demo deck adds nothing to the export; the interactive value lives in present/practice.

## Discovered, out of scope (separate ticket)

`progress` and `timeline-list` use the **same naive non-greedy regex** in the dispatch
(`transformChartSection`). A `progress`/`timeline-list` whose item carries any nested
sublist **truncates and renders zero bars today**. The identical one-line fix
(`extractFirstList`) applies; not changed here to keep this branch to one feature
(Hard Rule #17).
