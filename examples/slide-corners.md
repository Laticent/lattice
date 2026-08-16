---
marp: true
size: 4K
theme: indaco
paginate: true
corners: rounded
header: "Lattice · The slide's corner"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _footer: "Title slide · title" -->

# The slide has a corner

`Lattice · corners: rounded`

One register, one token, and the brand bar comes with it.

---

<!-- _footer: "Content slide · content" -->

## What the register does

1. The engine owns the shape
   - `corners: rounded` in the deck's front matter, nowhere else
2. One rule owns how round
   - `section.corners-rounded`, and nothing downstream re-derives it
3. The deck decides, per deck
   - the same axis `theme:` and `color-mode:` already sit on

---

<!-- _class: cards-grid -->
<!-- _footer: "Card grid · cards-grid" -->

## Why a clip and not a radius

- The bar is a border image
  - and border images ignore `border-radius`
- The clip cuts the whole element
  - so the bar hugs the corner too
- Every edge placement follows
  - one property covers all four rails
- Nothing inside needs a rule
  - the section already clips its children

---

<!-- _class: divider -->

`Its rail rides the background`

## A divider rounds too

---

<!-- _class: corners-square -->
<!-- _footer: "Per-slide opt-out · corners-square" -->

## This slide opted out

1. `_class: corners-square`
   - a slide overrides the deck, the same way `_class: light` overrides a dark deck
2. The deck's token is evicted, not stacked
   - both rules land at one specificity, so leaving them side by side would let source order decide instead of the author

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _footer: "Closing slide · closing" -->

## Square is still the default

A deck that says nothing renders exactly as it did before this existed — and a rounded
corner only reads where the slide's surface differs from what sits behind it.
