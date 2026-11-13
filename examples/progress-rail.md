---
marp: true
theme: indaco
paginate: true
header: "Lattice · Section rail"
footer: "Acme · Q3 board review"
progress-rail: on
---

<!-- _class: title -->

`Lattice · Feature deck`

# Where am I in this deck?

The section rail answers "which part", and the page number answers "how far".

---

<!-- _class: agenda -->

## Three parts, and the mark each one wears

1. What the rail means
2. Where it sits
3. How it looks

---

<!-- _class: divider -->
<!-- _header: '' -->

## What the rail means

---

## Each mark is one section of the deck

- The divider before this slide drew the marks larger, where the rail sits on this slide
- The footer repeats them small, with this section lit in the heading's ink
- The page number keeps its own column, so it is not read as one more mark and the rail never moves
- A deck needs three sections and fifteen slides before the rail draws on its own; this one says `progress-rail: on`

---

<!-- _class: divider light -->
<!-- _header: '' -->

## Where it sits

---

<!-- _class: progress-rail-center -->

## The rail can sit on the center line

- `progress-rail: center` moves it to the middle of the footer band
- The page number stays at the right edge
- The footer words keep the band's left half, and the rail holds the center on every slide

---

<!-- _class: progress-rail-edge -->

## Or stand upright on the right edge

- `progress-rail: edge` puts it in the right margin, at mid-height
- It leaves the footer band to the footer words and the page number
- One slide can move its own rail with `_class: progress-rail-edge`

---

<!-- _class: divider numbered -->
<!-- _header: '' -->

## How it looks

---

<!-- _class: progress-rail-bar -->

## A bar instead of dots

- `progress-rail: bar` draws one thin segment per section
- Past eight sections the rail turns into a bar by itself
- `progress-rail: off` hides the rail and the divider markers together

---

<!-- _class: topic -->

## Topics name their section

The eyebrow above says which section this topic belongs to, read from the divider.
