---
status: shipped
summary: >
  Every SVG chart label we wrap paints a third to three quarters of a font-size too high in
  Safari, on iOS, and in any WebKit surface — a shared `.html` export opened on an iPhone, the
  Studio, the Playground. A `<tspan>` carries its own `dominant-baseline: auto`, and BOTH SVG
  1.1 and SVG 2 say that on a tspan `auto` keeps the parent's dominant baseline; Chromium does
  that, WebKit resolves it to `alphabetic` and conforms to neither, so the attribute we set on
  the `<text>` never reaches the line. Measured on the chart gallery, both
  engines, element for element: 107 of 256 labels drifted 4–13px on a 1280x720 slide, and 0 in
  Chromium — which is why no gate here had ever seen it, since every gate renders through
  headless Chromium. The fix repeats the value on each `<tspan>`, in the shared kernel, in the
  two hand-rolled state-chart emitters, and in the three stylesheets that own a baseline in CSS
  instead. Same measurement after: 107 -> 0 over 4px, worst case 13.10px -> 2.36px. The gate is
  a source-level census plus `tools/audit-svg-baselines.mjs`, an on-demand real-WebKit probe;
  a WebKit CI arm is a CI-contract decision and is deliberately not taken here.
companion:
  - ./2026-07-26-svg-chart-labels-motion.md
---

# `dominant-baseline` stops at the `<text>`: every wrapped chart label is high in Safari

**Date** 2026-09-22 · **Status** SHIPPED, measured. Issue #2297, found by #2267.

---

## 1. The symptom

Open a deck's `.html` export on an iPhone, or the Studio in Safari, and the chart labels are
off. A gantt bar's caption rides above its bar. A funnel's value sits above the band it belongs
to. A y-axis tick floats above its own gridline. The same file in Chrome is correct, and so is
the PDF — which is rendered by headless Chromium.

It is not a font problem, a scaling problem, or a container problem. All three were measured and
ruled out before anything was changed (§3).

## 2. The cause

`wrapSvgLabel` puts the baseline on the `<text>` and the position on the `<tspan>`:

```html
<text class="gantt-bar-label" font-size="8.5" dominant-baseline="central"><tspan x="8" y="30">Label</tspan></text>
```

A `<tspan>` has its own `dominant-baseline`, and its initial value is `auto`. The specs agree
about what `auto` means on a tspan; the engines do not.

**Both** SVG 1.1 §10.9.2 and SVG 2 say the same thing. Verbatim, from SVG 1.1:

> If this property occurs on a 'tspan', 'tref', 'altGlyph' or 'textPath' element, then the
> dominant-baseline and the baseline-table components **remain the same as those of the parent
> text content element**.

- **Chromium** does that. The glyphs center on `y`, which is what the emitter intends.
- **WebKit** resolves `auto` to **`alphabetic`** instead. `y` becomes the glyph baseline, so
  the entire glyph box sits above it.

**This is a WebKit bug, not a spec-version split**, and the distinction is load-bearing rather
than pedantic: framed as a version split the workaround is permanent and there is nothing to
track; framed as a bug it has an upstream and a day it can be retired. HARD RULE #12's
retirement record is the standing reminder of what a never-re-verified browser claim costs.

The offset is a third of a font-size for `central`, 0.26em for `middle` and 0.72em for
`hanging` — measured at 20px in both engines — and it is exactly the offset of a label with no
baseline at all, which is the proof that the attribute is **dropped wholesale**, not misapplied.

The intuitive reading — "a font-size too high" — overstates the common case by about three
times, so quote the measurement rather than the intuition. §3's case A is the same number seen
another way: −5.5 against a `central` label is 0.34 of its font size.

The repo's own `BASELINE_EXTENT` table in `svg-label.js` encodes the Chromium reading
(`central: [0.53, 0.53]`), and the de-collision pass compares boxes built from it. So in WebKit
the painted glyphs and the boxes that route other labels around them disagree by a full
font-size — the same class of defect as the phantom box that printed item labels through
"STRATEGIC BETS" (see `2026-07-26-svg-chart-labels-motion.md`).

## 3. What was measured, and what it ruled out

A nine-case probe, one page, both engines, offset of the text box center from the shape center
in viewBox units (0 = centered):

| case | shape | Chromium | WebKit |
|---|---|---|---|
| A | `<text dominant-baseline="central">` + positioned `<tspan>` — **what we emitted** | 0 | **−5.5** |
| B | `<text dominant-baseline="central" x y>` — no tspan | 0 | 0 |
| C | `middle` instead of `central`, tspan shape | −1 | **−5.5** |
| D | A, with `dominant-baseline` repeated on the `<tspan>` | 0 | 0 |
| E | A inside a CSS `transform: scale(0.37)` container | +1.35 | **−5.41** |
| F | A with a font family that does not exist (fallback metrics) | +0.5 | **−5.5** |
| G | no `dominant-baseline` anywhere — pure `alphabetic` control | −5.5 | −5.5 |
| H | `hanging` on `<text>`, tspan shape | +6.5 | **−5.5** |
| I | A, with `alignment-baseline` on the `<tspan>` | 0 | 0 |

**G is the proof.** WebKit's A, C and H land on exactly the no-baseline control. E rules out
scaling, F rules out font metrics, B rules out the container.

Case D is the fix. Case I works too, but `alignment-baseline` is a **different property** — it
aligns a child *to* its parent's dominant baseline — so it would say something other than what
we mean, and `dominant-baseline` is what the `BASELINE_EXTENT` box math is keyed to. It is not,
as is sometimes said, an SVG-1.1-only spelling of the same property: it is a different property
and it is in SVG 2.

A tenth case, measured while writing the fix, decides the CSS half: a rule matching only the
`<text>` behaves exactly like case A (broken in WebKit), and the same rule extended to
`.cls tspan` behaves exactly like case D (correct in both). CSS and the attribute are the same
property; neither inherits into a tspan's `auto`.

## 4. Blast radius, on a real export

`lib/components/chart/chart.gallery.md` rendered to `.html` through the real CLI, then measured
element for element in both engines — 256 `<text>` nodes, drift in px on a 1280x720 slide,
negative = WebKit paints it higher. The worst rows before the fix:

| n | mean | worst | class `[baseline, source]` |
|---:|---:|---:|---|
| 3 | −11.96 | −13.10 | `quadrant-tick` `[hanging, attr]` |
| 2 | −11.54 | −11.54 | `radar-axis-label` `[hanging, attr]` |
| 2 | −10.81 | −10.81 | `quadrant-label` `[hanging, attr]` |
| 2 | −10.25 | −10.25 | `quadrant-dot-label` `[hanging, attr]` |
| 5 | −9.37 | −9.65 | `funnel-value` `[central, attr]` |
| 5 | −8.38 | −8.42 | `state-label-t` `[central, attr]` |
| 5 | −8.31 | −8.31 | `gantt-bar-label` `[central, attr]` |
| 19 | −6.74 | −7.60 | `cart-tick` `[central, attr]` |
| 8 | −5.82 | −6.07 | `cart-tick` `[central, **css**]` |
| 4 | −5.87 | −6.09 | `funnel-conv` `[central, **css**]` |

**107 of 256 labels drifted past the audit's default 3px tolerance.** The distribution is
bimodal — every offender was over 4.3px, every clean label under 2.4px — so the same 107 come
back at any threshold between them, and the count does not hinge on where the line is drawn.
The clean ones are all `auto`/`alphabetic` labels: engine rasterization noise, and the control
that says the rest is real.

`hanging` is worst because it is furthest from `alphabetic`. The two `css` rows matter
separately: a rule like `.cart-tick { dominant-baseline: central }` matches the `<text>` and
nothing else, so the kernel fix does not reach it.

After the fix, same deck, same probe: **0 of 256 over 4px**, worst case 2.36px (down from
13.10), p95 1.62px. Every former offender is now inside the noise band the untouched
`alphabetic` labels already occupied.

## 5. What changed

Four surfaces, because the baseline is declared on four:

1. **`svg-label.js`** — the shared kernel behind ~10 chart transforms. The `dominant-baseline`
   it already built for the `<text>` is now interpolated into each `<tspan>` as well. One line,
   and it covers every caller that declares a baseline (HARD RULE #1).
2. **`state-chart.transform.js`** — two hand-rolled emitters that predate the kernel: the node
   label (`state-label-t`, measured −8.38) and the multi-line edge label. Both now repeat their
   own value per line.
3. **`funnel.styles.css`, `chart-family.css`, `word-cloud.styles.css`** — the CSS-owned
   baselines, each given a companion rule reaching its tspans. Only `.cart-tick` and
   `.funnel-conv` wrap today; the word-cloud's four classes are single-line `<text>` and were
   measured correct. They are covered anyway, because a later wrap would reintroduce the defect
   with nothing in the tree able to see it.
4. **`tools/audit-svg-baselines.mjs`** — new. Renders a deck through the real CLI, loads it in
   Chromium and WebKit, and reports the per-class drift table above. This is the instrument
   that produced every number here.

`svg-legend.js` needed nothing and still does: it declares no `dominant-baseline` at all and
positions every line by an explicit baseline `y`. Measured at 0.7px, which is noise.
`standalone-svg.js` needed nothing either — it sets an inline `style` on the tspan it creates,
so the value is already one level down.

## 6. How it is gated, and what the gate cannot do

There is **no WebKit render anywhere in `npm test`, the integration tier, or CI**, so nothing
here can assert the painted result. `docs/playwright.config.ts` already declares
`@webkit-phone` / `@webkit-tablet` projects, so the capability exists and simply is not
exercised for chart rendering. **Adding a WebKit arm is a CI-contract change** and belongs to
the maintainer, not to this fix.

What is gated is the **source invariant** — wherever a baseline is declared, it is declared one
level down too. `test/unit/components/svg-tspan-baseline.test.js`, three arms:

- **behavioral** — `wrapSvgLabel` really does emit the value on both nodes, for each baseline
  value, and still emits nothing when no baseline is declared;
- **a census of tspan builders** in `lib/components/chart`, each listed with what it owes. It
  fails on a builder that is not listed AND on a stale entry, so a fourth cannot appear quietly.
  The kernel is listed as covered-behaviorally rather than text-matched, because it interpolates
  the attribute and no text matcher can read that;
- **a stylesheet census** — every class a chart stylesheet gives a baseline has a companion rule
  carrying it to its tspans, and every companion has a declaration to mirror.

All three arms were mutation-checked: removing the kernel's interpolation, removing one
state-chart tspan's attribute, dropping one class from the funnel companion rule, and adding a
baseline to `svg-legend.js` each fail the suite.

All three arms were re-hardened after an independent check found each of them certifying a
state it could not see: the CSS arm compared class membership but not the VALUE (a companion
rule setting the wrong baseline would have passed, and would mis-paint in BOTH engines); the
census's two-line window could be satisfied by the wrapping `<text>` on the next line; and its
`<tspan` matcher missed the `'<tspan' + attrs` concatenation shape entirely. Each of those
three now has a mutant that kills it, alongside the four original ones.

**The honest limits.** This asserts what the source says, never what an engine paints — the
painted claim comes from `tools/audit-svg-baselines.mjs` against a real WebKit, on demand (HARD
RULE #23). And that tool drives **desktop WebKit via Playwright, not iOS Safari**: the symptom
is written about an iPhone and no iPhone was reached from here, so the iOS half of the claim is
**UNVERIFIED**. The mechanism is engine-level and desktop WebKit is the same engine, but that is
an inference, not a measurement.

## 7. What this does not fix

**Mermaid's own labels have the same defect**, and they are not ours. Running the same probe
over `lib/components/diagram/diagram.gallery.md` finds 17 of 91 labels over 3px — `actor`
(−5.49), `noteText` (−3.54), `ishikawa-label` (−2.83). The baseline there comes from the
`<style>` mermaid injects into its own SVG, on classes mermaid owns; We author the ishikawa
DIAGRAMS — two gallery decks use the `ishikawa-beta` type — but not the markup or the stylesheet
that places their labels, and the only CSS we own touching them
(`lib/integrations/mermaid/mermaid.css`) sets no baseline. Fixing it means widening selectors
against a third-party renderer's markup, in a different component bucket, which is a different
change (HARD RULES #8, #17, #18). Recorded here rather than pulled in.

**A second pre-existing defect, logged for the same reason.** `bucket-galleries > chart: source
.md matches manifests` is red on `main` and stays red here: a quadrant caption in
`lib/components/chart/chart.gallery.md` reads `**Your level** · *where you can operate when
called for* — illustrative, placements vary by company.` where its manifest says `Illustrative
— placements vary by company.` The committed `chart.gallery.light.pdf` is stale the same way —
page 11 (matrix-grid) is missing the label-set legend row the current transform emits. Both
arrived with the label-set rollout (#2263, #2272); neither is caused or worsened here, and
both are named rather than swept in. Worth knowing when reading §4, because the audit renders
that very file: every other page of it rasterizes byte-identically before and after this
change.
