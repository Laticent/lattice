---
status: proposed
summary: >
  A heatmap is a matrix, and a matrix's notation is a TABLE — so heatmap's nested-list authoring is
  retired in favor of a markdown table, and all 22 shipped heatmap slides migrate in the same change.
  BREAKING for any deck outside this repo. The table buys the thing that actually matters: heatmap
  data starts in a spreadsheet, and a table is paste-compatible where a nested list must be
  transcribed (measured: the 10x12 stress matrix is 94 authored lines as a list, 12 as a table).
  It costs the sublist channel, which is exactly why `roadmap` scored Tier 3 in the detail-reveal
  ADR, so per-cell detail gains a CELL-SCOPED `` `# prose` `` sigil (measured: 1 of 8,448 inline-code
  spans in 266 shipped decks starts with `# `, and it is a deck teaching heading syntax). Second,
  a LABEL SET becomes a first-class construct across the system - one normalized entry
  `{key, label, detail?}` with three authoring forms (derived, inline literal, front-matter
  register), mirroring how `acronyms:` already pairs a full object form with a bare shorthand.
  heatmap's DERIVED default is the band's value range, not words: the ramp is quantile-cut per
  matrix, so "warm" names different numbers on every slide, and polarity is unknowable (high
  retention is good, high churn is bad). Third, the ANIMATION ask needed no work at all - verified
  end to end on the real Playground, heatmap already animates through the generic bridge, so the
  DOM backend the session first scoped is unnecessary here.
last-updated: 2026-09-20
companion:
  - 2026-06-20-chart-detail-reveal-family.md
  - 2026-06-19-chart-adaptive-sizing.md
  - 2026-09-02-frame-model-for-motion.md
---

# Heatmap table authoring, and label sets as a shared construct

**Date:** 2026-09-20 · **Status:** design settled with the human; not built.

## Question

A heatmap carries no legend, no per-cell explanation, and no author control over
what its five tones MEAN. The ask was three things at once — a label for the
scale, hover detail per cell, and animation — plus a standing goal: *"standardize
on label creation across lattice for things that are sets."*

## What already exists (and what the ask therefore is not)

Four of the five pieces the request assumes are missing already ship. Establishing
that first is most of the work, because it turns "invent three systems" into
"extend one substrate and retire one authoring form."

| Asked for | Ships today | Where |
|---|---|---|
| hover detail per mark | an authored sublist becomes an inert `<template class="chart-detail" data-mark="i">`, shown in a Floating-UI popover; the same text folds into the slide's speaker note so the PDF keeps it | `_chart-family/mark-detail.js`, `docs/src/playground/chart-interact.js` — 7 charts |
| a legend that moves by available space | a right rail on landscape, a legend-below on portrait, selected by `orientation` | `_chart-family/svg-legend.js`; `2026-06-19-chart-adaptive-sizing.md` §9 |
| responsiveness | box families `wide`/`square`/`tall`/`strip`, stamped as `data-family` on the section | `lib/adaptive/families.js` |
| animation | Anima, the `motion:` register, and a chart-to-scene bridge that reads `data-anima-role` off any node | `docs/src/lib/anima/`, `docs/src/lib/chart-anima.ts` |
| a key→label→description set | the `acronyms:` registry: `ARR: { expansion: …, definition: "…" }`, with a bare-scalar shorthand | `lib/core/glossary-auto.mjs` |

Two things heatmap already does and throws away:

- **Every cell declares its motion role.** A rendered cell is
  `<rect class="heatmap-cell" data-anima-role="region" data-step="3" data-mark="1"
  data-label="Jan 2026 · M1" data-value="62">`. `data-mark`, `data-label` and
  `data-value` are exactly the handles `chart-interact.js` keys its popover on, so
  the hover substrate is three-quarters wired already.
- **Per-row detail is parsed and dropped.** `parseSeries` returns `g.detail` for any
  non-numeric nested bullet; `heatmap.transform.js:120` carries it onto the model and
  nothing ever emits it — the same shape the `acronyms:` `definition` field had before
  auto-glossary gave it a surface.

## Decision 1 — heatmap is authored as a markdown table

A heatmap is a matrix. A matrix's notation is a table, and the nested list makes an
author write each column name once PER ROW.

Measured over the 6 matrices in the shipped gallery:

| Matrix | Cells | As a list | As a table |
|---|---|---|---|
| 4×4 | 15 | 19 lines | 6 |
| 10×12 (the documented ceiling) | 84 | 94 lines | 12 |

Three arguments, in order of weight:

1. **Paste.** Heatmap data starts in a spreadsheet or a SQL result. A markdown table
   is paste-compatible; a nested list has to be transcribed by hand. This is the
   largest authoring win available to this component.
2. **The notation matches the data.** Editing a column means editing a column, not
   hunting one bullet per row.
3. **The house is already on tables for grids** — `matrix-grid`, `obligation-matrix`,
   `roadmap` and `compare-table` all parse them. Heatmap was the outlier.

**The list form is RETIRED, not kept alongside**, and all 22 heatmap-chart slides
across 13 files migrate in the same change. (A further 9 slides carry
`journey heatmap` — that is journey's mood-tint modifier, a different component, and
it is untouched.) **This is breaking for any deck outside this repo**, so the
changelog fragment leads with `**Breaking:**` per HARD RULE #10. The alternative —
accepting both forms — was rejected as two parse paths and two things to teach for
one component.

## Decision 2 — per-cell detail rides a cell-scoped `` `# prose` `` sigil

A table has no sublist channel. That is the exact reason `roadmap` scored Tier 3 in
the detail-reveal ADR (*"table | ❌ no list/sublist channel | med, different
mechanism"*), and adopting the table means inheriting that problem. The sigil is the
different mechanism.

```markdown
| Cohort   | M0  | M1                              | M2 |
| -------- | --: | ------------------------------- | -: |
| Jan 2026 | 100 | 62 `# dipped after onboarding`  | 48 |
```

**Why the backticks, and why `#`.** A bare `#` is unsafe: of 8,448 inline-code spans
across 266 shipped decks, 12 begin with `#`, and they are hex colors (`#000000`,
`#7DE38A`), issue refs (`#1311`) and decks quoting heading syntax. Requiring
`#` + SPACE cuts that to **1 of 8,448** — `# H1`, in a deck demonstrating heading
layout. Scoping the rule to the CELL rather than to the global inline-code dispatcher
takes it to zero, because no shipped heatmap cell contains inline code at all. That
scoping follows `matrix-grid`, whose `[x]` markers are parsed off the cell's own text
(`lib/core/matrix-grid-cells.js`) rather than by `inline-code-directives.js`.

**Why not a trailing value pill, which was the first proposal.** Measured: a second
pill makes the cell VANISH. `readLeadValue` takes the LAST `<code>` as the value, so
the description becomes the value, fails `isValuePill`, and the whole crossing is
reclassified as row detail — and a heatmap paints an absent crossing as *unmeasured*.
The slide does not merely lose a number, it asserts something false about the data:

```
- Jan
  - M0 `100`
  - M1 `62` `dipped after onboarding change`   ← Jan · M1 disappears
→ cells rendered: 3 (Jan·M0, Feb·M0, Feb·M1)
```

Gantt's docs already ruled on the same shape for the same reason: *"Must be a bullet,
not a trailing inline-code token."*

**The unit is the ROW first, the cell second.** Row detail is already parsed and
dropped, so surfacing it is nearly free, and it matches how a matrix is read — the
component's own docs say the finding is *"a PATTERN across the grid rather than any
single value."* Per-cell detail is the opt-in for the crossing that genuinely needs it.

## Decision 3 — a LABEL SET is one construct with three authoring forms

The standing goal was one way to name a set. One normalized entry —
`{ key, label, detail? }` — with three forms, mirroring how `acronyms:` already pairs
a full object form with a bare-scalar shorthand:

| Form | Shape | For |
|---|---|---|
| **Derived** | nothing authored | the default — each chart generates its own set from its data |
| **Inline literal** | `` `[{1, Good}, {2, Better}, {3, The Best}]` `` | a compact one-slide override |
| **Register** | `scale:` in front matter, `1: { label: Cold, detail: "…" }` | deck-wide, with descriptions |

The inline literal is free today: `[{1, Good}, …]` dispatches to nothing
(measured against `inline-code-directives.js`). Note that `{1}` and `{Good}` ARE
pills on their own — the comma is what distinguishes a set entry from a pill, and
that is worth stating in the docs rather than leaving an author to discover it.

**Placement needs no new mechanism.** `buildSvgLegend({ orientation })` already emits
a right rail on landscape and a legend-below on portrait. heatmap becomes the fifth
keyed chart rather than growing its own.

### The derived default is the band's VALUE RANGE, not words

The obvious default — naming the stops hot/warm/cold — is wrong here for three
reasons, in order of weight:

1. **The ramp has 5 stops, not 3.** `RAMP_STEPS = 5`, mirrored into the theme
   generator, the stylesheet's five `[data-step]` rule pairs, and a drift test.
2. **Polarity is unknowable.** High retention is good; high churn is bad. "Hot"
   asserts a reading the engine cannot derive, and heatmaps serve both.
3. **The bands are quantile-cut, not fixed** — cut at each matrix's own quantiles
   (`rampBreaks`), so a word names different numbers on every slide. A range does not
   lie about that.

A range also answers the one question the printed values cannot: *why are these two
cells the same color?* Words remain available as the author's override, which is the
control the request asked for.

**A 3-entry label set is supported without theme work.** The five stops are
independently addressable with per-stop solved ink, so a 3-band scale emits steps
1/3/5 and inherits the AA contrast guarantee unchanged.

## Decision 4 — animation needed nothing

Verified end to end rather than argued. `chartToScene` over a real rendered heatmap
returns a scene of 38 elements, 15 of them `region` marks with stable ids. Driven
through the real docs Playground, the live stage mounts and the cells stagger in
reading order — 1/16 revealed at 0 ms, 16/16 by ~2.5 s, opacities sampled per frame.
`examples/anima-heatmap.md` is the demo deck, with the build committed at early, mid
and settled.

So the DOM backend first scoped for this work is **not needed for heatmap**. It
remains a real project for the `<table>` charts (`matrix-grid`, `obligation-matrix`,
`roadmap`), and it is large: ~17–22 files, and the record itself is unresolved —
§4 of `2026-09-02-frame-model-for-motion.md` calls for a DOM painter while §10 and
§13 propose converting the two named DOM targets to SVG instead.

## Found in passing, not fixed here (HARD RULE #18)

**The Playground reports a false "text too small" on any slide with a live Anima
stage.** Isolated to one variable: same deck, same slide, `motion: on` reports
`Text too small · 5.2pt` and `motion: off` reports nothing. It is a false positive —
the still and the live clone are pixel-identical (both 677×249, same viewBox, same
`preserveAspectRatio`, same 13px value glyph). The hidden poster measures `0×0`,
which is the likely source of the nonsense reading. **It is general, not
heatmap-specific**: a funnel reports `Text too small · 4.8pt` under the same test.

Pre-existing and off the path of this work, so it is logged here rather than pulled
into the diff.

## What this does NOT decide

- Whether the other 19 `series`-substance components adopt the label set, and in what
  order. This lands the construct on one chart, in a shared kernel, so the siblings
  can follow.
- Whether `matrix-grid`, `obligation-matrix` and `verdict-grid` — which share the
  `[x]`/`[-]`/`[ ]` scale and explain it three different ways today, one of them an
  unparsed prose sentence — adopt it next. They are the strongest candidates.
