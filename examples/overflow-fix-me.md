---
marp: true
theme: indaco
paginate: true
header: "Lattice · overflow cause highlighting"
---

<!-- _class: title silent -->

`Feature demo · Fix-Me overlay`

# See what's overflowing, not just that it is.

The existing red "Overflows" ring names the slide. This adds a yellow tag
that names the specific element responsible — "Fix Me" when the cause can
be proven, "Likely fix" when it's the best available guess.

---

<!-- _class: split-compare -->

`Decision Required`

## A deliberately over-stuffed comparison.

This slide exists to demonstrate the Fix-Me overlay — open it in a live
preview (Playground, Drawing Board, Studio, or the VS Code marp preview) to
see the red ring and the yellow tag land on "Preferred option" alone, not
"Alternative option" or the whole panel. A static export shows the calm
reader form instead: a "Content clipped" tag, no ring and no Fix-Me tag.
Export with `--overflow-marker=author` to get the full signal here too.

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

A bounded content cell (`.cell-stage`, `.panel-right`, `.compare-right`) that overflows genuinely clipped its own content — it never pushed a neighbor, so highlighting it is a geometric fact. Where the cell holds a repeated collection, the tag narrows to whichever item is a real content outlier.

---

<!-- _class: timeline-list -->

`Case B · no clip-cell in play`

## Which milestone actually blew the budget?

`timeline-list` is never wrapped in a bounded cell, so a clip-cell probe
finds nothing here even though this slide genuinely overflows — the exact
gap Case B closes. Open this in a live preview: the yellow tag reads
"Likely fix," not "Fix Me," because a word count past budget is the best
available guess, never a geometric certainty.

1. `Q1` Kickoff `on-track`
   - One clause says what changed here.
2. `Q2` The scope quietly tripled after every stakeholder demanded their own
   pet feature get bolted onto the roadmap, and nobody on the steering
   committee was willing to say no to any of it, so the plan just kept
   absorbing more work every single week
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

# The overlay is for you. The exported deck speaks to its reader.

The Fix-Me tags and the red ring are the AUTHORING signal, and an export
does not carry them by default. What it does carry is a small "Content
clipped" tag, because a slide that loses content should say so rather than
look finished. `--overflow-marker` decides: `author` ships the full signal,
`off` ships none. Whichever you pick, the console names the clipped pages.
