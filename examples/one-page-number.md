---
marp: true
theme: indaco
paginate: true
header: "Lattice · one page number"
footer: "The mark in the bottom-right corner is the same element on every slide of this deck"
---

<!-- _class: title -->

# One page number, one element

`Engine · frame chrome`

Every slide in this deck paginates, and every slide draws its number with the same node. That used to be false, and nothing on the slide said so.

---

<!-- _class: divider -->

`The defect`

## The number in the corner was two different marks, and the frame decided which.

---

<!-- _class: premise -->

## A frame's kind chose the node, and an author could not see the choice.

Two axes decided it: whether the frame keeps the deck's chrome, and therefore whether it has a footer row to put a number in. Eleven frames, split two against nine.

1. Root
   - Two frames, one footer cell.
   - A real element.
2. Sovereign
   - Nine frames, no footer cell.
   - A pseudo instead.
3. Geometry
   - Flex child, or positioned pseudo.
   - Which is this slide?
4. Surface
   - One rule cannot reach both.
   - Which rules died?

---

<!-- _class: split-panel -->

`This slide is a sovereign frame`

## The cost was paid in rules that looked right and did nothing.

No selector over a section's children can reach a pseudo. So a rule could name the page number, be committed, be current, and never paint.

- The split cover carried three arms for one mark
  - The footer-cell element, a bare element, and the pseudo — it could be any of them.
- The chart family's hero recolor was dead code
  - A chart slide emits a footer cell, so its pseudo was already retired.
- Suppression did not survive the theme packer
  - The packer strips generated content from a slide-own pseudo rule.

---

<!-- _class: list -->

## This slide is a root frame. Same corner, same size, same type.

- The number sits at the same inset here as on the two sovereign slides before it.
- Measured, not asserted: a browser reads the inset from each section's own box.
- Every frame kind has to return the same value, or the test fails.
- What changed is the node, not the picture.
- A pagination Tile mints the element on any paginated frame that has none.

---

<!-- _class: compare-prose -->

## Before and after, in one sentence each.

- Before
  - `span.lat-pagination` on two frames, `section::after` on nine. Nothing told an author which.
- After
  - `span.lat-pagination` on all eleven, same berth, one styling surface, one box model.

---

<!-- _class: list -->

## What a path that runs no Tile still does.

- The retirement rule asks whether the element is present, not what kind of frame this is.
- A render that mints none matches neither arm, keeps the pseudo, and still shows a number.
- Export-to-Marp is that path: Marp draws its own pseudo and runs no Lattice Tile.
- The rule this replaced could not be fail-safe — a footer cell is emitted by a transform too.

---

<!-- _class: closing -->

## One mark. An author can now predict it without reading the frame manifests.

`Issue 2206`
