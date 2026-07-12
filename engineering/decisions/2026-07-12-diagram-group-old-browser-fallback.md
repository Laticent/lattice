---
status: shipped
summary: The old-browser flat-literal fallback (@supports not (color: light-dark(...)), 2026-07-11) only covered the CHART bucket + math — its generator (tools/build-chart-compat-css.js) walked lib/components/chart plus math.styles.css. But three non-chart component families ride the ENGINE-WIDE --cat-* palette (--cat-N-fill / --cat-N-mark / --cat-on-fill, all light-dark()-valued) while NOT being .chart-frame members, so they were never scanned and rendered solid black on a pre-Chromium-123 engine exactly like the charts did: Mermaid diagrams (DIAGRAM OVERRIDES paint .section-N bands, mindmap edges, radar curves directly with var(--cat-N-fill|mark)), legal authority-chain / statute-stack (per-tier --cat-N-mark accents), and comparison decision (per-option --cat-N-mark accents). Fix: a DIAGRAM_GROUP_FILES list added to scannedFiles() so the SAME setter/painter flatten machinery emits their flat twins, scoped to each component's own section.<comp> selector (mermaid's :is(section, figure) guards un-broaden to section via the existing unbroadenIsFigure, keeping the compat a slide-only fallback). No CHART_ROOTS / global-redefine change was needed — every diagram-group colour is a direct painter (mermaid) or a variant setter (legal / decision), both already-handled paths; zero new leaks across all themes. journey / roadmap were already covered (journey is a CHART_ROOT; roadmap is a .chart-frame member) and are NOT re-listed. Known remaining gaps, noted off this path (decision-doc + gotchas follow-up, not folded in): non-chart color-mix() consumers (comparison redline / verdict-grid / pricing, legal obligation-matrix) and compare-prose's --cat-on-mark ink. Modern render is byte-unchanged (the @supports block is inert on modern engines; dist/lattice.css untouched). The real old-TV surface is UNVERIFIED from CI — validated transitively via the resolver↔browser color-parity test that pins each flat literal to Chromium's computed value.
---

# Diagram-group old-browser fallback — extend the flatten scan past the chart bucket

**Date:** 2026-07-12
**Area:** theming / build / diagrams
**Follows:** `2026-07-11-old-browser-chart-fallback.md`

## Symptom

The old-browser flat-literal fallback shipped 2026-07-11 fixed the **charts**
(pie, map, gantt, journey, quadrant …) on a pre-Chromium-123 engine. But on that
same engine, three families that are NOT charts still rendered **solid black /
colourless**:

- **Mermaid diagrams** — flowchart/timeline `.section-N` band fills, mindmap
  `.section-edge-N` strokes, radar curves. Black nodes, invisible edges.
- **Legal** — `authority-chain` tier accents and `statute-stack`
  jurisdiction/lane accents lost their colour.
- **Comparison `decision`** — per-option accent stripes lost their colour.

Fine on every modern browser and in the PDF.

## Root cause

All three ride the **engine-wide `--cat-*` categorical palette**
(`--cat-N-fill` / `--cat-N-mark` / `--cat-on-fill` / the `--diagram-*` tokens),
each a `light-dark()` value. On an engine without `light-dark()` the whole
declaration is invalid at computed-value time and is dropped — SVG `fill` falls
to its black initial value, an HTML `border`/`background` vanishes. Identical
mechanism to the chart bug.

They were missed because the fallback generator only knew about **charts**:
`tools/build-chart-compat-css.js` → `scannedFiles()` walked
`lib/components/chart/**` plus `chart-family.css` + `math.styles.css`, and the
global-redefine scope `CHART_ROOTS` listed only chart-frame / journey / map /
math. Mermaid (`lib/integrations/mermaid/mermaid.css`), legal
(`lib/components/legal/**`), and decision (`lib/components/comparison/decision`)
were never read, so no flat twin was emitted for them. These components use
`--cat-*` precisely because they are **not** `.chart-frame` members — they
predate the chart-family's own `--chart-cat-*` spectrum and stayed on the older
engine-wide palette (see the note in `chart-family.css`: the chart spectrum is
"decoupled from the engine-wide cN accents, which still drive roadmap / journey /
legal / decision").

## Fix

Add a **DIAGRAM GROUP** to the generator's scan — a small explicit list of the
non-chart CSS files that ride `--cat-*`:

```js
const DIAGRAM_GROUP_FILES = [
  'lib/integrations/mermaid/mermaid.css',
  'lib/components/legal/authority-chain/authority-chain.styles.css',
  'lib/components/legal/statute-stack/statute-stack.styles.css',
  'lib/components/comparison/decision/decision.styles.css',
];
```

`scannedFiles()` appends these. The **same three flatten sources** then do the
work with no new machinery:

- **Mermaid** paints `--cat-N-fill|mark` **directly** on `.section-N` / mindmap
  edges / radar curves → **painter-flatten** (source 3) emits
  `section .section-1 rect { fill: #hex !important }`, resolving the token
  against each theme's map. The mindmap edges' `color-mix(... var(--cat-N-mark)
  …)` flattens too (both operands are theme tokens). Mermaid's authored
  selectors are `:is(section, figure) …`; the existing `unbroadenIsFigure()`
  normalizes them to the `section` arm, so the compat stays a **slide-only**
  fallback (the Read·Article `figure` re-host is a modern-browser-only surface).
- **Legal / decision** set a local (`--tier-hue` / `--jur-accent` /
  `--lane-jur` / `--decision-accent`) to `var(--cat-N-mark)` on a
  `:nth-child` variant → **setter-flatten** (source 1) re-emits it flat on its
  own selector; the plain-`var()` painter that reads it inherits the literal via
  the cascade (no painter-flatten needed — same pattern as the journey mood
  ramp).

### Why no `CHART_ROOTS` / global-redefine change

The global-redefine source exists for `:root` tokens **inherited** to an HTML
consumer with no local setter to flatten. Every diagram-group colour is either a
direct painter (Mermaid) or a variant setter (legal / decision) — both
already-covered paths — so the section roots did not need to join `CHART_ROOTS`.
Confirmed empirically: **zero** new `light-dark()` / `color-mix()` / colour-`var()`
leaks across all themes (the generator's leak gate stays green).

### What was deliberately NOT pulled in (scope)

- **journey / roadmap** were already covered — journey is a `CHART_ROOT`, roadmap
  is a `.chart-frame` member — so they are not re-listed.
- **`color-mix()`-direct non-chart consumers** (comparison `redline` /
  `verdict-grid` / `pricing`, legal `obligation-matrix`) and **compare-prose's
  `--cat-on-mark`** ink are also uncovered on old engines, but they are a
  *different* mechanism (direct `color-mix`, not the `--cat-*` palette) with its
  own flatten questions (some read inline-only locals). Noted here + in
  `gotchas.md` as a follow-up rather than folded in (HARD RULE #18): a `redline`
  op's `color-mix` fill and a `verdict-grid` cell would need the same
  painter-flatten (with the inline-local coarse-flat treatment where a local has
  no CSS setter), which is a materially larger scan than the `--cat-*` group and
  deserves its own change.

## Verification

- New coverage assertions in `test/unit/tools/chart-compat-css.test.js` pin a
  Mermaid band fill, a mindmap edge, and the legal/decision setters — a future
  refactor that drops the group fails there.
- Leak gate + brace/override/`:is`-arm gates: green on every theme.
- `color-parity` integration test (resolver ↔ real Chromium): green — so each
  flat literal the generator emits equals the modern computed colour (e.g. indaco
  decision option 1 → `#2E608A` = `--cat-1-mark` light).
- Full unit suite (3532) + lint + `build:check`: green.
- **UNVERIFIED:** the real old webOS/smart-TV surface — unreachable from CI, same
  caveat as the 2026-07-11 note. The parity test is the transitive stand-in.
