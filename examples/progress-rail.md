---
marp: true
theme: indaco
paginate: true
header: "Lattice · Section rail"
footer: "Acme · Q3 board review"
---

<!-- _class: title -->

`Lattice · Feature deck`

# One rail, one line of front matter

The section rail says which part of the deck you are in, and `progress-rail:` says where it sits and how it looks.

---

<!-- _class: divider -->
<!-- _header: '' -->

`Section 01`

## What the rail means

---

## Each mark is one section of the deck

- The deck has three dividers, so the rail has three marks
- The lit mark is the section this slide sits in
- A hairline sets the page number apart, so it is not read as one more mark
- A deck with one divider draws no rail, because a scale of one says nothing

---

<!-- _class: divider -->
<!-- _header: '' -->

`Section 02`

## Where it sits

---

<!-- _class: progress-rail-center -->

## The rail can sit on the center line

- `progress-rail: center` moves it to the middle of the footer band
- The page number stays at the right edge
- A long footer line ends in an ellipsis before the rail

---

<!-- _class: progress-rail-edge -->

## Or stand upright on the right edge

- `progress-rail: edge` puts it in the right margin, at mid-height
- It leaves the footer band to the footer words and the page number
- One slide can move its own rail with `_class: progress-rail-edge`

---

<!-- _class: divider -->
<!-- _header: '' -->

`Section 03`

## How it looks

---

<!-- _class: progress-rail-bar -->

## A bar instead of dots

- `progress-rail: bar` draws one thin segment per section
- Every segment is the same length, and the lit one is filled
- The lit mark uses the heading's ink, as the topic track does

---

<!-- _class: progress-rail-edge progress-rail-bar -->

## Both words on one line

- `progress-rail: edge bar` sets placement and style together
- `progress-rail: off` hides the rail on every slide
- The Studio completes each word, and the Deck Inspector sets them under Chrome
