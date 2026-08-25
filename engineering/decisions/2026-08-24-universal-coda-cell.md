---
status: shipped
summary: >
  The two universal editorial blocks — the Key Insight panel and the below-note — attached by
  SELECTOR SHAPE: `section > blockquote` and `section > .cell-stage > blockquote`, guarded by a
  hand-written `:not()` chain that a unit test parsed back out of the CSS. Two exact DOM paths and
  a hand list, so any component whose transform introduced a wrapper silently lost the block while
  the manifest went on advertising it. Measured across all 61 layouts: EIGHT were wrong —
  compare-code, image, scene and split-panel SWALLOWED the blockquote into a sub-container where it
  rendered as unstyled body text; contact, wifi and video DROPPED it outright when they rebuilt
  their section; premise laid it out as a third column beside the body. The rhythm was wrong
  everywhere else: the step before the panel was whatever `row-gap` its host happened to carry
  (8px in the stage), which on a card list is HALF the 16px between the list's own cards — the
  separator between two different kinds of block smaller than the separator between peers. Fixed by
  giving the beats a HOST: one `.cell-coda` Cell, harvested by a kernel that runs FIRST in the
  registry (before any rebuilder can swallow or delete them), docked by the section's declared
  outer STRUCTURE rather than by component name — measured in Chromium, only three shapes occur
  across the catalog — and carrying one `--coda-step` of its own. Exclusions become `coda.claims` in the
  component manifest, so the published contract and the render read one predicate and the CSS
  `:not()` chain (and the test that parsed it) are gone. 49 of 52 layouts now land on exactly the
  step; the three that do not are compositions whose own centering supplies the difference.
---

# The universal blocks needed a host, not a longer selector

**Date:** 2026-08-24
**Status:** shipped
**Follows:** `2026-07-14-one-frame-model.md` (the `stage: flow|canvas|sovereign` axis this borrows
its shape from), `2026-06-27-stage-flow-no-margins.md` (why the step is `padding`/`gap`, never
`margin`), #1651 (which fixed the CONTRACT and left the ATTACHMENT alone).
**Rules touched:** none changed. HARD RULE #1 (one predicate, two callers), #15 (one peel, every
rebuilder), #20 (padding, not margin) all apply as written.

---

## 1. The report, and what it turned out to be

The report was about spacing: *"there seems to be an issue with the gap between key insight box and
certain components like code and code compare."* Rendering the corpus found the gap complaint was
real and universal, and that it was sitting on top of a much larger correctness defect on the two
components named.

`code` measures a correct 8px step — the same as every other stage-hosted layout. What makes it
read badly is that both sides are PAINTED: a filled code panel 8px above a filled insight panel.
`compare-code` renders no panel at all. The author's `> …` ends up inside `.code-cols > .code-col`,
where it prints as unstyled body text under the right-hand code block — no panel, no eyebrow, not
even full width.

So the question behind the report was the right one to answer instead: *the way we support these
blocks should be determined by the kind of structure a component uses — our universal stuff should
support the structures, not the components.*

## 2. Why selector-shape attachment fails, measured

The Key Insight panel had no transform at all. It was pure CSS, matching two DOM positions:

```css
section:not(.quote):not(.math):not(.citation-card):not(.policy-recommendation):not([class*="layout-"]) > blockquote,
section:not(.quote):not(.math):not(.citation-card):not(.redline):not(.inventory):not(.policy-recommendation):not([class*="layout-"]) > .cell-stage > blockquote { … }
```

Every rule in the family was written twice (direct child, and the position the masthead lift moves
it to), and each arm carried its own `:not()` chain. `KEY_INSIGHT_EXCLUDED` in
`lib/core/authoring-blocks.js` mirrored that chain by hand, and a unit test parsed the CSS to keep
them in step. below-note was better off — it had a real kernel — but it ran LAST, after every
structural transform, and matched only a direct child.

Rendering one probe slide per component through the real emulator and measuring in real Chromium:

| what happened | layouts | how |
|---|---|---|
| panel renders, 8px step | 43 | the stage's own `row-gap` |
| **swallowed, unstyled** | compare-code, image, scene, split-panel | the transform wrapped the tail into `.code-cols` / `.image-text` / `.scene-text` / `.panel-right`, so neither selector arm matched |
| **dropped outright** | contact, wifi, video | the transform rebuilds the section from the authored list and never re-emits the node |
| **misplaced** | premise | the section is a flex ROW, so the panel became a third column: −243.8px of "gap" |

All eight advertised support in `authoring.blocks`, the deck lint accepted the markup, and Compose
offered the register. The author applied it and got silence — the failure #1651 exists to close,
still open because #1651 fixed the contract and not the attachment.

The below-note half told the same story from the other end. Of 11 canvas layouts, ZERO were
wrapped: seven silently became the component's own `.chart-caption` (a different treatment than the
one advertised), and the same three dropped it.

## 3. The rhythm defect, separately

On a `list` slide the gap between two peer cards is **16px** and the gap between the whole list and
the Key Insight panel is **8px**. The separator between two different KINDS of block was half the
separator between peers inside one block, so the panel read as a fourth list item. That is not a
`code` problem; it was every layout, and it followed from the panel having no step of its own — it
inherited whatever `row-gap` its host declared (8px in the stage, 0 on a sovereign, 64px on
premise's row).

## 4. What shipped

**A cell.** `lib/core/coda.js` harvests the trailing beats into one
`<div class="cell-coda" data-dock="…">`, declared as a Form Cell
(`lib/forms/cell/coda/coda.cell.json`, region `coda`, with a `coda` Tile) and styled by
`lib/forms/cell/coda/coda.css`. Everything downstream addresses the cell: the panel chrome in
base.modifiers.css is now six single-arm rules with no `:not()` chain, and the CSS-parsing drift
test is deleted because there is nothing left to parse.

**Running first.** The kernel is the FIRST entry in the transformer registry. This is not an
optimization: for the three components that delete the node there is nothing left to re-parent by
the time a last-running pass could look. Every rebuilder that re-slices a section body now peels
the cell the same way it already peeled a trailing `<footer>` — one shared `peelCoda`, called from
six places rather than six ideas of what the tail contains (HARD RULE #15).

**Docking by structure.** A full-width band beneath the body has to be placed differently depending
on the section's outer structure, and measuring all 61 layouts in Chromium found only three
shapes: **55 column, 4 row, 2 grid**.

The first cut of this note said "57 column, 3 row, 1 grid — measured, not assumed", and that
was wrong in a way worth recording, because it is the failure mode this whole change is about.
Those were the DECLARED values, tallied out of the catalog the change itself wrote. The probe
behind them only measured layouts that actually HOST a coda, so `math` and `split-compare` —
which claim both beats and therefore host none — were silently defaulted to `column` and never
measured at all. Measured, they are `grid` and `row`. The declarations were inert today (a
layout that hosts no coda docks nothing), but the schema defines `dock` as the section's outer
structure, so they were a latent lie of exactly the kind `coda.claims` exists to end. Corrected;
the numbers above are now the measurement. So the CSS has one arm each and names no component; a layout declares its
shape once as `coda.dock`, and `column` is the default, so a new component declares nothing. The
row arm also zeroes `row-gap`, which corrects an accident rather than a choice: a row layout's
`gap` is a COLUMN GUTTER, and the shorthand sets both axes, so the moment the row wraps a 64px
(premise) / 48px (video) gutter nobody meant vertically reappears above the band.

**One step.** `--coda-step` (`--sp-md`, 24px) is deliberately wider than any intra-block step, the
widest of which is a card list's 16px. The cell SUBTRACTS the host's own gap rather than stacking
on it: a host that puts a gap before its last child declares `--coda-host-gap` beside the gap it
sets (the stage, diagram's re-tuned stage, scene's two stacked compositions). `padding`, never
`margin` — HARD RULE #20, and the band paints no surface, so the padding adds no box.

**Declared claims.** `coda.claims` in the component manifest replaces both exclusion lists. It
carries two reasons, and the second was not previously expressible at all:

- **USED** — the layout renders that element as its own anatomy (quote's quotation, math's display
  equation, a chart's caption via `liftChartCaption`, split-panel's pull-quote).
- **NO ROOM** — the layout is a POSTER whose body fills the stage by construction. `contact` and
  `wifi` measure a 527px card in a 524px stage; there is no band position that does not crush it.
  Before this field the engine simply dropped the node; when the coda first carried it through, the
  slide overflowed and was tagged "Content clipped". Declaring the claim makes the deck lint tell
  the author, which is the honest answer.

## 5. What the numbers say now

52 layouts render a coda on the probe sweep. **49 land on exactly 24px.** The three that do not are
`image` (52px), `video` (45px) and `scene` (26px): each is a centered figure composition, and the
difference is the composition's own slack between its ink and the box the band docks to, not the
band's step. The panel now renders on every layout that publishes one, including all eight that
were broken.

The published contract (`authoring.blocks`) changed for **13** layouts, not the four the first
draft of this note named. In full:

| layout | before → after | why |
|---|---|---|
| `contact`, `wifi` | both → none | poster layouts; the card fills the stage |
| `split-compare`, `split-panel` | key-insight → none | the element is their own anatomy |
| `compare-code` | key-insight → both | the #1363 substring wart is gone; it claims neither |
| `funnel`, `journey`, `map`, `quadrant`, `radar`, `word-cloud` | both → key-insight | the trailing `<p>` becomes `.chart-caption`, and always did |
| `matrix-grid`, `state-chart` | both → key-insight | see below |

The eight chart layouts are the ones the first draft missed entirely, and two of them are claimed
for a reason that is **not true as written**. The schema and `lib/base/base.docs.md` justify
`trailing-paragraph` on a chart as "turns its final paragraph into the chart caption". Six do.
`matrix-grid` and `state-chart` render **neither** a caption nor a below-note — measured
identical before and after — so their claim is correct in effect (nothing is lost) and wrong in
reason. They are claimed because they render no note today, not because they consume the
paragraph. Worth revisiting: if either should host a below-note, the claim is what is stopping it.

Separately, `compare-code`, `premise`, `scene` and `video` gain blocks they now actually render —
but that is a RENDER change, not a contract change; their `authoring.blocks` was already correct
and unchanged.

## 6. What was NOT taken

**#1363's substring wart is resolved as a side effect, not re-litigated.** below-note's old matcher
tested `cls.includes(x)`, so `compare-code` inherited `code`'s exclusion and `pull-quote` inherited
`quote`'s. Declared claims are per layout and token-exact, so each name answers for itself. The
corpus delta is reported in the PR rather than argued here.

**`gantt`'s 13,496px probe reading is not a coda defect and is not fixed here.** It is a
`div.chart-details` laid out at zero height, present before this change at the identical number —
a pre-existing, off-path defect, logged rather than pulled into this diff (HARD RULE #18).

**split-panel's base variant still renders no Key Insight panel.** It claims the blockquote because
its `pullquote` variant genuinely uses it, and a variant-scoped claim is a bigger design question
than this change. Today's rendering is unchanged; only the contract stopped lying about it.
