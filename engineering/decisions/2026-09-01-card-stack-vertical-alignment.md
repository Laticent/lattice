---
status: proposed
summary: >
  Design model for the vertical alignment of cards laid side by side — the holistic version of
  #1979/#1980/#1981, which are three symptoms of one missing policy. Measured catalog-wide: 26
  of 61 components render two or more cards side by side, 13 are already sparse with their own
  manifest sample, and between them they use FIVE different alignment behaviors (`normal`,
  `stretch`, `center`, `flex-start`, `start`). There is no policy anywhere — each component
  decided alone, and half of them decided wrong. The fix is a two-level system. A manifest
  declares that a component lays cards out horizontally AND which mode is right for it; a
  deck-level front-matter register overrides that, with `auto` the default and `full` /
  `centered` available to authors. `centered` sizes every card to the densest one and centers
  the band; `full` expands both the cards and their content to fill. Both come off one CSS
  property — `align-content` on a grid row — but the switch to grid is NOT a drop-in, and a
  77-row sweep refuted the first cut's claim that it was: 47 rows are a no-op, 20 change, and 10
  cannot take the declaration at all because a wrapped 2x2 would be flattened — `matrix-2x2` and
  `verdict-grid` among them, two of the four cells the design exists to fix. Two of the changes
  are regressions with rendered artifacts: grid ignores flex ordering, so `compare-prose`'s
  `mirror` variant silently un-reverses, and `grid-auto-columns: 1fr` overrides content-based
  flex sizing, collapsing `pricing`'s tiers until the export raises "Content clipped". `auto` needs real measurement: an auto grid track under `align-content: center`
  sizes to content and NEVER grows to fill, which was measured, so CSS cannot choose between
  the modes and the choice belongs beside the runtime overflow probe. Scope was settled by
  RENDERING all 26 candidates and looking at them, which corrected five: `authority-chain`,
  `cycle` and `roadmap` are cards, not diagrams; `contact` and `wifi` are single cards whose
  internal zones the detector miscounted as a row. A second look at full resolution corrected two
  more: `q-and-a` is a ruled cell grid rather than cards (out, leaving 17 in scope), and
  `authority-chain`'s DEFAULT variant is a vertical stack. Two components — `pricing` and
  `statute-stack` — deliberately anchor a footer to the bottom of a full-height card, which is
  why the manifest must carry a per-component default rather than the register imposing one.
builds-on: 2026-09-01-composition-is-an-engine-measure.md, 2026-06-22-the-fit-spine.md, 2026-07-12-struck-elevation.md, 2026-07-28-capacity-basis.md
---

# Cards laid side by side need one vertical-alignment policy, and there is none

**Date:** 2026-09-01 · **Status:** Proposed (design model; no production code) ·
**Decision owner:** Sharmarke

`2026-09-01-composition-is-an-engine-measure.md` argued that the engine should measure
mechanism void — a box handed height that it never distributed — and filed three component
issues as symptoms. They are not three defects. They are one missing policy, and this is the
design model for it.

---

## 1 · The finding: five behaviors, no policy

Rendered every component's manifest sample and every variant of it through the real emulator —
61 components, 240 (component × variant) slides — and measured, for every container laying
children out side by side, the row track's height against its tallest card's own content.

**26 of 61 components render two or more cards side by side. 13 are already sparse with their
own manifest sample** — the row track is at least a quarter taller than anything in it:

| component | slack with its own sample | current `align-items` |
|---|---|---|
| `cards-stack` | 75% | `stretch` |
| `compare-prose` · `decision` | 69% | `stretch` · `normal` |
| `cards-grid` | 67% | `normal` |
| `authority-chain` | 56% | `flex-start` |
| `kpi` | 48% | `normal` |
| `verdict-grid` | 38% | `normal` |
| `list-steps` | 37% | `stretch` |
| `q-and-a` | 35% | `normal` |
| `inventory` | 34% | `normal` |
| `citation-card` | 30% | `normal` |
| `matrix-2x2` | 29% | `normal` |

**Five different alignment behaviors across the catalog** — `normal`, `stretch`, `center`,
`flex-start`, `start` — with no rule anywhere saying which a card layout should use. That is
the actual defect. The three filed issues are what it looks like from underneath.

**And no static per-component answer can be right, because sparsity is content-dependent.**
Slack swings across variants of a single component — `compare-prose` from 0% to 69%,
`decision` from 1% to 69% — and across decks: `stats` is tight on 61 of 64 landscape cards in
the exemplars and trailing on 28 of 36 at portrait. Whatever decides has to look at the
rendered content, not at the component's name.

## 2 · Scope, settled by looking rather than by naming

The first cut of this section sorted the 26 into "cards" and "diagrams that happen to lay
children in a row" from component names and priors. That was wrong on five of twenty-six, and
the only thing that found it was rendering all 26 and looking at them.

**In scope — 17 components.** These render bounded cards side by side, in at least one
variant each:

`authority-chain` · `cards-grid` · `cards-stack` · `citation-card` · `compare-prose` ·
`cycle` · `decision` · `inventory` · `kanban` · `kpi` · `list-steps` · `matrix-2x2` ·
`pricing` · `roadmap` · `stats` · `statute-stack` · `verdict-grid`

*(18 in the first cut. `q-and-a` was moved out by the full-resolution re-check below.)*

**Out of scope — 9.** `journey` (stage bands over a sentiment plot), `state-chart` (a node and
arrow diagram), `radar` (three charts), `timeline-list` (dots on a line), `obligation-matrix`
(a table of marks), `logo-wall` (image plates — the plate IS the content, nothing to center),
`q-and-a` (a ruled cell grid with no card chrome — see the correction below), and `contact` and
`wifi`, which are **single cards** whose two internal zones the detector miscounted as a row.
All four of `contact`, `wifi`, `journey` and `logo-wall` were re-checked at full resolution and
held.

**What looking corrected:**

| component | classified from the name | what the render shows |
|---|---|---|
| `roadmap` | diagram | phase **cards** with a header chip and a checklist |
| `cycle` | diagram | labeled **cards** with connectors between them |
| `authority-chain` | diagram | numbered **cards** inside a frame |
| `contact` · `wifi` | a card row | ONE card, split by a rule |

`kanban` is in scope by owner's call. It is lanes rather than cards, and a board wants its
lanes top-aligned — which is an argument about which MODE it declares, not about whether it
participates. Re-rendered at full resolution, that reading holds: each lane is a header with a
rule and its cards beneath, so `kanban` declares `full`.

**Two entries were corrected by a second look at full resolution**, one slide per image rather
than nine, because the first pass judged them from 40 dpi contact sheets:

- **`q-and-a` is cells, not cards.** Its grid variant is four question/answer blocks separated
  by hairline rules, with no card chrome at all. The first pass called it "borderline but
  structurally cards" and counted it in. The alignment question still applies to it — the
  answers sit high with slack below — but a ruled cell grid is not a card stack, which is the
  thing the register governs. **Moved out, leaving 17 in scope.**
- **`authority-chain`'s DEFAULT variant is a VERTICAL stack**, four cards top to bottom on a
  connecting line. Only its `trail` variant lays them in a row. The component stays in scope,
  but as further evidence for the per-variant rule below rather than as a wholesale entry.

**Scope is per (component × VARIANT), not per component.** Eight of the card components change
layout axis by variant, so a component-level flag would be wrong on all eight:

| component | lays cards in a row | variants that do not |
|---|---|---|
| `list-steps` | 11 of 14 | `vertical`, `converge`, `ghost` |
| `compare-prose` | 8 of 9 | `vertical` |
| `kpi` | 5 of 6 | `compliance` |
| `q-and-a` | 2 of 6 | default, `spine`, `tab`, `solo` |
| `inventory` | 2 of 4 | default, `editorial` |
| `citation-card` | 1 of 5 | default, `pull-quote`, `split`, `margin` |
| `cards-stack` | 1 of 3 | default, `numbered` |
| `policy-recommendation` | **0 of 5** | all of them |

**`CARD_STYLE_LAYOUTS` in `lint-core.js` is not the set to reuse.** It carries
`policy-recommendation`, which never renders a card row at any variant, and it omits `kpi`,
`stats`, `verdict-grid` and `inventory`, which do. It is a list about authoring FORMAT (a
card's body must be a nested bullet), not about layout geometry, and the two only partly
overlap.

## 3 · The mechanism — grid gives both modes, but it is NOT a drop-in

**The first cut of this section was wrong, and a sweep refuted it.** It said moving a card
row from flex to grid puts both modes on `align-content` with *no DOM change*, so every render
path gets it from the shared kernel — implying a catalog-wide find-and-replace. Measured across
**77 card rows in 26 components**, applying the switch in the live DOM and diffing per-card
geometry, with `align-content` pinned to `stretch` so the switch is isolated from the mode change:

| outcome | rows |
|---|---|
| **no-op** — geometry identical | **47** |
| **CHANGED** — cards moved or resized | **20** |
| **not switchable at all** | **10** |

So the declaration is right about what grid *can express* and wrong about what it costs to
adopt. Both modes do come off `align-content`, and that half stands. What does not stand is
"drop-in".

**Failure mode 1 — grid ignores the flex ordering properties.** `compare-prose`'s `mirror`
variant reverses its two panes, and the reversal is a flex behavior. Under
`grid-auto-flow: column` the panes revert to DOM order: the pane labeled THE RIGHT OPTION
moves from the left side to the right, silently. The variant's entire purpose is that
reversal. Rendered before and after and looked at. All 8 of `compare-prose`'s row variants
changed.

**Failure mode 2 — `grid-auto-columns: 1fr` overrides content-based flex sizing, and it
clips.** `pricing`'s tier cards are sized by flex from their content (`flex: 1 1 auto` on an
inner block, §6). Forced to equal `1fr` tracks they collapse to roughly a third of their
width, the tier names break mid-word — *Starte*, *Enterp* — and **the export raises "Content
clipped"**. That is not a cosmetic difference; it is a regression the overflow oracle catches.
A decorative child compounds it: `compare-prose`'s chevron sits between the two panes as a
third flex child, and `1fr` gives it an equal third of the width.

**And 10 rows cannot take the declaration at all.** A wrapped flex container laying cards in
two visual rows would be flattened by `grid-auto-flow: column` — a 2×2 becomes 1×4. That set is
`cards-grid` (3 variants), `logo-wall` (3), `pricing two`, `q-and-a grid`, **`matrix-2x2`** and
**`verdict-grid`**. The last two matter most: they are two of the four defect cells this design
exists to fix, and the mechanism as written does not reach them.

**What the mechanism actually is, then.** Grid with `align-content` expresses both modes
correctly — verified on `decision`, where `safe center` produces exactly the described
composition. It is a no-op on 47 of the 67 switchable rows, so most of the catalog can adopt it
unchanged. The remaining 30 need per-component work: preserve flex ordering where a variant
depends on it, keep content-based track sizing where a component relies on it, and find a
different declaration for the wrapped multi-row cases. **That is a materially larger job than
one property, and any plan built on the earlier wording would have under-costed it.**

**Use `safe`, not bare `center`.** A stress deck whose card overflows the stage kept its top
and clipped its tail, and the export's "Content clipped" tag fired correctly — but that is one
case, and the flexbox rule this replaces already said `safe center`. `safe` falls back to start
alignment when content exceeds the box, so an overflowing card loses its tail rather than its
opening. It costs nothing.

**`full` is still two declarations, not one.** The card must expand its own content as well as
fill the track, or `full` reproduces the `decision` bug exactly — a filled card with one
sentence at the top.

## 4 · Why `auto` needs measurement, and where it goes

**The hoped-for shortcut does not exist, and it was tested.** If `centered` collapsed into
`full` when content is dense — track grows, centering becomes a no-op — one declaration would
serve both and nothing would need to choose. It does not: an `auto` grid track under
`align-content: center` sizes to content and centers it, and never grows to fill. Measured on a
deliberately dense stress deck. So the two modes are genuinely distinct and something has to
pick between them.

**CSS cannot pick.** There is no way to compare a container's content height to its available
height in a declaration. The three candidates are runtime measurement, build-time text
heuristics, or no `auto` at all.

**Build-time is the one to refuse, and there is a measurement saying so.**
`2026-07-28-capacity-basis.md` tried exactly this shape for the capacity ceilings and concluded
the count is *"not a well-defined quantity at all"* — holding `inventory` at 4 members and ~10
words, the same slide fits or clips depending on its look modifier and whether it carries a
trailing insight. Word counts cannot see a look modifier; the rendered box can.

**So `auto` measures at runtime, beside the overflow probe** (`lib/core/overflow-probe.js`) —
the one site that already measures every slide's fit on every render path, cell-aware, and
already shared between the runtime bundle and the emulator. This is Option A of the composition
note made concrete: the same mechanism-void measurement, with an action attached instead of a
report.

**The load-bearing risk is that this is the first runtime layout DECISION rather than a
report.** The overflow probe measures and *reports* (a ring, a tab, an export warning);
autosplit measures and *acts*, and `2026-06-25-runtime-autosplit-eventual-consistency.md`
exists because acting at runtime is harder than reporting. The export must land byte-identical
to the preview, which `tools/check-geometry-parity.js` already asserts across four viewports —
so the gate for this already exists and should be extended rather than invented.

## 5 · The API — two levels, the shape `lift:` already uses

**Level 1, the manifest** declares two things per component: that it lays cards out
horizontally, and which mode is right for it. Not one flag — two. The evidence forcing the
second is in §6.

**Level 2, a deck-level front-matter register** overrides the component default, with a
per-slide class escape. That is exactly `lift:`'s shape (`lib/core/resolve-lift.js`: a deck
register, propagated to every section, with `<!-- _class: lifted -->` and `flat` overriding one
slide), and there are 17 `resolve-*.js` siblings to follow.

| value | behavior |
|---|---|
| `auto` | **the default.** The runtime measures sparsity and picks. |
| `full` | cards and their content expand to fill the available height. |
| `centered` | cards take the densest card's height; the band is centered. |

Top and bottom are deliberately absent: neither is a composition anyone wants, and today's
top-pinning is the defect, not an option.

**The register's name is not settled.** `cards:` reads correctly at every value
(`cards: centered`) and names the thing governed, which matches `rule:`, `eyebrow:` and
`corners:`. `fill:` names the effect, matching `lift:` and `finish:`, but `fill: centered` reads
badly. Recommending `cards:`.

## 6 · The constraint that forces a per-component default

Two in-scope components **deliberately exploit the card being full height**, and a register
that imposed one mode catalog-wide would quietly destroy both compositions:

- **`pricing`** gives its card body `flex: 1 1 auto; display: flex; flex-direction: column;
  justify-content: flex-end`, so the footer line anchors to the bottom of a tall card.
- **`statute-stack`** pins its "In effect since …" chip to the bottom-left with `align-self`,
  and its own comment records that it avoided `margin-top: auto` because that breaks the
  virtual-list height measurement — HARD RULE #20's reasoning, applied by hand.
- **`kanban`** is the third: a board's lanes want their cards at the top, and a lane holding two
  cards is *sparse by construction*. Sparsity measurement would center it and be wrong.

Sparsity cannot distinguish "this card is sparse and should not be" from "this card is sparse
because the layout means it to be". Only the component knows. So the manifest carries the
default and the register overrides it — which is also what makes `auto` safe to ship as the
default value: it means *"use what this component declared, adjusted for what is actually on the
slide"*, not *"center everything"*.

## 7 · What this does not establish

- **Which mode each of the 18 declares.** §6 fixes three (`pricing`, `statute-stack`, `kanban`
  → `full`). The other 15 need a per-component call, and it is a visual judgment per component,
  not something the census can answer.
- **The sparsity threshold.** `auto` needs a number — how much slack before it centers — and
  nothing here derives one. The composition note's classifier used 15% slack and a 50%
  asymmetry split and came out component-clean, but explicitly did not calibrate them.
- **What `full` does inside the card, concretely.** §3 says the content must expand; it does not
  say by what declaration, and the answer probably differs between a card with one body
  (`decision`) and one with a body plus an anchored footer (`pricing`).
- **The blast radius on committed PDFs.** 18 components appear across the exemplars, the six
  galleries and the examples. Every mode change regenerates those, and each one owes visual
  review at the QUALITY BAR.
- ~~Whether the grid switch is behavior-neutral.~~ **MEASURED — see §3.** It is not: 20 of 67
  switchable rows change, 10 more cannot take the declaration, and two of the changes are
  regressions with rendered artifacts. What remains open is the per-component remediation for
  the 30 rows that are not a clean no-op, which is design work this note does not do.
- **How the wrapped multi-row cases should work at all.** §3 names ten rows that
  `grid-auto-flow: column` would flatten, including `matrix-2x2` and `verdict-grid`. No
  alternative declaration is proposed for them here, and they are two of the four cells the
  design exists to fix.
- **Family interaction.** Everything measured here is `wide` at `indaco`. Several in-scope
  components flip their row to a column at `tall`/`strip`, where `align-content` governs a
  different axis, and the composition note already measured the defect set changing per family.

## 8 · How to re-derive

The census renders every manifest `sample`, plus one slide per entry in the manifest's
`variants`, as sections of ONE deck — the shape `test/integration/invariants/component-invariants.test.js`
already uses, and for the same reason (61 separate renders measured ~150s against 8.7s for the
batch). It then measures, for every flex or grid container inside `.cell-stage`, the children
banded into visual rows, and per row track the track height against the tallest card's own
padded content extent.

**Band the children into rows.** The first cut required every child to overlap every other
vertically, which silently skipped every n×m card GRID — `matrix-2x2`, `verdict-grid`,
`cards-grid`, `q-and-a` and `policy-recommendation` all returned "no horizontal row", and
`matrix-2x2` is a confirmed defect. Grids are the majority of the interesting cases, not an edge.

**Exclude out-of-flow children** when measuring a card's content extent. `decision`'s corner tag
is `position: absolute`; counting it produced a defect at `square` that does not exist
(`2026-09-01-composition-is-an-engine-measure.md` §4b).

**Then look at the render.** The classification in §2 was wrong on five of twenty-six until the
26 candidates were rasterized and inspected. No measurement in this note would have caught that.
