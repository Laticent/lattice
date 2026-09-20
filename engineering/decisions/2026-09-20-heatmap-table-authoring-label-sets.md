---
status: proposed
summary: >
  A heatmap is a matrix, and a matrix's notation is a TABLE — so heatmap's nested-list authoring is
  retired in favor of a markdown table, and all 17 shipped heatmap slides migrate in the same change.
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
| hover detail per mark | an authored sublist becomes an inert `<template class="chart-detail" data-mark="i">`, shown in a Floating-UI popover; the same text folds into the slide's speaker note so the PDF keeps it | `_chart-family/mark-detail.js`, `docs/src/playground/chart-interact.js` — 14 charts |
| a legend that moves by available space | a right rail on landscape, a legend-below on portrait, selected by `orientation` | `_chart-family/svg-legend.js`; `2026-06-19-chart-adaptive-sizing.md` §9 |
| responsiveness | box families `wide`/`square`/`tall`/`strip`, stamped as `data-family` on the section | `lib/adaptive/families.js` |
| animation | Anima, the `motion:` register, and a chart-to-scene bridge that reads `data-anima-role` off any node | `docs/src/lib/anima/`, `docs/src/lib/chart-anima.ts` |
| a key→label→description set | the `acronyms:` registry: `ARR: { expansion: …, definition: "…" }`, with a bare-scalar shorthand | parsed in `lib/core/resolve-captions.mjs`; surfaced by `glossary-auto.mjs` |

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

### The construct already exists once, hard-coded — `roadmap`'s status key

`buildStatusLegend` (`lib/components/chart/roadmap/roadmap.transform.js:66`) is the
closest thing the repo has to a label set, and it is worth reading before building
another one. It derives the key from the data — *"emits one chip per state ACTUALLY
present, in lifecycle order"* — returns nothing when no marker is present, and places
itself bottom-center because the chart is wide. All three behaviors are right and the
label set should keep them.

What it cannot do is the gap: its labels come from a hard-coded `STATE_LABEL` map, so
an author cannot rename a state, cannot attach a description to one, and cannot reuse
the naming on the next slide. Twelve chart transforms emit legend markup, and only three define a builder, so this
is a pattern being re-solved per chart rather than a construct.

The label set generalizes `buildStatusLegend` rather than competing with it: same
derive-from-data default, plus an author override, plus an optional description per
entry, plus placement that already knows about orientation.

## Decision 1 — heatmap is authored as a markdown table

A heatmap is a matrix. A matrix's notation is a table, and the nested list makes an
author write each column name once PER ROW.

Measured over the 6 shipped gallery matrices — 5 in `heatmap.gallery.md`, 1 in
`chart.gallery.md`:

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

**The list form is RETIRED, not kept alongside**, and all 17 heatmap-chart slides
across 9 files migrate in the same change — 15 slides across 7 files once the
generated `docs/public/components.md` and a dated ADR archive are set aside. (A
further 5 slides carry `journey heatmap` — journey's mood-tint modifier, a different
component, untouched.) A first draft of this note said 22 slides across 13 files and
added 9 journey slides on top: 22/13 is a grep LINE count of both populations
combined, and the 9 counted `_footer:` captions and prose as slides. Size the
migration off 15. **This is breaking for any deck outside this repo**, so the
changelog fragment leads with `**Breaking:**` per HARD RULE #10. The alternative —
accepting both forms — was rejected as two parse paths and two things to teach for
one component.

## Decision 2 — per-cell detail rides a cell-scoped `` `# prose` `` sigil

A table has no sublist channel. That is the exact reason `roadmap` scored Tier 3 in
the detail-reveal ADR (*"roadmap | table | `<td class="cell-state">` | ❌ no list/sublist channel (table) |
med, different mechanism | 3"*), and adopting the table means inheriting that problem. The sigil is the
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
takes it to zero — in the TABLE form, where a cell is a bare number. (Under today's
list form every cell value is itself an inline-code pill, so the scoping argument is
about the form being adopted, not about the tree as it stands.) That
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

**Two of the three shipped; the register did not, and the reason is worth
recording.** A chart transform receives `{ cls, classTokens, orientation, utils }`
and nothing else — front matter never reaches it. Wiring it in means changing
`transformChartSection`'s signature and every caller on BOTH render paths, which
is exactly the kind of change HARD RULE #1 says must land in one coordinated pass
rather than riding along with a component's feature. So the slide-local forms
ship now: an inline set names the bands, and the `scale` token asks for the
derived ones. `lib/core/label-set.js` already parses the register block
(`parseRegisterBlock`, tested), so the remaining work is the plumbing, not the
grammar. A deck that wants the key on every slide can set `class: scale` in its
own front matter today, which Marp applies deck-wide — that carries the key but
not the words.

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
reading order over ~2.5 s, opacities sampled per frame. The deck's first matrix
renders 15 cells, all 15 carrying a motion role — the same 15 the scene reports.
`examples/anima-heatmap.md` is the demo deck, with the build committed at early, mid
and settled.

So the DOM backend first scoped for this work is **not needed for heatmap**. It
remains a real project for the `<table>` charts (`matrix-grid`, `obligation-matrix`,
`roadmap`), and it is large: ~17–22 files, and the record itself is unresolved —
§4 of `2026-09-02-frame-model-for-motion.md` calls for a DOM painter while §10 and
§13 propose converting the two named DOM targets to SVG instead.

## Implementation notes (verified, so the build does not re-discover them)

**A table-authored heatmap already degrades gracefully.** Rendered today, a
`_class: heatmap` slide containing a markdown table emits the plain `<table>` and no
heatmap cells — `parseHeatmap` finds no list and returns `null`, which is the family's
documented "leave the markup alone" contract. So the migration has no broken interim
state: a converted deck renders as a readable table until the parser lands.

**`buildSvgLegend` needs no new variant for the ramp.** Its row model is
`{ swatchFill, swatchStroke?, label, value? }`, and heatmap's ramp is QUANTIZED into 5
discrete stops — so five swatch rows are the right shape, not a continuous gradient.
The existing `orientation` branch then gives the right-rail/legend-below behavior free.

**But the swatch cannot take a fill, and that is HARD RULE #3.** A heatmap cell is
painted by CSS — `color-mix()` driven by `--mix`, selected by `[data-step="N"]` — and
the kernel deliberately emits no color. Passing a literal `swatchFill` would put a
color in the kernel and break theme-swappability. The legend swatch therefore needs to
carry the cell's own class and `data-step` and inherit the same rule, which means
`buildSvgLegend` gains a `swatchClass`/`swatchAttrs` alternative to `swatchFill`. That
is an additive change to a shared kernel used by four charts, so it takes a checker
pass before it lands.

**`html-tables.js` should be a new core kernel, not a heatmap-local parser.**
`roadmap.transform.js` already carries `parseRowCells`, `parseRows` and a thead/tbody
splitter privately. heatmap would be the second consumer and `obligation-matrix` the
third, so the walkers belong beside `html-lists.js` in `lib/core` (HARD RULES #1/#15)
rather than copied.

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

## What driving the real Playground found, after the gates were green

The per-cell reveal shipped with a green lint, a green unit tier, a green
`build:check` and a green CI — and it did not work. HARD RULE #23 asks a verification
claim to name its surface and carry an artifact from it; the claim here rested on the
PDF speaker note, which is a different surface with a different code path. Driving the
actual Playground (seeded deck, real Chromium, real pointer) found two defects, neither
of which any gate in the tree could see.

**1. The card came up empty — the `<li>` is the family's contract.**
`chart-interact.js` `reveal()` builds a card from
`tpl.content.querySelectorAll('li')`: the first item is the body, the rest join as
meta. A template holding bare text yields NO items, so body and meta both come back
empty — and an empty body is exactly what the layer reads as `lean`, the compact
value-only tooltip a mark with no authored detail is supposed to get
(`2026-06-21-chart-reveal-lean-tooltip.md`). The annotation did not error; it
disappeared, on every live surface, while still reading correctly in print because
`detailNote` carries its own bare-text fallback and never needed the wrapper. Every
other member arrives pre-wrapped because it hands `detailPayload` the inner HTML of an
authored sublist. A table cell cannot nest one, so `markupMarks` puts the shape back.

**2. The card shut itself — Radix's positioning wrapper keeps the pointer, and only
a MOVING pointer finds out.** `ChartDetailLayer` marks its `PopoverContent`
`pointer-events:none`, for the obvious reason that a tooltip following a pointer must
not eat it. But Radix renders that content inside
`[data-radix-popper-content-wrapper]`, and the WRAPPER stays `pointer-events:auto` —
so the card is transparent to the pointer and the box around it is not.

The geometry decides the rest, and the first draft of this section got it wrong in a
way worth recording, because this is a section about claims nobody re-derives. It said
the wrapper opens "about 26px below the cursor" and that the card shut "with the
pointer never having moved". Measured: the wrapper opens **12.13px** below the cursor —
that is `sideOffset={12}` on `PopoverContent`, and there is no second main-axis offset;
the 26 came from adding chart-interact's own `offset(14)`, which belongs to the LEGACY
`.db-pp-chartpop` path the React host never takes. And at 12px a cursor that arrives
and stops is never inside the wrapper: a stationary hover stays open indefinitely
(measured, 1.2s, card still open). What actually fails is a SWEEP — the reveal fires
mid-gesture, the wrapper is placed at that earlier cursor point, and the continuing
motion carries the pointer into it. That is an author's pointer; the deliberate,
careful way to test it is the one way that works, which is exactly why it read as an
intermittent glitch.

That one is **family-wide and predates this work**: with the fix reverted, the spec's
funnel arm fails too. An earlier draft explained the family's blind spot by band
height — "a full-width funnel band is tall enough that the wrapper usually lands clear
of the cursor" — which is a plausible story with no measurement behind it, and it is
wrong in direction: at 12px a taller band makes the wrapper land MORE reliably inside
the mark. What varies is how much pointer travel continues after the reveal fires.
HARD RULE #18 still makes it this PR's: the change is what tipped a latent fragility
into a failure, and the fix is one scoped rule rather than a follow-up issue.

The rule is scoped twice — `:has(> .lat-chart-detail-pop)` to our card, and
`@media (pointer: fine)` to devices that hover. The second half is not tidiness: this
is a hover defect, a coarse pointer reveals by tap, and without the query a tap on the
part of the card overhanging the chart's hit rectangle would fall through to Present's
capture layer, so dismissing the card could advance a slide.

**3. The lift and the tilt move a matrix off its own axes.** Seen, not inferred: the
open cell sat visibly off-grid, half under its column header. The reveal's 7px
centroid→hub nudge assumes a mark with somewhere to step OUT to; a heatmap cell has a
neighbour on every side. Both are now off for a matrix.

**What carries the emphasis instead is the dim, not the stroke** — and the difference
matters because the first draft credited the wrong one. `.chart-mark-active` does
thicken the active mark to `--chart-edge-strong`, but a heatmap cell's stroke is the
GUTTER colour (`var(--bg)`: measured `rgb(255,255,255)` light, `rgb(0,29,51)` dark), so
that rule only widens the gap around the tile and adds no highlight. The cue a reader
sees is that every other tile drops to 0.45 while this one holds at 1 — emphasis in the
chart's own language, since a heatmap's whole vocabulary is colour intensity. Checked
on rendered frames in both modes, not reasoned: the active tile is the only saturated
one in light and the only bright one in dark, and it reads at a glance.

This is **not** the trade the gantt makes, and the first draft claiming it was is
corrected here. The gantt pays for losing its tilt with a bespoke ink edge
(`stroke: var(--fill-ink)`); the heatmap has no equivalent rule and does not need one
while the dim is there. It would need one if the dim were ever removed.

**The durable fix is the tier, not the three patches.** No test drove this path on a
browser: the coverage was `chart-detail-layer.test.tsx` (jsdom, no hit-testing, no
stacking) plus per-chart transform tests that compare strings and never hold a pointer.
`docs/e2e/chart-detail-reveal.spec.ts` closes that, and it is non-vacuous by
measurement — but the measurement disagreed with itself, which is worth recording in a
section about claims nobody re-derives. Reverting the `<li>` turns the unit arm red.
Reverting the CSS rule AT SOURCE and rebuilding turns **all three** e2e arms red, three
runs out of three (one parallel, two `--workers=1`), with arm 1 reporting exactly seven
`NO CARD` of nine. An independent checker measuring the same property a different way —
leaving the rule in place and injecting an `!important` counter-rule at runtime — saw
the third arm survive, and reported two of three. Both runs are honest; they differ in
method, not in good faith. So the durable claim is the conservative one: **arms 1 and 3
are the CSS rule's mutation proof**, and arm 2's coverage of it is method-sensitive —
its reliable proof is the `<li>` wrapper and the lift guard, which it also asserts.
An earlier draft of this line said "all three" from a single run; the point of writing
the method down is that the next person can tell which claim they are re-deriving.

## What this does NOT decide

- Whether the other 19 `series`-substance components adopt the label set, and in what
  order. This lands the construct on one chart, in a shared kernel, so the siblings
  can follow.
- Whether `matrix-grid`, `obligation-matrix` and `verdict-grid` — which share the
  `[x]`/`[-]`/`[ ]` scale and explain it three different ways today, one of them an
  unparsed prose sentence — adopt it next. They are the strongest candidates.
