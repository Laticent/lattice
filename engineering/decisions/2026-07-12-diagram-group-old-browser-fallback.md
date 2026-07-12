---
status: shipped
summary: The old-browser flat-literal fallback (@supports not (color: light-dark(...)), 2026-07-11) only covered the CHART bucket + math — its generator (tools/build-chart-compat-css.js) walked lib/components/chart plus math.styles.css. But three non-chart component families ride the ENGINE-WIDE --cat-* palette (--cat-N-fill / --cat-N-mark / --cat-on-fill, all light-dark()-valued) while NOT being .chart-frame members, so they were never scanned and rendered solid black on a pre-Chromium-123 engine exactly like the charts did: Mermaid diagrams (DIAGRAM OVERRIDES paint .section-N bands, mindmap edges, radar curves directly with var(--cat-N-fill|mark)), legal authority-chain / statute-stack (per-tier --cat-N-mark accents), and comparison decision (per-option --cat-N-mark accents). Fix: a DIAGRAM_GROUP_FILES list added to scannedFiles() so the SAME setter/painter flatten machinery emits their flat twins, scoped to each component's own section.<comp> selector (mermaid's :is(section, figure) guards un-broaden to section via the existing unbroadenIsFigure, keeping the compat a slide-only fallback). No CHART_ROOTS was hand-edited, though its global-redefine RULE grew by 13 value-preserving declarations (--cat-*-fill / --c-subcontainer, pulled in by mermaid's direct fills) — harmless but wider than the group's own selectors, so recorded not hidden. journey / roadmap were already covered (journey is a CHART_ROOT; roadmap is a .chart-frame member) and are NOT re-listed. IMPORTANT — this closes the diagram group ONLY, not the whole non-chart --cat-* gap: an adversarial (red-team / inversion / checker) pass found MORE non-chart --cat-N-mark consumers still black on old engines and NOT covered — evidence.kpi (.trajectory), inventory.actors, inventory.logo-wall, and obligation-matrix.lanes — plus the color-mix()-direct consumers (comparison redline / verdict-grid / pricing) and compare-prose's --cat-on-mark ink. The list-based DIAGRAM_GROUP_FILES has no completeness gate, so those omissions are silent; closing them (and adding a gate) is a tracked follow-up, deliberately NOT folded in here to keep scope to the named group (HARD RULE #17/#18). actors/logo-wall route through :nth-child local setters (a scan away); kpi's direct HTML border read needs painter-flatten machinery it doesn't have today. Modern render is byte-unchanged (the @supports block is inert on modern engines; dist/lattice.css untouched). The real old-TV surface is UNVERIFIED from CI — validated transitively via the resolver↔browser color-parity test that pins each flat literal to Chromium's computed value.
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

### `CHART_ROOTS` was not hand-edited (but its redefine set grew automatically)

No *manual* `CHART_ROOTS` edit was needed: every diagram-group colour is either a
direct painter (Mermaid) or a variant setter (legal / decision) — both
already-covered paths — so the diagram-group section roots did **not** need to
join the global-redefine scope. Confirmed empirically: **zero** new `light-dark()`
/ `color-mix()` / colour-`var()` leaks across all themes (the generator's leak
gate stays green).

One honest side effect, though: the `CHART_ROOTS` global-redefine RULE *did* grow
by 13 declarations (`--cat-1-fill … --cat-12-fill`, `--c-subcontainer`). Mermaid's
`.section-N rect { fill: var(--cat-N-fill) }` pulls those `:root` tokens into the
source-2 `referenced` set, so they are now redefined (flat) under
`section.chart-frame, section.journey, section.map, section.math` too. It is
value-preserving and harmless — correct flat literals, scoped to chart roots, and
Mermaid's own coverage comes from its painter twins, not this — but the blast
radius is slightly wider than "the diagram group's own selectors," so it is
recorded here rather than left as a silent surprise.

### What was deliberately NOT pulled in (scope) — and the completeness risk

- **journey / roadmap** were already covered — journey is a `CHART_ROOT`, roadmap
  is a `.chart-frame` member — so they are not re-listed.
- **MORE non-chart `--cat-N-mark` consumers exist and are STILL black on old
  engines** — surfaced by the adversarial trio (red-team / inversion / checker),
  *not* by the original scan:
  - `evidence/kpi` `.trajectory` cards — `border-top-color: var(--cat-N-mark)`, a
    **direct HTML global read**. This one needs machinery, not a list entry:
    painter-flatten (source 3) fires only for SVG paints or literal modern-fn
    values and `continue`s past a non-SVG paint that references a var, and the
    global-redefine (source 2) is scoped to `CHART_ROOTS`. So even listing
    `kpi.styles.css` would not flatten its border.
  - `inventory/actors`, `inventory/logo-wall` — `--pill-border` / `--logo-ink`
    via `:nth-child` **local setters**: these *would* flatten if their files were
    scanned (a scan away, no machinery).
  - `obligation-matrix.lanes` — `--lane-hue: var(--cat-N-mark)` via a `:nth-child`
    setter that lives in `lib/base/base.modifiers.css` (not the component file),
    so covering it means scanning base modifiers, not just a component.
- **`color-mix()`-direct non-chart consumers** (comparison `redline` /
  `verdict-grid` / `pricing`) and **compare-prose's `--cat-on-mark`** ink are also
  uncovered — a *different* mechanism (direct `color-mix`, sometimes over
  inline-only locals) needing the coarse-flat treatment.
- **No completeness gate.** `DIAGRAM_GROUP_FILES` is a hand-maintained literal;
  unlike the auto-walked chart bucket, nothing asserts that every non-chart
  `--cat-*` consumer is covered-or-waived, so the omissions above are *silent* and
  a future component would rot the same way. Closing the remaining consumers **and
  adding a gate** (scan `lib/components/**` + `lib/base/**` for a `--cat-*`-valued
  colour/setter and assert each file is covered or on a justified waiver) is the
  right next step — deliberately held as a tracked follow-up to keep this change
  to its named scope (HARD RULE #17/#18), pending an explicit go-ahead on the
  wider sweep.

## Verification

- New coverage assertions in `test/unit/tools/chart-compat-css.test.js` pin a
  Mermaid band fill, a mindmap edge, and the legal/decision setters — a future
  refactor that drops the group fails there.
- Leak gate + brace/override/`:is`-arm gates: green on every theme.
- `color-parity` integration test (resolver ↔ real Chromium): green — so each
  flat literal the generator emits equals the modern computed colour (e.g. indaco
  decision option 1 → `#2E608A` = `--cat-1-mark` light).
- Full unit suite (3532) + lint + `build:check`: green.
- The override-branch selector split is nesting- AND string-aware
  (`splitTopLevelCommas` / `firstCombinatorIndex`, unit-tested directly) — a comma
  / bracket / space inside `:is(…)`, `[…]`, or a quoted attribute value can't
  desync the depth counter and mis-split a rule (red-team hardening; no such
  selector in the corpus today, but the failure mode is a silently-dropped rule).
- **Adversarial trio run** (red team + Munger inversion + independent checker) on
  the shipping diff: no attack landed, the change is a strict superset of the old
  behaviour, and the paren-aware fix additionally repairs pre-existing *chart*
  override mangles already shipping on `main`. The trio's load-bearing finding is
  the completeness gap above (more non-chart `--cat-*` consumers + no gate), held
  as a follow-up.
- **UNVERIFIED:** the real old webOS/smart-TV surface — unreachable from CI, same
  caveat as the 2026-07-11 note. The parity test is the transitive stand-in.
