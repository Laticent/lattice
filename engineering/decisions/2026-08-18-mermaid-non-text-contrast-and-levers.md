---
status: shipped
summary: >
  An audit of what Mermaid actually paints across all 32 palettes in both schemes, prompted by
  three worries: diagrams are not AA, the xy chart lost its on-brand styling, and Mermaid's color
  mixing leaves us without levers. The third is measured and INVERTED — mermaid emits 234 color
  `themeVariables`, honors every single one, overrides none of ours, and we set 159, leaving 86
  unpulled levers; the janky mixing happens only where we decline to state a value. The first is
  true but mis-located: the INK tier is in good shape (`diagram-ink-contrast.test.js` gates it and
  it holds, with three standing sanctions), while the NON-TEXT tier — WCAG 1.4.11's 3:1 floor on
  strokes, edges, axis rules and grid lines — has no gate at all and fails widely: in 24 of 64
  contexts a flowchart node, gantt bar, pie slice and sequence actor have NO edge that clears 3:1,
  the gantt grid line fails in 49 and the today marker in 33, and the xy-chart axis rules and
  quadrant frame fail in 29, bottoming out at 1.00:1. Most of the dark-mode half traces to ONE
  token: `--diagram-stroke` is a flat mode-invariant literal in all 14 base palettes and feeds 14
  mermaid keys, so it goes dark-on-dark exactly as it once did for the subgraph cluster — which was
  fixed by moving that one key to `--c-container-edge` and leaving the other thirteen behind. The
  repair is cheaper than that precedent suggests, though: `cuoio` already passes with a flat
  literal, because its mid-tone `#8B7E6D` clears 3:1 against BOTH its canvases (3.71:1 light,
  4.74:1 dark) where indaco's `#1F4A6E` banks 9.28:1 on light and collapses to 1.85:1 on dark —
  so the first move is re-curating a value per palette, not re-architecting a tier, and there
  are 14 values to re-curate rather than 32 because every `-dark` twin inherits its base's. The
  xy chart's brand gap is real but is NOT a contrast or a font problem: its type is correct (all
  344 gallery labels render in Outfit, verified on the export), and mermaid genuinely offers no
  gridline or plot-frame lever — what it does offer and we do not use is `xyChart.dataLabelColor`
  and `xyChart.dataLabelColor`. THE REPAIR THEN LANDED IN THE SAME CHANGE (§8): twelve palettes
  retuned, a gate added (`diagram-nontext-contrast.test.js`) and mutation-tested, three keys moved
  off the wrong tier, and 36 previously-unstated levers pulled — 159 to 196 set — taking every
  measured row to 0/64. Two of this note's own claims did not survive implementation and are
  corrected in §8: the dark sankey's invisible ribbons were NOT `sankey.linkColor` (whose default
  is already `gradient`) but Mermaid's inline `mix-blend-mode: multiply`, a light-canvas
  assumption; and the xy chart's gridlines are not deliverable in CSS at all, because the rendered
  SVG contains no gridline elements to restyle.
---

# Mermaid diagrams: the non-text contrast tier, and the levers we are not pulling

**Status:** shipped. This began as an audit that changed no pixel; the repair landed in the
same change. **§§1–6 are the measurement exactly as taken, before the fix** — they are the
"before" column and are deliberately not rewritten. **§8 records what shipped and corrects two
claims the implementation disproved.** Read §8 before quoting §1 or §4.

## 0. The three worries, judged

The audit was prompted by three specific fears. Two hold, one inverts.

| Worry | Verdict |
|---|---|
| "Mermaid charts are not AA" | **True, and mis-located.** The ink tier is fine. The failure is the *non-text* tier (WCAG 1.4.11, 3:1), which nothing gates. |
| "We lost the on-brand styling for certain things (ie xy chart)" | **True, and it is not what it looks like.** Type and ink are correct; the gap is unstyled *graphics* — bare axes, no gridlines, no plot frame. |
| "We don't have a lot of levers — mermaid does janky color mixing and doesn't allow us full control" | **Inverted.** Mermaid honors 234 of 234 color keys and overrides none of ours. We leave **86 levers unpulled**. The mixing is what happens where we decline to state a value. |

## 1. The lever census — measured, not assumed

The folk answer is that Mermaid's `updateColors()` mixes colors out from under us. That
predicts our values get overwritten. It is testable: send a sentinel for every color key
Mermaid emits — alone, and again alongside our full `themeVariables` set — and see which
sentinels come back out.

```
mermaid emits            234 color themeVariables
Lattice sets             159
unused (a lever exists)   86
mermaid IGNORES            0   <- keys with no lever at all
our own keys overridden    0
```

*(`node tools/audit-diagram-contrast.mjs --report levers`, against mermaid 11.14's own
`base.getThemeVariables`, the exact function `mermaid.initialize` calls.)*

**Zero keys are clobbered, in either direction.** Every value we send survives, and every
key we do not send would survive too. Mermaid's color maths is a *fallback for unstated
keys*, not an override of stated ones. So every off-brand color in a Lattice diagram is
one of two things, and never a third: a token we pointed at the wrong tier, or a key we
never named.

The 86 unpulled levers group tidily, and each group maps onto something a reviewer flagged
by eye in the gallery:

| Unused keys | What renders off-brand as a result |
|---|---|
| `stateBkg`, `transitionColor`, `transitionLabelColor`, `stateLabelColor`, `specialStateColor`, `compositeBackground`, `compositeBorder`, `compositeTitleBackground`, `innerEndBackground` | the state diagram's unrelated hues and unstyled composites |
| `requirementBackground`, `requirementBorderColor`, `requirementTextColor`, `relationColor`, `relationLabelBackground`, `relationLabelColor` | the requirement diagram |
| `archEdgeColor`, `archEdgeArrowColor`, `archGroupBorderColor` | architecture-beta's black dashed group box |
| `venn1`–`venn8`, `vennSetTextColor`, `vennTitleTextColor` | venn-beta's stock set colors |
| `personBkg`, `personBorder` | C4's stock avatar glyphs |
| `rowOdd`, `rowEven` | ER attribute-row banding |
| `nodeBkg`, `arrowheadColor`, `border2`, `labelBackgroundColor` | flowchart odds and ends |
| `cScaleInv0-11`, `cScalePeer0-11`, `surface0-4`, `surfacePeer0-4`, `gitInv0-7`, `scaleLabelColor`, `branchLabelColor` | timeline / mindmap / journey / gitgraph second-order surfaces |
| `radar.axisColor`, `radar.graticuleColor` | already covered by `mermaid.css`, so these are redundant rather than missing |
| `xyChart.dataLabelColor` | the xy chart's in-bar value labels |
| `gradientStart`, `gradientStop`, `excludeBkgColor` | minor |

Two things are genuinely outside `themeVariables` and worth stating so nobody hunts for a
theme key that does not exist:

- **`sankey.linkColor`** is a *diagram config* key, not a theme variable
  (`'source' | 'target' | 'gradient' | <color>`). `engineInitConfig` sets no `sankey`
  block at all, so the ribbons take Mermaid's default — which is why the dark sankey's
  flows render as near-black-on-near-black smudges while its node bars are correctly
  colored. This one is a config addition, not a map addition.
- **The xy chart has no gridline and no plot-frame lever.** `XYChartConfig` offers width,
  height, title sizing, data-label toggles and orientation — and nothing that draws a grid
  or a plot border. That part of the xy chart's bareness is a real Mermaid limitation.

## 2. The AA question — the ink tier is fine; the non-text tier is ungated

`test/unit/palette/diagram-ink-contrast.test.js` holds every ink key to 4.5:1 against the
surface it actually sits on, for all 32 palettes in both schemes, and it passes. Its three
standing sanctions (`noteTextColor`, `errorTextColor`, `sequenceNumberColor`) are the only
text failures the sweep finds, and they are already argued for in that file. **Diagram text
is not the problem.**

The problem is everything that is not text. WCAG 1.4.11 puts a **3:1 floor on a graphical
object that carries meaning** — a node's edge, a grid line, an axis rule, a slice boundary.
No gate in the tree measures one, and the ink gate structurally cannot: its design is
*ink key → the surface that ink lands on*, and a stroke is not ink.

A shape is judged here by **discernibility** rather than by any single pair, because a node
with an invisible border but a fill that separates from the canvas is perfectly legible.
The test is whether **any** of its three candidate edges clears 3:1 — fill vs canvas,
border vs canvas, border vs its own fill. Failing all three is a shape with no visible
boundary at all.

```
SHAPES — no candidate edge clears 3:1        (of 64 contexts)
  24/64  flowchart node          worst 1.55:1 onyx/dark
  24/64  gantt task bar          worst 1.55:1 onyx/dark
  24/64  pie slice               worst 1.55:1 onyx/dark
  24/64  sequence actor          worst 1.55:1 onyx/dark
  29/64  sequence note           worst 1.58:1 concrete/light
   0/64  subgraph cluster        clean

LINES — the one pair, no fallback
   2/64  flowchart edge          worst 2.96:1 cuoio/dark
   2/64  sequence signal arrow   worst 2.96:1 cuoio/dark
   2/64  sequence lifeline       worst 2.96:1 cuoio/dark
  49/64  gantt grid line         worst 1.30:1 concrete/light
  33/64  gantt today marker      worst 1.01:1 concrete/light
  29/64  quadrant frame          worst 1.00:1 a11y-achromatopsia/dark
   4/64  quadrant divider        worst 2.67:1 magnolia/light
  29/64  xy x-axis rule          worst 1.00:1 a11y-achromatopsia/dark
  29/64  xy y-axis rule          worst 1.00:1 a11y-achromatopsia/dark
   5/64  xy x-axis tick          worst 2.69:1 a11y-achromatopsia/dark
   5/64  xy y-axis tick          worst 2.69:1 a11y-achromatopsia/dark
```

**The subgraph cluster is the only clean row, and that is the tell** — see §3.

**These numbers are optimistic, deliberately.** They are the baked `themeVariables`,
resolved offline. `mermaid.css` puts `stroke-opacity` below 1 on several strokes (the radar
graticule at `0.20`, its axis lines at `0.5`), and a translucent stroke blends toward
whatever is under it, so a pair reported at 3.1:1 can still render below the floor. Nothing
here reports a failure that is not real; it under-reports.

## 3. One token explains most of the dark-mode half

`--diagram-stroke` feeds **fourteen** Mermaid keys:

```
primaryBorderColor  secondaryBorderColor  tertiaryBorderColor  nodeBorder
actorBorder         labelBoxBorderColor   activationBorderColor
pieOuterStrokeColor taskBorderColor       tagLabelBorder
quadrantPointFill   quadrantExternalBorderStrokeFill
xyChart.xAxisLineColor  xyChart.yAxisLineColor
```

And **no palette makes it mode-aware.** Thirteen of the fourteen base palettes declare it as
a flat literal — `#000000` on onyx, `#1F4A6E` on indaco, `#2A2A28` on concrete, `#8B7E6D` on
cuoio; the fourteenth, carbone, declares `var(--brand-accent)`, which is itself a flat
`#7DE38A`. There is not one `light-dark()` among them, and the thirteen `-dark` twins and
five `a11y-*` palettes declare none at all — they inherit through `@import`. In a dark context that is a dark stroke on a dark canvas:
1.00:1 on onyx and the a11y family, 1.85:1 on indaco.

**This is a known bug shape that was fixed for exactly one of the fourteen keys.**
`engineering/mermaid.md` §5.3 already records it, about the cluster:

> not `--diagram-stroke`, which doesn't flip with color-scheme and so went dark-on-dark

The cluster was moved to `--c-container-edge` — a token that *is* curated per scheme and
gated at 3:1 by `containment-contrast.test.js`. That is precisely why the subgraph cluster
is the one clean row in §2. The other thirteen keys were left on the old token, and the
same defect is still live on all of them.

The fix is therefore not novel design. It is applying a settled precedent to the thirteen
sites that did not get it, plus a gate so the tier stops being invisible.

**And it is cheaper than "make the token mode-aware", because one palette already passes
without being mode-aware.** `cuoio` declares the same flat literal shape as everyone else —
`--diagram-stroke: #8B7E6D` — and it is the only palette with **zero** failing shapes,
because that mid-tone clears the floor against *both* of its canvases:

| | vs light canvas | vs dark canvas |
|---|---|---|
| `cuoio` `#8B7E6D` | `#FAF7F2` → **3.71:1** | `#15110D` → **4.74:1** |
| `indaco` `#1F4A6E` | `#FFFFFF` → 9.28:1 | `#001D33` → **1.85:1** |

Indaco's value is not a mid-tone; it is tuned for the light canvas alone and banks 9.28:1
it has no use for, then collapses in dark. So the first move is a **re-curation**, not a
re-architecture: pick each palette's stroke to clear 3:1 on both canvases, the way cuoio's
already does. `light-dark()` is the fallback for any palette whose two canvases are too far
apart for one value to bridge — and on this evidence most are not.

*(`carbone` also shows zero failing shapes, but it is not evidence for this: it is a
dark-only palette — `--bg` is `#1A1A1C` in both schemes — so its bright `#7DE38A` stroke
never has to bridge anything.)*

## 4. The xy chart, specifically

The worry named the xy chart, and it is worth separating what is actually wrong from what
looks wrong in a low-resolution render.

**Not the font.** Every one of the **344** diagram labels in the gallery renders in
`Outfit, system-ui, sans-serif` — the deck's own body face — verified on the real exported
artifact with `node tools/check-diagram-labels.js`, which reports `foreign-face: 0` and
`mismeasured: 0`. Four independent visual reviewers all reported "monospace everywhere";
all four were wrong, misreading Outfit's geometric letterforms at ~8px. Worth recording,
because that claim is convincing and self-reinforcing across reviewers, and #1674 fixed the
real version of it.

**Not the ink.** `xyChart.titleColor` and the four axis label/title keys are fed from
`--text-heading` on the plot canvas and clear AA.

**What is actually wrong, in order:**

1. **The axis rules are invisible on 29 of 64 contexts** — they are `--diagram-stroke`, §3.
2. **No gridlines and no plot frame**, so the bars float against the bare slide. Mermaid
   offers no lever for either; closing this needs engine CSS over the emitted SVG, the way
   `mermaid.css` already re-themes radar and edge labels.
3. **`xyChart.dataLabelColor` is unset** — an unpulled lever.
4. **The series read as the wrong tier in dark.** `plotColorPalette` is fed from
   `--cat-1..6-mark`, which on dark palettes is the *pale* band (indaco dark
   `--cat-1-mark: #D4DFE8`), so the bars come out near-white and the line series reads as a
   faint tint rather than as a mark. It clears 3:1 on 59 of 64 contexts, so this is a brand
   complaint rather than an accessibility one — but it is why the chart stops looking like
   a Lattice chart.

## 5. What the gallery render shows beyond color

Rendering the gallery surfaced one class of defect that is not a palette question at all,
and the engine already reports it without being asked:

```
⚠ TYPE FLOOR — 5 scaled figures render text below the legibility floor
  (1.00% of slide height = 7.2px here): page 8 at 6.2px, page 15 at 4.6px,
  page 17 at 6.1px, page 26 at 5.3px, page 27 at 6.7px
```

That is ER, C4, timeline, radar and treemap — and it matches, independently, what every
visual reviewer flagged as "microscopic" on those exact slides. It is a figure-scaling
problem, not a theming one, and it is tracked separately from this note. Recorded here only
so the next person does not re-derive it while looking at color.

Two further render-verified items belong to §1's unpulled levers rather than to contrast:
the dark **sankey**'s ribbons are near-invisible (`sankey.linkColor`, unset), and the
**radar**'s two series converge to the same milky pale because `mermaid.css` paints
`.radarCurve-0..7` from `--cat-1..8-mark` at `fill-opacity: 0.28` — and on a dark palette the mark
tier *is* pale, so every series lands in the same narrow band.

## 6. Reality per palette

`--report contrast` transposes the sweep: **failing ROWS per context**, of 6 shapes + 11
lines. Rows rather than pairs, because a shape offers three candidate edges and a pair count
silently weights shapes 3x against lines.

**No context is clean.** The spread is 1 to 9 failing rows out of 17.

| | contexts | failing rows |
|---|---|---|
| worst | `concrete` / `concrete-dark`, dark | **9** (4 shape · 5 line) |
| next | `ardesia`, `brina`, `burgundy`, `carta`, `crepuscolo`, `indaco`, `laguna` + `-dark` twins, dark | 8 (4 shape · 4 line) |
| the a11y family, dark | `a11y-base` and its four siblings | 5 — **all line**, because `--diagram-stroke: #000000` on a `#000000` canvas puts the quadrant frame and both xy axis rules at exactly **1.00:1** |
| best | `cuoio` / `cuoio-dark`, light | 1 (0 shape · 1 line) |

**Dark is 2.4x worse than light: 221 failing rows against 93**, and §3's token is most of
the difference. Every dark context with 4 failing *shapes* is one where `--diagram-stroke`
went dark-on-dark; the two palettes with **zero** failing shapes in either scheme are cuoio
(a genuine mid-tone) and carbone (dark-only, so nothing to bridge).

Two per-palette notes worth having before someone re-derives them:

- **`concrete` is the worst palette in both schemes, for different reasons.** In dark it is
  §3. In light its canvas is `#B8B8B5`, a mid-grey, so the gantt grid (`#D1D1D1`, 1.30:1)
  and today marker (`#B7B7B7`, 1.01:1) — values curated against a white page — vanish into
  it. It owns the two worst light-mode *ratios*; `magnolia/light` has more failing rows (4
  against 3), so "worst in light" depends on which you are optimizing.
- **The `-dark` twin of a palette always scores identically to its base**, in both schemes.
  That is expected — a twin inherits `--diagram-stroke` through `@import` and declares no
  override — and it is worth stating because it halves the real work: there are 14 values to
  re-curate, not 32.

## 7. Recommended order

Not started; this note only argues the sequence.

1. **Re-curate `--diagram-stroke` per palette to a mid-tone that clears 3:1 on both
   canvases**, as `cuoio` already does (§3). This is the single highest-leverage change —
   one token, fourteen Mermaid keys, most of the dark-mode half — and it touches palette
   values rather than the map, so it needs no architectural decision. Reach for
   `light-dark()` only on a palette whose two canvases genuinely cannot be bridged by one
   value, and for `--c-container-edge`'s per-tier treatment only if re-curation runs out of
   room.
2. **Gate the non-text tier.** A sibling of `diagram-ink-contrast.test.js` built on the
   discernibility rule in §2, with its shape/edge table hard-coded for the same reason that
   file hard-codes `SITES` — derive it from the map and the gate re-judges a mis-assigned
   key against its new tier and stays green.
3. **Pull the levers that map to a visibly off-brand family**, largest first: state,
   requirement, architecture, venn, C4 person, ER rows.
4. **`sankey.linkColor`** in `engineInitConfig` — one key, one visibly broken diagram.
5. **The xy chart's frame and gridlines** in `mermaid.css`, plus a decision on whether
   `plotColorPalette` should follow the mark tier or a dedicated series tier.

Steps 1 and 2 are one change and should land together: the gate is what stops step 1 from
silently regressing, and it is what turns a tier nothing currently measures into one that cannot silently rot.

---

## 8. What shipped, and two claims this note got wrong

The audit's recommended order (§7) was carried out in full in the same change. Two of its
statements did not survive contact with the implementation, and both are corrected here
rather than edited away above, because the reasoning that produced them is the useful part.

### 8.1 CORRECTED — the sankey's ribbons were not `linkColor`

§1 said `sankey.linkColor` is unset "so the ribbons take Mermaid's default", implying the
default was the problem. **Mermaid's default IS `gradient`** (`conf?.linkColor ?? "gradient"`,
`sankeyDiagram-*.mjs`), and the ribbons were already being overridden to `--cat-1-fill` by
`mermaid.css` besides. Neither was the defect.

Reading the rendered SVG instead of the config surface found it: Mermaid paints every link
group through an inline **`mix-blend-mode: multiply`**. Multiply darkens toward the backdrop
— exactly right on a white page, and on a dark canvas it drives the ribbon to black. That is
why the flows vanished while the node bars beside them stayed correctly colored. Fixed in
`mermaid.css` with `mix-blend-mode: normal !important` (inline styles yield to nothing less)
and the ribbon opacity raised 0.4 → 0.55, because multiply had been doing part of the
darkening work on the light canvas.

The general lesson is the one this note already argues elsewhere and then failed to apply to
itself: **a config surface tells you what is settable, not what is painted.** Only the
rendered output tells you that.

### 8.2 CORRECTED — the xy chart's gridlines are not deliverable in CSS

§7 step 5 proposed "the xy chart's frame and gridlines in `mermaid.css`". The first half
landed; the second is **not possible**, and the note should not have proposed it.

Verified against the rendered SVG: an xychart emits `g.main > rect.background`, `g.plot`
(with `g.bar-plot-N` / `g.line-plot-N`), and `g.bottom-axis` / `g.left-axis`, each carrying
`g.axis-line`, `g.ticks` and `g.label`. **There are no gridline elements.** A stylesheet can
restyle an element; it cannot create one. Closing this needs an upstream Mermaid feature or
post-render injection in `lib/runtime` — which is a HARD RULE #22 markup sink with its own
census gate, and its own piece of work.

What DID land for the xy chart: its axis rules and ticks are on-palette and clear 3:1 in all
64 contexts (they were at 1.00:1 on the a11y family), and `xyChart.dataLabelColor` is stated
for the first time.

### 8.3 What landed

| § | Recommended | Shipped |
|---|---|---|
| 7.1 | re-curate `--diagram-stroke` per palette | 12 of 14 palettes retuned to a mid-tone; `cuoio` and `carbone` already cleared and were left alone; only `concrete` needed `light-dark()`. Also `--diagram-today` (13 palettes) and `cuoio`'s `--diagram-line`. |
| 7.2 | gate the non-text tier | `test/unit/palette/diagram-nontext-contrast.test.js` + `test/helpers/diagram-surfaces.js`, shared with the audit tool. Mutation-tested against the original values. |
| 7.3 | pull the levers | 36 keys stated: the stateDiagram set, requirementDiagram set, architecture, `venn1`–`venn8`, C4 `personBkg`, ER row bands, `nodeBkg`/`border2`/`arrowheadColor`, `xyChart.dataLabelColor`. 159 → 196 set. |
| 7.4 | `sankey.linkColor` | superseded — see §8.1. |
| 7.5 | xy frame + gridlines | frame/axes yes, gridlines not deliverable — see §8.2. |

**Three keys turned out to be reading the wrong tier**, which §1–6 had not separated from the
`--diagram-stroke` story: `gridColor` (a pale gantt BAR FILL used as a LINE), `noteBorderColor`
(the gantt TODAY MARKER's hue used as a note border) and the quadrant divider/points (a
SIBLING of the fills they sit on). The first two undo a *documented* value reuse in
`base.tokens.css` group 3 — a dedup that equated a surface with a line, which cannot be
correct for both.

### 8.4 One regression, caught and fixed inside the change

Repointing `quadrantInternalBorderStrokeFill` to `--diagram-stroke` looked right — it is
structural chrome — and made that row **worse**, 4/64 → 40/64, because the divider is drawn
on the quadrant FILLS, not on the canvas, and `--diagram-stroke` is curated against the
canvas. It now reads `--cat-on-fill`, the tier gated legible against exactly those fills
(worst 5.11:1). The audit's own per-row output is what caught it, which is the argument for
having built the measurement before the fix.

A second scare was not a regression: the three `--diagram-*-mark` tokens measured 60/64 below
3:1 against their own fills after the retune, against 33/26/37 before. Judged the way the gate
actually judges a shape — does it have ANY visible edge — the three gantt lifecycle bars went
from 29/14/25 failing to **0/0/0**. Border-vs-fill in isolation is not the question, which is
precisely why the discernibility rule exists.
