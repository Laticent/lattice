---
status: in-progress
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
  the band; `full` expands both the cards and their content to fill. THREE OF THE NOTE'S LOAD-BEARING
  CLAIMS ARE NOW REFUTED BY MEASUREMENT, and §9 is where the branch that fixed the defects records
  what it found. (1) The grid switch is not needed: `align-content` works on a WRAPPED FLEX
  container, the 2x2 never flattens, and flattening is exclusive to `grid-auto-flow: column` — so
  the 77-row switchability sweep prices a migration nothing requires, and "10 rows cannot take the
  declaration" is wrong. Four of those ten take it and it is a measured no-op, because their cards
  carry an explicit `height` and the container's free space is already zero; their void is INSIDE
  the card and the fix is `justify-content` there instead. (2) `auto` does not need runtime
  measurement. The threshold was calibrated over 2,908 cards and the answer is that a threshold is
  the wrong mechanism — above ~19% slack the composed and defect populations are one continuum, and
  the asymmetry axis carries no separating information at all. What predicts the verdict everywhere
  is the card's COMPUTED `justify-content`: zero of the 687 cards told to distribute are ever
  flagged, and all 350 that are compute `flex-start`. The defect is declarative, so the fix is a CSS
  declaration rather than a runtime layout decision. (3) `list-tabular` is not a defect at all — the
  ledger box distributes perfectly (trail 0 on all seven slides) and the reported 63% was a fourth
  instrument bug, `display: contents` children having no client rects. Three cells are fixed and
  shipped — `decision` at wide, `matrix-2x2` at every family, `stats` on autosplit pages — one CSS
  property each, no register and no manifest field. Scope was settled by
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

**Date:** 2026-09-01 · **Status:** In progress (design model; three of its four defect cells now fixed in code — §9) ·
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
| `list-steps` | 10 of 14 | `vertical`, `chevron`, `converge`, `ghost` |
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

**Three more corrections, from reading all 17 components' CSS end to end:**

- **`pricing`'s `flex-wrap: wrap` is declared on the base `ul`**, not on the `two` variant, so
  it applies to default, `two` and `four` alike. "pricing two" names the case that *produces* a
  second visual row, not a variant-scoped declaration.
- **`cards-grid`'s "3 variants" are three EMIT PATHS** — the marp-native `ul/ol`, the lattice.js
  `.cards-grid-inner`, and the VS Code `:not(:has())` fallback — each carrying its own
  `align-content: stretch`. All four real variants run through them. A register that patched one
  path would fix a third of the renders.
- **Two wrapped rows are missing from the set**: `stats` at `[data-family="square"]`
  (`flex-wrap: wrap` with `align-content: space-evenly`) and `kanban` at `tall`/`strip`
  (`.kanban-cards` becomes `row` + `wrap`, with no `align-content`).

**And §6's claim that only `pricing` and `statute-stack` anchor a footer holds exactly**,
checked by a repo-wide grep for `margin-top:auto`, `align-self:end|flex-end`,
`justify-content:flex-end|end` and `margin-left:auto` across every `*.styles.css`. Within the 17
the only hits are those two; `kanban`'s `.kanban-card-meta { justify-content: flex-end }` is a
horizontal right-anchor in the card's meta row, not a bottom pin.

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

~~**And 10 rows cannot take the declaration at all.**~~ **WRONG, and measured wrong — see §3b.
No row needs a grid switch, and the 2×2 never flattens.** The paragraph below is kept because
its reasoning is the trap the next reader will fall into, and because the correction is only
legible against it.

> ~~A wrapped flex container laying cards in two visual rows would be flattened by
> `grid-auto-flow: column` — a 2×2 becomes 1×4. That set is `cards-grid` (3 variants),
> `logo-wall` (3), `pricing two`, `q-and-a grid`, `matrix-2x2` and `verdict-grid`. The last two
> matter most: they are two of the four defect cells this design exists to fix, and the
> mechanism as written does not reach them.~~

**What the mechanism actually is, then.** `align-content` expresses both modes correctly. The
premise that reaching it requires moving a row from flex to grid is the error: **`align-content`
is a valid, effective property on a WRAPPED FLEX container**, and the catalog already relies on
that — `logo-wall` ships `align-content: center` on one today. The whole "switchable / not
switchable" frame above measures a migration nothing needs.

## 3b · The grid switch is not needed, and the wrapped rows are not the blocker

Measured in real Chromium at 1280×720 through the emulator, on the real manifest samples, with
per-card `getBoundingClientRect()` under four `align-content` values plus the shipped baseline.

**The 2×2 survives `align-content: safe center` everywhere.** Line count, cards per line, and
every card's `x` and `width` are identical across shipped / `safe center` / `stretch` /
`center` / `flex-start`. The computed style reads back `safe center`, so the value parses and is
not being dropped. **Flattening is exclusive to `grid-auto-flow: column`**, applied to the same
three rows in the same live DOM:

| row | flex, any `align-content` | `display:grid; grid-auto-flow:column` |
|---|---|---|
| `matrix-2x2` | `[2,2]`, cards 564px | **`[4]`**, cards 123px |
| `verdict-grid` | `[2,1]` | **`[3]`**, 194/194/310px |
| `cards-grid` | `[2,2]`, 564px | **`[4]`**, 121/126/128/116px |

**Four of the ten rows do take the declaration — and nothing happens, for a reason that changes
where the fix goes.** `matrix-2x2`'s cells declare `height: calc(50% - gap/2)`, so two lines of
207.11px plus a 24px gap equal the stage exactly and the container's free space is **zero**.
Every `align-content` value on it is a no-op; shipped and `safe center` render byte-identical.
The slack is not in the row track at all — it is **inside the card**: content box 157.11px
holding 99.53px of content, lead 0 against trail 57.58px, 36.6%. The card is a flex column
computing `justify-content: normal`.

**So "where does the void live" is the question that decides the declaration, and it splits the
set cleanly:**

| row | card has an explicit `height`? | where the slack is | the fix belongs on |
|---|---|---|---|
| `matrix-2x2` | yes (50%) | inside the card, 36.6% | **the card** — `justify-content` |
| `q-and-a grid` | yes (50%) | nowhere — already `justify-content: center`, lead 34.45 / trail 34.47 | **nothing to fix** |
| `cards-grid` | no | the line stretches, so the card stretches, 57.1% | **the container** — `align-content` |
| `cards-grid three` | no | 37.4% / 57.1% | the container |
| `verdict-grid` | no | 43.7% | **the container** |

For `cards-grid` and `verdict-grid` the container declaration alone takes trailing slack to
zero; their cards need nothing, because the stretch was *caused* by the line's stretch. That is
the opposite of `matrix-2x2`, and a register that applied one declaration to both would fix one
and no-op the other.

**Two entries leave the wrapped set.** `q-and-a grid` is not a defect on this axis at all — its
reserved-height cell already centers, and the 35% §1 measured is symmetric padding rather than
top-pinned content. And `pricing two` does not belong: `pricing.docs.md` defines `two` as
"exactly two plans", which is a single line that *does* respond to `align-content`
(438.22 → 275.48) and would break §6's deliberately bottom-anchored footer. The 2+1 wrap appears
only when `two` is applied to the three-tier sample, and that combination already overflows and
is clipped by the real export today.

**A gating fact the note did not have.** A card row is `flex: 1` with default `min-height: auto`,
so under overflow the row simply grows past the stage and free space never goes negative — all
`align-content` values are then identical, and `safe` cannot differ from bare `center` until the
row is explicitly bounded with `min-height: 0`. Bounded, on a real 3-line overflow: bare `center`
pushes the band 69.83px out above the row's content top; `safe center` preserves the top exactly
and puts all 139.66px below. `safe` degrades to start alignment, as intended.

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
- ~~**The sparsity threshold.**~~ **CALIBRATED — see §9b, and the answer is that a threshold is
  the wrong mechanism.** Recommended constants are 14% slack and 0.70 asymmetry; the note's
  picked 15%/0.50 select the same cards, and 0.50 sits 0.013 from the edge of its own empty
  interval where 0.70 has 0.21. But above ~19% slack the composed and defect populations are one
  continuum with no break in it, and the asymmetry axis carries no separating information at all.
  What does separate them is not a number.
- **What `full` does inside the card, concretely.** §3 says the content must expand; it does not
  say by what declaration, and the answer probably differs between a card with one body
  (`decision`) and one with a body plus an anchored footer (`pricing`).
- **The blast radius on committed PDFs.** 18 components appear across the exemplars, the six
  galleries and the examples. Every mode change regenerates those, and each one owes visual
  review at the QUALITY BAR.
- ~~Whether the grid switch is behavior-neutral.~~ **MOOT — see §3b.** It is not behavior-neutral,
  and it is also not needed: `align-content` works on a wrapped flex container, so no row has to
  move to grid and the 20 changed / 10 unswitchable rows are the cost of a migration nothing
  requires.
- ~~**How the wrapped multi-row cases should work at all.**~~ **ANSWERED — see §3b.** They keep
  flex and take `align-content` directly; the 2×2 never flattens. Two of the ten leave the set
  entirely (`q-and-a grid` is already centered, `pricing two` is a single line as documented),
  and four take the declaration as a measured no-op because their cards carry an explicit
  `height` and the container's free space is zero — those are fixed on the card instead.
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

---

## 9 · What the branch measured, and what it changes about the design

Three of the four defect cells are fixed and shipped; the fourth turned out not to be a defect.
None of the four needed the register, the manifest field, or a runtime measurement. That is the
finding, and §9c argues it should change the plan.

### 9a · The three fixes, and the one non-defect

| cell | what it actually was | the fix | measured before → after |
|---|---|---|---|
| **`decision` @ wide** (#1979) | `justify-content: safe center` was stamped for square, tall and strip and left off wide, so the one family most decks use inherited `flex-start` | the declaration moves to the base card rule; the per-family copy is deleted | gallery re-rendered at four families and pixel-diffed: square, portrait and story **byte-identical on all 9 pages**, only wide moves |
| **`matrix-2x2`** (#1980) | the quadrant's height is definite in every family and it declared no `justify-content`, computing `normal` at all four — so portrait's cleanliness was luck | `justify-content: safe center` on the card, **not** `align-content` on the row | card content box 157.11px holding 99.53px; lead 0 / trail 57.58 (36.6%) → lead 28.78 / trail 28.80 |
| **`stats` @ portrait autosplit** (#1981) | base's lone-member split rule fills `li:only-child` on the premise that "every heavy member's card is a wrap-flex row"; a stat tile is a flex COLUMN, so the `align-content: center` paired with the fill is inert | `stats` opts out of the fill and restores the centering base replaced with `flex-start`, **per family, because the axis differs** — see §9e | card 573.4px for 222.4px of content, lead 1 / trail 245.7 (52.7%) → card 328.7px for 223.4px, lead 1 / trail 1 (**0.9%**). At portrait across the corpus: 148 of 162 split pages are lone-member and all 148 are fixed; the 14 multi-tile pages are geometrically identical to `main` |
| **`list-tabular`** (#1982) | **not a defect** | none | see below |

**`list-tabular` is an instrument artifact, found twice independently.** Measured in real
Chromium across all seven `list-tabular` slides in the five exemplars that use it: the ledger
`ol` computes `flex: 0 1 auto` — it is content-sized, never handed height — and `trail` is
**0 on every one**. The void is entirely *below* the list inside the stage (18.8%–33.2%), which
is the author writing four rows on a stage that fits six: composition void, which
`2026-09-01-composition-is-an-engine-measure.md` §1 says the engine must not grade.

The reported 63% came from a **fourth instrument bug**, in the same family as the two that note
already documents. A ledger row is a four-column grid with `align-items: baseline`, and its body
column is wrapped in a `display: contents` `<ul>` — which has **no client rects at all**. An
instrument that skips zero-rect elements drops the body column and then measures the row's
height against its *shortest* cell. Dumped from the live DOM: row content box 165.3px, the body
`li` **161.3px starting 3px down** — the row is exactly its tallest cell. The `$86M` pill sits at
the top because a ledger baseline-aligns its figures with the first line of the label, like a
financial statement. That is the layout working.

The independent sweep reached the same verdict from the other direction: with boxless descent
fixed, `list-tabular` reads **tight ×28 landscape, ×28 square, ×16 portrait — zero trailing at
any family**, where before the fix it read trailing ×6 and ×9.

**The general lesson is now four for four.** Every correction to this measurement has come from
the instrument, not the corpus: an absolutely-positioned corner tag counted as flow content, card
padding not subtracted, all-pairs row banding skipping every n×m grid, and now `display: contents`
children having no rects. Each one moved a headline number. A fifth is more likely than not.

### 9b · The threshold, calibrated — and why it is the wrong mechanism

Calibrated label-free over **45 exemplars × 3 families — 997 slides, 2,908 cards** in real
Chromium, by sorting every card's value and finding the widest interval containing no card. Any
threshold inside such an interval yields exactly the same split as any other.

| constant | note's picked value | widest interval giving an identical split | recommended | margin |
|---|---|---|---|---|
| asymmetry | 0.50 | (0.487, 0.910) | **0.70** | ±0.21 |
| slack floor | 15% | (9.5%, 18.6%) | **14%** | ±4.5pp |

The note's numbers were picked rather than derived and landed in the right place — both are
inside their intervals and select the same cards. The one correction worth making is 0.50 → 0.70:
0.50 sits **0.013** from its edge, where one `list-tabular` row at A = 0.487 is 1.3 points from
flipping the constant's meaning; 0.70 has 16× the margin for zero behavior change. One floor
serves all three families — all three agree the band 9.5%–18.6% is empty.

**But the threshold is not what separates the populations, and three things say so.**

- **The asymmetry axis carries no separating information.** Both populations saturate at
  A = 1.000 at every family. Every value across 42 points of range produces an identical split.
- **Above ~19% slack there is no break.** 20.4 · 20.9 · 21.2 · 22.3 · 23.0 · 23.4 · 24.1 · 24.7 ·
  25.5 … continuous to 81.4%, with no gap wider than 8.9pp at any family. A `stats` card at 20.4%
  (one label wrapped to two lines) and a `decision` card at 68% are mechanically identical and
  visually nothing alike, and **no number in the data separates them.**
- **At portrait the labels invert**, so a component-level label set cannot be calibrated against
  at all: `stats` — labeled composed — is the largest flagged population there.

**What does separate them is a style, not a geometry.** Reading each card's *computed*
`justify-content` predicts the verdict everywhere, with no shared machinery:

| computed `justify-content` | cards | flagged at (14%, 0.70) |
|---|---|---|
| `center` · `safe center` · `start` | 687 | **0** |
| `normal` (behaves as `flex-start`) | 2137 | 350 |
| `space-between` | 84 | 24 — all `cards-grid`, where a single in-flow child degenerates it to `flex-start` |

**Zero of the 687 cards that are told to distribute are ever flagged.** That is a far stronger
basis than a percentage, because it separates *"this box was never told to distribute"* — an
objective, static property of the CSS — from *"this box distributes and its numbers are near the
floor"*, which is the distinction a threshold provably cannot draw.

**Two more findings the calibration produced.**

- **`cards-grid` is on the wrong side of the composition note's label set.** 24 landscape cards at
  29.4–38.5%, confirmed against a rasterized render of `investor-pitch` slide 7: four tinted cards,
  each a heading plus two lines, bottom third empty. It is the `decision` defect at smaller
  magnitude, and it was counted as a composed control.
- **§6's argument for a per-component default is the right conclusion from the opposite premise,
  and stronger for it.** The threshold never proposes to center `pricing` or `statute-stack` — it
  reads them **tight, S ≈ 0**, because the anchored footer *is* the last in-flow child and it *is*
  at the bottom. Leading/trailing slack is structurally blind to a bottom-anchored footer, and both
  cards are visibly half empty (~150px and ~250px of nothing above the footer), which needs the
  leaf-ink primitive to see. So the manifest gate is not there to stop the measurement making a
  mistake; it is there because **the measure that can see the void cannot tell "the layout anchored
  this on purpose" from "the layout abandoned the content at the top", and the measure that cannot
  see it is right by accident.** Only the component knows. `kanban` is a third shape again: its
  lanes are content-sized and centered at stage level, where this instrument never looks.

### 9c · What this changes about §4 and §5

§4 concluded that `auto` must measure sparsity at runtime, beside the overflow probe, and named
that "the first runtime layout DECISION rather than a report" as the load-bearing risk. **The
evidence now says that risk does not have to be taken, and the argument is §9b's cross-check.**

The defect is declarative. A flagged card is one whose box was never told to distribute, which is
a fact about the stylesheet, readable without rendering anything. All three cells fixed on this
branch were fixed by adding exactly that declaration — one property each, no register, no manifest
field, no measurement. And the fix location is decided by *where the void lives* (§3b), which is
also a static property: a card with a definite height takes `justify-content`; a card that stretches
because its line stretches takes `align-content` on the container.

**So the recommendation is to re-order the plan, not to abandon it.** Do the declarative pass
first — component by component, with a render check on each, in the order §9b's flagged counts
give (`matrix-2x2` ×60, `decision` ×44 both now done; then `cards-grid` ×24, `verdict-grid` ×9,
`stats` @ portrait ×147) — then re-measure and see what is left. What remains after that is the
genuine subject of a register: an **author preference** for a composition other than the
component's default, which is a much smaller and much safer feature than a runtime layout
decision, and whose `auto` means "what the component declared" with nothing to measure.

**What that leaves open, and it is the owner's call:** whether the register ships at all once the
declarative pass is done, and whether `full` / `centered` are still the right two values. §3b's
A/B/C render on `decision` says the vocabulary is off: `centered` as §5 defines it — cards shrink
to the densest, band centers — does not remove the void, it **relocates it from inside the card to
around the band**, and for a card with a background fill and a bottom accent rule that is a
downgrade rather than a fix. What `decision` wanted, and what its square rule had all along, is a
third composition the two-value vocabulary cannot name: **the card fills its track and its content
centers inside it.**

### 9d · The corpus, before and after the three fixes

The calibration instrument re-run against this branch's HEAD — same 45 exemplars, same three
families, same probe, at the recommended (14%, 0.70):

| component | family | before | after |
|---|---|---|---|
| `decision` | landscape | 44 | **0** |
| `matrix-2x2` | landscape · portrait · square | 60 · 2 · 60 | **0 · 0 · 0** |
| `stats` | portrait | 147 | **0** |
| `cards-grid` | landscape | 24 | 24 |
| `verdict-grid` | landscape · square | 9 · 9 | 9 · 9 |
| `stats` | landscape · square | 8 · 11 | 8 · 11 |
| **total** | | **374** | **61** |

**Three CSS declarations removed 313 of 374 flagged cards — 84%.** `stats` at portrait going to
zero is worth noting: all 147 were autosplit pages, so the single `lat-split-native` opt-out
covered the whole population rather than a corner of it.

**The 61 that remain are two different things, and only one is a defect.**

- **19 are correct, and a measurement-driven `auto` would break them.** The remaining `stats`
  cards are in an equal-height row where a sibling tile's caption wrapped to two lines. Rendered
  `donor-pitch` slide 9 and looked at it: four tiles, every number on one baseline, every caption
  starting on the same line, and 64px of air under the two short ones. **Centering each tile's
  content independently would drop the `8.5×` and `30 min` below `$1,100` and `$9,400` and break
  the row.** Cross-card alignment beats within-card centering, and no threshold can tell these
  from the 44 `decision` cards it flags identically. This is §9b's continuum made concrete.
- **42 are real, confirmed against renders, and deliberately NOT fixed here.** `cards-grid` at
  `investor-pitch` slide 7 is four cards of a heading plus two lines with the bottom third empty;
  `verdict-grid` at `strategy-proposal` slide 6 is three cards with ~40% empty below the pill row.
  Both are the `decision` defect at smaller magnitude. Both are **off the path** of #1979–#1982, so
  HARD RULE #18 logs them rather than pulling them into this diff — and §3b already says where each
  fix goes: their cards have no explicit height and stretch because the line stretches, so the
  declaration is `align-content` on the container, not `justify-content` on the card.

### 9e · What an independent checker found, and what it changed

The three fixes went to a checker before the merge ask. It confirmed `decision` and `matrix-2x2`
— reproducing §9a's numbers to the decimal and extending the byte-identity claim from three
families to four — and it found three real defects in the `stats` change and two in this note.
All five are corrected above; they are recorded here because each one is a shape that will recur.

**1 · The `stats` fix was inert at `square`, and the reason is the AXIS.** `justify-content` and
the `flex` shorthand both address a flex container's **main** axis, and the `stats` list is a
column only at `tall`/`strip`. At `wide` and `square` it is a row, so the tile's height is the
**cross** axis and neither declaration touches it. Measured on a square autosplit fixture: the
lone tile stayed **791.9px tall with 463.7px of void** below the number while `flex` dutifully
changed from `1 1 auto` to `0 1 auto`. The comment in `stats.styles.css` had claimed in as many
words that `justify-content` was right "in every family here and needs no family split" — a
claim about four families, tested on two. Corrected: the vertical axis gets `flex` where it is
the main axis and `align-self` where it is the cross axis, each family-scoped. Square now
measures **h 329.2, trail 1**.

**2 · The rule on the list was unguarded, and moved 30 pages it had no business touching.**
`justify-content: safe center` on the `ol` fired on *every* `stats` split page rather than only
lone-member ones. At square that is the horizontal axis, so 30 real corpus pages moved 150–275px
sideways — plausibly for the better, and entirely out of this change's scope. The rationale for
leaving it unguarded ("with one tile it is indistinguishable from `space-evenly`") was also
measurably false: multi-tile split pages compute `flex-start`, because base's 2-repeat rule at
(0,4,2) beats stats' own family rules at (0,3,2). Now guarded with `:has(> li:only-child)`;
left-packed multi-tile square split pages are how `main` renders and stay that way (#18).

**3 · The evidence offered for the `stats` change was a null test.** "All 33 exemplars using
`stats`, 418 pages, rendered with and without: zero pages changed" is true and proves nothing:
**none of those 418 pages carries a `stats` split section at all**, because no shipped deck
autosplits `stats` at its committed geometry. The measurement rendered a corpus in which the
rule cannot fire and reported that it did not fire — and it sat in the row meant to establish
the change was safe. It is a scope statement, not a safety proof, and §9a now says so. The real
evidence is at the geometries where the rule *does* fire, and it is in the row above.

**4 · This note declared itself to have no production code** while §9 said three cells were
fixed and shipped, in the same file. `status:` is now `in-progress`.

**5 · Four British spellings** entered on `+` lines of this note (#21). Fixed; the retired
`checkUsEnglish` ratchet means no gate catches these, so prose review is the only net.

**One path stays UNVERIFIED, deliberately.** A `wide`-family `stats` autosplit page could not be
reached: `stats` overflows *horizontally* at wide and the export clips it rather than splitting
(confirmed on three fixtures at 10, 20 and 6 heavy tiles — one section, no split pass, "Content
clipped"). The `align-self` rule covers `wide` by construction, since it is a row there exactly
as square is, but that is reasoning, not a render. If the splitter ever learns to act on
horizontal overflow, this is the cell to re-check first.

**And §9b's numbers still are not re-derivable from the tree.** The calibration instrument lived
in `.scratch/`, which does not merge — the very failure `tools/spike-composition-snapshot.mjs`'s
docblock was written to prevent. `tools/measure-card-slack.mjs` now ships it, so every figure in
§9b and §9d can be re-run.
