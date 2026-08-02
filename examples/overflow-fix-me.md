---
marp: true
theme: indaco
paginate: true
header: "Lattice · overflow cause highlighting"
---

<!-- _class: title silent -->

`Feature demo · Fix-Me overlay`

# See what's overflowing, not just that it is.

The red "Overflows" ring names the slide. The yellow tag names the element responsible — "Fix Me" when the cause can be proven, "Likely fix" when it is the best available guess.

---

<!-- _class: split-compare -->

`Decision Required`

## A deliberately over-stuffed comparison.

This slide overflows on purpose: in a live preview the ring and the yellow tag land on "Preferred option" alone, never on the whole panel.

- Alternative option
  - Ships in six weeks on the existing contract
  - No new vendor review, no new security sign-off
- Preferred option
  - Ships in nine weeks but retires the parallel intake queue entirely, which is the cost center three of the last four quarterly reviews flagged, and it removes the manual reconciliation step that currently consumes roughly a day and a half of finance time every close.
  - Carries a twelve-month support commitment from the vendor, renegotiated down from the eighteen-month floor they opened with, and folds the migration tooling into the base license rather than billing it as professional services at the usual blended rate.

> Recommend the preferred option: three weeks of delay buys a permanent reduction in close-cycle effort.

---

<!-- _class: cards-grid -->

## Which card is the actual problem?

- Short card
  - One short line.
- Short card two
  - Another short line here.
- The oversized card
  - This body is written long enough to force its row taller than its neighbor and push the grid past the frame, which is exactly the shape the overlay exists to identify: one outlier in a collection of otherwise well-behaved siblings, where naming the slide tells you nothing useful and naming the card tells you precisely where to cut. A reviewer looking at four cards should not have to measure them to find the one that broke the layout, and an author who has just pasted a paragraph into the wrong place should be told which paragraph rather than which slide.
- Short card four
  - The last short line — stretched to match its tall row-mate, but not the cause.

---

<!-- _class: content -->

## Two signals, tiered by confidence — never a guess dressed as a fact.

A bounded content cell (`.cell-stage`, `.panel-right`, `.compare-right`) that overflows genuinely clipped its own content — it never pushed a neighbor, so highlighting it is a geometric fact. Where the cell holds a repeated collection, the tag narrows to whichever item is a real content outlier.

---

<!-- _class: timeline-list -->

`Case B · no clip-cell in play`

## Which milestone actually blew the budget?

`timeline-list` is never wrapped in a bounded cell, so a clip-cell probe finds nothing even though the slide genuinely overflows. The yellow tag reads "Likely fix," not "Fix Me" — a word count past budget is the best available guess, never a geometric certainty.

1. `Q1` Kickoff `on-track`
   - One clause says what changed here.
2. `Q2` Scope creep — the plan absorbed a new stakeholder request every week and nobody on the steering committee was willing to say no `slipped`
   - A tag names the milestone's kind.
3. `Q3` Recovery `at-risk`
   - Sixteen words is each entry's budget.
4. `Q4` Launch `blocked`
   - Four to six entries reads best.

---

<!-- _class: content -->

## No clip-cell at all is now covered, hedged honestly.

A slide with no bounded cell falls back to the component's own word budget: whichever item runs furthest past `density.hard` is the best content-grounded guess. The copy says so — Case A reads "Fix Me," Case B reads "Likely fix." An oversized image, wide table, or long code block has no signal to drill into; the red ring alone fires there.

---

<!-- _class: closing -->

# The overlay is for you. The export isn't.

The Fix-Me tags and the red ring are the *authoring* signal. An export carries a calm "Content clipped" tag instead, because a slide that loses content should say so — and whichever marker you pick, the console names the clipped pages.
