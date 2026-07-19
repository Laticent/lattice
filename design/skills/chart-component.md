# Skill — Create a chart component

> Add a data visualization to the chart family: a manifest, a pure SVG kernel that
> turns a bullet list into a chart sized to the shared frame, and palette-blind CSS
> that consumes chart tokens — never hex.

**Read this when** you need a new chart kind (a Cartesian plot, a new
distribution, a new comparison encoding) that the existing chart components (the
live roster is `CHART_LAYOUTS` in `chart-family.js`) don't cover. **You'll produce** a component folder under `lib/components/chart/`
whose kernel emits SVG through the shared `.chart-frame` dispatcher.

> Read the **`dataviz` skill first** for the medium-agnostic method (form
> heuristic, color formula, mark specs). This skill is how that method is realized
> in Lattice: its "swap the placeholder palette" step becomes the theme's
> `--chart-catN` override hooks; its "runnable validator" becomes
> `test/unit/palette/chart-contrast.test.js`.

---

## The 10/10 bar

- **The chart matches the data shape**: parts-of-a-whole → `piechart`; a narrowing
  pipeline where the drop-off is the story → `funnel`; precise comparison of
  independent metrics → `progress` bars; two-axis scoring → `quadrant`;
  multi-attribute per-entity → `radar`.
- **≤ 6 categories.** Past six, perceptual distinction collapses (Wong 2011) — the
  categorical palette is capped at slot 6; consolidate a long tail into "Other."
- **Labels and values sit on the canvas, not on the colored mark** — so contrast is
  never at the mercy of a narrow band or a fill ramp.
- **The `## ` heading names the takeaway** ("Where the pipeline leaks", not
  "Funnel").
- **Color is theme tokens, never hex in the kernel.** Fill and mark always share
  the hue; neither canvas is louder than the other.
- **Contrast gated on both canvases**: text-on-fill ≥ 4.5:1 (AA), marks-vs-canvas
  ≥ 3:1 (WCAG 1.4.11), adjacent categories distinct.

---

## Mental model

A chart component is a component (`chart-component` builds on `component.md`) with
three distinguishing traits:

1. **It renders into the shared `.chart-frame` skeleton.** The dispatcher
   (`_chart-family/chart-family.js`) recognizes your layout class, wraps the
   content in `.chart-frame > .chart-header / .chart-body / .chart-caption`, and
   calls your kernel to rewrite the inner list into chart markup. The eyebrow,
   title, subtitle, and caption bind positionally — you only build the body.
2. **The body is SVG, sized to the frame.** Your kernel emits
   `<svg viewBox preserveAspectRatio="xMidYMid meet" role="img">` with
   `<polygon>` / `<path>` / `<text>` marks. Each mark carries a `--i` index or a
   `--mix` percentage; **the kernel emits no color** — palette lives in CSS.
3. **It runs through the three-renderer dispatcher** (engine, emulator, VS Code
   runtime) — write-once, render-everywhere (HARD RULE #1). Because VS Code Marp
   filters out `<script>`, the transform bakes into rendered HTML, not a runtime
   script.

**Substance is `series`** (a tabular DSL as bullets). Data is authored as a
markdown list where each `<li>` is one datapoint: **lead text = label**, **trailing
`` `inline-code` `` = the value**. Never front matter, never a data file, never an
HTML table (the sole exception is `roadmap`, whose body is a markdown table).

---

## Where it lives

```text
lib/components/chart/<name>/
  <name>.manifest.json     ← function evidence/progression · form canvas · substance series · bucket chart
  <name>.styles.css        ← interior only; consumes --chart-cat-N-* / --chart-state-*
  <name>.transform.js      ← the pure kernel: parse<Name> → build<Name> SVG
  <name>.docs.md           ← GENERATED
  <name>.gallery.md        ← GENERATED
```

Shared engine (`lib/components/chart/_chart-family/`): `chart-family.js` (the
dispatcher + the categorical/semantic color token model in `chart-family.css`),
`svg-legend.js` (SVG-native legend), `mark-detail.js` (per-mark reveal substrate),
`transform-utils.js`.

- **Register** your layout in `chart-family.js` — both `CHART_LAYOUTS` (the name)
  and `SECTION_BUILDERS` (the `build<Name>Section` wrapper). See the recipe.
- **Validate**: `test/unit/palette/chart-contrast.test.js`, `npm run scorecard`.

---

## The color story — this is the part that makes or breaks it

Charts own **their own two spectrums**, decoupled from the engine-wide `--cat-*`
palette:

- **Categorical — `--chart-cat1..8` (8 slots, cap 6 in practice).** Each slot has a
  fill/ink pair derived from one hue: `--chart-cat-N-fill` is a restrained tint
  (`color-mix` of the hue toward the canvas on light, toward black on dark — never
  into `--bg`, which muddies warm hues to brown); `--chart-cat-N-ink` is the
  saturated mark/border. **Fill and ink always share the hue.** A theme overrides
  by setting `--chart-catN` at `:root`; untuned themes inherit the Apple-inspired
  master set.
- **Semantic / status — `--chart-state-{pass,warn,fail,info,mute}`.** Same
  construction, but encodes meaning: green=good, amber=caution, red=stop,
  blue=info/pilot, gray=deferred. Used by gantt bars, progress fills, status pills.
- **Sequential** — the choropleth ramp, `map` only: each region carries a `--mix`
  percentage on one hue mixed into a neutral base (so the ramp stays monotonic
  above the neutral in both canvases). **No diverging set ships.**

Your kernel consumes **only** `--chart-cat-N-fill` / `-ink` (or `--chart-state-*`)
and stays palette-blind. Cycle categorical marks with `nth-of-type(<path>)` — the
first SVG child is `<defs>`, so `nth-child` is off by one.

**Contrast targets** (authoring goal / gated floor): text-on-fill AA (≥4.5:1);
marks-vs-canvas ≥3:1; adjacent-slot distinctness ≥0.15 OKLab (authoring) / ≥0.06
(regression floor), first 6 slots only. **Assess the dark canvas hardest** — warm-hue
mud and value-collapse hide there.

---

## Recipe

1. **Pick coordinates**: `function: evidence` (or `progression`), `form: canvas`,
   `substance: series`, `stage: canvas`, `bucket: chart`. Confirm it's in the §4
   matrix.
2. **Write the manifest** (`funnel.manifest.json` is the template): `slots`,
   `skeleton`, `sample`, `stressDoc`, `whenToUse`, `antiPatterns`, `related`.
3. **Write the kernel** `<name>.transform.js` — a **pure CommonJS module**
   (`module.exports = { parse<Name>, build<Name> }`, the repo is CommonJS, not
   ESM): `parse<Name>(ulInner)` extracts `{label, value}` per `<li>` (use the
   shared list helpers + `mark-detail.splitDetail` for optional per-mark detail)
   and returns `null` when there's nothing to draw; `build<Name>(model,
   orientation)` returns the SVG string. **No hard-coded color.**
4. **Wire it into the dispatcher** in `_chart-family/chart-family.js` — this is the
   step that actually makes it render, and it's three edits, not one:
   1. `require` the kernel at the top (`const <name> = require('../<name>/<name>.transform');`).
   2. Write a `build<Name>Section(html, ctx)` wrapper that calls your parse+build
      through `spliceFirstList` (see `buildFunnelSection`).
   3. Add `<name>: build<Name>Section` to the **`SECTION_BUILDERS`** object **and**
      `<name>` to **`CHART_LAYOUTS`**. A name in `CHART_LAYOUTS` with no
      `SECTION_BUILDERS` entry no-ops — the shared `transformChartSection`
      dispatcher looks your name up in `SECTION_BUILDERS`. Also ensure the body
      container class your kernel emits is matched by the frame `bodyRE`.
5. **Write CSS** `<name>.styles.css`: style only the interior; consume
   `--chart-cat-N-fill/-ink` or `--chart-state-*`. The `.chart-frame` chrome is
   already styled. **Unlayered** — no `@layer` wrapper (inert here; a layered rule
   loses to unlayered base rules, cascade.md) — and anchor every selector on
   `:is(section.<name>, figure.chart-frame)` so the fills also resolve in the
   Read·Article figure re-host, not only inside the slide `section`.
6. **Choose the legend** per the three-way test: color/size-categorical → integrated
   SVG key via `svg-legend.js`; wide diagram → bottom-center key; self-labeling →
   no key.
7. **Demo deck** `examples/<name>.md` + galleries; wire all three paths.
8. **Validate contrast** on both canvases; `npm run build:check` + `npm test`.

---

## The contract / skeleton

Authoring (what the deck author writes):

```markdown
<!-- _class: funnel -->

`Pipeline · Q2 2026`

## Where the pipeline leaks.

- Visitors `12,000`
- Signups `4,200`
- Activated `1,800`
- Paid `620`
```

The kernel (pure CommonJS, color-free):

```js
// lib/components/chart/funnel/funnel.transform.js
function parseFunnel(ulInner) {          // the <li> HTML of the first list
  // → [{ label, value, num }]; return null/[] when there's nothing to draw
}
function buildFunnel(model, orientation) {
  // → '<svg viewBox … role="img">…</svg>'; marks carry --i / --mix, NO color
}
module.exports = { parseFunnel, buildFunnel };
```

The dispatcher wiring (the three edits from recipe step 4):

```js
// lib/components/chart/_chart-family/chart-family.js
const funnel = require('../funnel/funnel.transform');            // 1. require the kernel

function buildFunnelSection(html, ctx) {                          // 2. the section wrapper
  return spliceFirstList(html, (ext) => {
    const model = funnel.parseFunnel(ext.inner);
    return model ? funnel.buildFunnel(model, ctx.orientation) : null;
  });
}

const CHART_LAYOUTS = [ /* … */ 'funnel' ];                       // 3a. name in the register
const SECTION_BUILDERS = { /* … */ funnel: buildFunnelSection };  // 3b. AND the builder map
// transformChartSection(innerHtml, cls, orientation) — the SHARED dispatcher — then
// finds 'funnel' in SECTION_BUILDERS and calls buildFunnelSection. No per-component
// transformChartSection export exists; a CHART_LAYOUTS name without a builder no-ops.
```

The CSS — **unlayered** (no `@layer` wrapper: `@layer` is inert in the engine
bundle and a layered rule LOSES to an unlayered base rule regardless of
specificity — `engineering/cascade.md`; every shipped chart CSS is unlayered),
matched on `:is(section.<name>, figure.chart-frame)` so the colors resolve **both**
in the slide and in the Read·Article `<figure class="chart-frame">` re-host that
re-parents the chart SVG outside its `section`. Consumes tokens, cycles by hue:

```css
/* UNLAYERED — bare selectors, no @layer wrapper (cascade.md). This is the general
   CATEGORICAL idiom (as piechart's wedges do it): cycle distinct hues by index. A
   single-hue chart like funnel instead ramps ONE `--chart-cat-N-hue` by `--i`. */
:is(section.<name>, figure.chart-frame) .mark:nth-of-type(1) { fill: var(--chart-cat-1-fill); stroke: var(--chart-cat-1-ink); }
:is(section.<name>, figure.chart-frame) .mark:nth-of-type(2) { fill: var(--chart-cat-2-fill); stroke: var(--chart-cat-2-ink); }
/* … label text sits on the canvas, not on the mark … */
:is(section.<name>, figure.chart-frame) text { fill: var(--text-heading); }
```

---

## What good looks like

- A `donut` (not solid pie) for a board deck — the hole reads as *composed* rather
  than as a missing slice.
- 3–6 categories; a long tail consolidated into "Other."
- Conversion % between funnel stages auto-computed; the widest value sets full
  width.
- Optional per-mark detail authored as a nested sublist — it drives the
  Present-mode reveal AND folds into the speaker note, with the static pixels
  byte-identical when absent.

---

## What bad looks like

- A hardcoded `fill: #0A6CE0` in the kernel — palette can't follow the theme.
- A pie of unrelated metrics that don't sum to a whole; a 2-slice pie (a percentage
  with extra steps); two pies side-by-side (humans can't compare wedge angles
  across figures).
- A funnel of non-monotonic or non-subset values — the taper lies.
- 8+ categories cycling the palette past slot 6.
- Labels printed *on* a narrow colored band where contrast is unreliable.
- Assuming the dark canvas is fine because light looked good.

---

## Ship checklist

- [ ] Coordinates: `evidence`/`progression` · `canvas` · `series` · `chart`.
- [ ] Kernel is pure, returns `null` when empty, emits `viewBox` SVG with
      `--i`/`--mix` marks and **no color**.
- [ ] Registered in **both** `CHART_LAYOUTS` and `SECTION_BUILDERS`; body class
      matched by `bodyRE`.
- [ ] CSS consumes `--chart-cat-N-*` / `--chart-state-*` only; cycles via
      `nth-of-type`; **unlayered** (no `@layer` wrapper, cascade.md) and anchored on
      `:is(section.<name>, figure.chart-frame)`.
- [ ] Contrast green on light AND dark (`chart-contrast.test.js`); dark checked
      hardest.
- [ ] Demo deck + galleries; wired in all three render paths.
- [ ] `npm run build:check` + `npm test` green.

---

## Common mistakes

1. **Hardcoded color in the kernel** — always theme tokens in CSS.
2. **Exceeding 6 categories** or cycling past slot 6.
3. **`nth-child` instead of `nth-of-type`** — off by one because of `<defs>`.
4. **Wrapping the CSS in an `@layer components` block** — inert here; the rule silently
   loses the cascade to unlayered base rules (cascade.md). Author unlayered, and match
   `:is(section.<name>, figure.chart-frame)` so it also styles the figure re-host.
5. **Mixing the fill toward `--bg`** on dark — muddies warm hues; mix toward black.
6. **Labels on the mark** instead of the canvas.
7. **Front-matter or data-file input** — series data is markdown list + inline-code
   pills (roadmap's table is the only exception).
8. **Skipping the dark-canvas contrast check.**

---

## Canonical sources

- `lib/components/chart/_chart-family/chart-family.docs.md` — the frame, the
  dispatcher, the kernel contract, the legend placement test.
- `lib/components/chart/_chart-family/chart-family.style.md` — the curation
  rationale (two spectrums, hue vs value differentiation).
- `lib/components/chart/_chart-family/chart-family.css` — the categorical + semantic
  token model.
- `design/theming.md` §Chart-family palette + §CVD palettes.
- `design/design-system.md` §5 (the four substances), §8.4 (the series plugin
  point).
- `test/unit/palette/chart-contrast.test.js` — the runnable contrast validator.
- The `dataviz` skill — the medium-agnostic method this realizes in Lattice.
- `lib/components/chart/funnel/` — the reference kernel.
