---
marp: true
theme: indaco
size: story
paginate: true
header: "Lattice · slide output"
footer: "Three decks that rendered wrong"
lenses:
  footer: { label: "Footer view", base: none }
---

<!-- _class: title silent -->

# Every slide you write, as you wrote it

`Release audit · November 2026`

*Three engine fixes: a split title that leaked bold, a close tag that merged two slides, and a nested key that took over the footer.*

---

<!-- _class: split-panel -->

`Fix 1 · split titles`

## A bold number in a point title stays inside its point.

At this size the panel splits into a cover and one page per point. Each point below starts with its own bold number.

- **15** stable types
  - Flowchart, sequence, class and state draw with full theme control.
- **11** experimental types
  - Sankey, block and packet may still change their syntax.
- **6** with named variables
  - The rest inherit their colors from these six.

---

<!-- _class: content -->

`Fix 1 · the slide after`

## This slide is set in the regular weight.

Before the fix, the split page emitted `<strong>6</span>`, an open bold tag the browser carried into every later slide. This paragraph rendered bold, and the export counted fewer slides than the deck held.

---

<!-- _class: content -->

`Fix 2 · a close tag with a space`

## A legal close tag ends the block.

The block below closes as `</pre >`, with a space before the bracket. Browsers accept that, and the slide separator after it now starts a new slide.

<pre>
revenue   $26M
margin    44%
</pre >

---

<!-- _class: content -->

`Fix 2 · the next slide`

## This slide used to vanish into the one before.

Before the fix, the parser read the separator above as text inside the block, so this heading and paragraph printed on the previous page.

---

<!-- _class: list -->

`Fix 3 · front matter`

## The footer below is the deck's own.

- This deck's front matter names a reader view called `footer` under `lenses:`.
- The engine used to read that nested key as the deck's `footer:` directive.
- Every page then printed the view's settings where the footer belongs.
- Only **top-level** keys are directives now, so the footer reads as written.

---

<!-- _class: cards-grid -->

## Spaces beside inline marks are kept.

- In a list card
  - A `lenses:` block names each view, and the **class** is the contract.
- In a grid card
  - Inline code such as `paginate` keeps its space on both sides.
- In bold
  - So the **class** is the contract, not the register.
- In italics
  - Unknown values fall to the *running* default, never to silence.

---

<!-- _class: list-steps -->

## Check a deck after these fixes.

1. Render it at a tall size such as `story` and count the pages.
2. Look at the slide after any **bold** split title.
3. Search the HTML for `data-footer` and read what it holds.

---

<!-- _class: closing -->

# The deck renders as written.

`Release audit · fixes 1 to 3`
