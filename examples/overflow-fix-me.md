---
marp: true
theme: indaco
paginate: true
header: "Lattice · overflow cause highlighting"
---

<!-- _class: title silent -->

`Feature demo · Fix-Me overlay`

# See what's overflowing, not just that it is.

The existing red "Overflows" ring names the slide. This adds a yellow
"Fix Me" tag that names the specific element responsible — when the cause
can be proven, not guessed.

---

<!-- _class: split-compare -->

`Decision Required`

## A deliberately over-stuffed comparison.

This slide exists to demonstrate the Fix-Me overlay — open it in a live
preview (Playground, Drawing Board, Studio, or the VS Code marp preview) to
see the red ring and the yellow tag land on "Preferred option" alone, not
"Alternative option" or the whole panel. A static export shows neither: the
export strips both markers and clips the content instead, so this page
prints a clean but visibly cut-off card.

- Alternative option
  - A short first fact about the alternative
  - A short second fact about the alternative
- Preferred option
  - This option's second bullet is written long on purpose, padding well
    past what the panel comfortably holds so the bounded content cell
    genuinely clips it — the exact case the overlay is built to catch,
    padding padding padding padding padding padding padding padding.
  - A third fact, still padding this option out further so the compare-right
    cell overflows for real, not just in theory, padding padding padding
    padding padding padding padding padding padding padding padding.

> The recommendation in one decisive sentence.

---

<!-- _class: cards-grid -->

## Which card is the actual problem?

- Short card
  - One short line.
- Short card two
  - Another short line here.
- The oversized card
  - This card's body is written deliberately long, forcing its row to grow
    far taller than its neighbor and threatening to push the whole grid
    past the frame, padding padding padding padding padding padding padding
    padding padding padding padding padding padding padding padding padding
    padding padding padding padding padding padding padding padding padding.
- Short card four
  - The last short line — stretched to match its tall row-mate, but not
    the cause.

---

<!-- _class: content -->

## Two signals, tiered by confidence — never a guess dressed as a fact.

A bounded content cell (`.cell-stage`, `.panel-right`, `.compare-right`)
that overflows genuinely clipped its own content — it never pushed a
neighbor, so highlighting it is a geometric fact, not a guess. Where the
cell holds a repeated collection, the tag narrows further to whichever item
is a real content outlier — never its stretched neighbor.

---

<!-- _class: content -->

## No clip-cell at all is a different, still-open case.

A slide that overflows with no bounded content cell in play — an oversized
image, a long code block, a wide table — has no geometric signal to drill
into yet. A prose-density word-budget fallback for that case is a deferred
follow-up, not part of this change.

---

<!-- _class: closing -->

# Preview-only. Never in the deliverable.

The overlay lives entirely in the runtime script every live preview loads
— never in the export pipeline — so a shipped PDF, PPTX, or HTML export is
byte-identical whether a slide overflowed during authoring or not.
