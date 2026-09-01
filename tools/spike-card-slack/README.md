# `spike-card-slack` — the card-slack instrument

**SPIKE — not production tooling, and not wired to any gate.** This is the
measurement harness behind
`engineering/decisions/2026-09-01-card-stack-vertical-alignment.md` §9b and §9d.

It exists so those numbers are **auditable**. The first cut of that note quoted a
calibrated threshold, a 2,908-card population and a 374 → 61 before/after table
from a harness that lived in `.scratch/` and therefore never merged — the same
failure `tools/spike-composition-snapshot.mjs`'s docblock was written to prevent,
and the one an independent checker named as the largest unverified surface in the
note (HARD RULE #23).

## What it measures

Per CARD inside `.cell-stage`, in real Chromium on a real emulator render:

```
leading  = first in-flow child's top  −  the card's CONTENT-box top
trailing = the card's CONTENT-box bottom  −  last in-flow child's bottom
S = (leading + trailing) / content height          total slack
A = (trailing − leading) / (leading + trailing)    signed asymmetry
```

A card is on the **defect** side when `S >= 0.14` and `A >= 0.70` — the constants
derived in §9b by finding the widest interval containing no card, not picked.

## Running it

```bash
node tools/spike-card-slack/render.mjs   exemplars/*/*.md    # → .scratch/card-slack/html/<family>/
node tools/spike-card-slack/measure.mjs  .scratch/card-slack/html > .scratch/card-slack/cards.json
node tools/spike-card-slack/analyze.mjs  .scratch/card-slack/cards.json
node tools/spike-card-slack/calibrate.mjs .scratch/card-slack/cards.json
```

`render.mjs` takes `TREE=` (which checkout to render with — point it at a
worktree to get a before/after), `OUT=` and `CONC=`. Rendering 45 exemplars at
three families takes a few minutes and writes ~500MB of sidecars; delete
`.scratch/card-slack/` when done.

## Four instrument bugs this line of work paid for — all fixed here

Every correction to this measurement has come from the instrument, not the
corpus, and each one moved a headline number:

1. **An out-of-flow child read as flow content.** `decision`'s corner tag is
   `position: absolute`; counting it invented a `square` defect that does not
   exist and under-reported the `wide` one.
2. **The card's own padding not subtracted.** Measuring the border box put
   `stats` at 41% and `kpi` at 48% — a defect class four times its real size.
3. **All-pairs row banding.** Requiring every child to overlap every other
   vertically silently skipped every n×m card GRID, which is most of the
   interesting cases: `matrix-2x2`, `verdict-grid`, `cards-grid`, `q-and-a` and
   `policy-recommendation` all returned "no horizontal row".
4. **`display: contents` children have no client rects.** `list-tabular` wraps
   each row's body column in one, so filtering on "zero rects" dropped the body
   and measured the row against its *shortest* cell — reporting 63% trailing
   slack on a row that is visibly full, and putting a non-defect on the defect
   list. `collect()` now descends through boxless elements instead.

**Assume a fifth.** Read a number here as a claim needing a render behind it,
which is what §2 and §9a of the note do throughout.

## Known limits — measured, not guessed

- **It measures inside a card, never the stage.** A card row floating in the
  middle of an empty stage is invisible to it. That is composition void and
  deliberately out of scope, but "nothing flagged" is not "the slide composes".
- **It is blind to interior void.** Leading/trailing arithmetic cannot see a hole
  *between* a card's children, so a bottom-anchored footer (`pricing`,
  `statute-stack`) reads as **tight, S ≈ 0** while the card is visibly half
  empty. Seeing that needs the leaf-ink primitive of
  `2026-09-01-composition-is-an-engine-measure.md` §2.
- **It reports magnitude, not judgment.** A `stats` card at 20.4% (one sibling
  label wrapped to two lines) and a `decision` card at 68% are mechanically
  identical and visually nothing alike. §9b's whole conclusion is that no number
  in this data separates them.
- **One theme.** Everything is `indaco`. Type metrics differ per theme and the
  slack numbers will move.
