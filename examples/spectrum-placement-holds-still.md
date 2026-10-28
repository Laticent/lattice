---
marp: true
theme: indaco
paginate: true
header: "Lattice · spectrum placement"
footer: "Placement never moves the slide"
---

<!-- The spectrum bar sits in the slide's edge, so choosing `top`, `left`, `right`, `bottom` or no bar
     must not move anything else. Each slide below is the same `content` slide with a different
     `spectrum-edge-*` class (top is the default and carries none). Flip through them: the heading,
     list, header, footer and page number hold still, light and dark.
     `npm run check:edge-shift` measures the same thing across every component. -->

<!-- _class: content -->

`Bar: top`

## A bar on top is the default

- The heading, this list, the header, the footer and the page number sit in the same place
- Flip between the slides: only the bar moves
- Each slide here differs from its neighbor by one class

---

<!-- _class: content spectrum-edge-left -->

`Bar: left`

## A bar on the left reads as a rail

- The heading, this list, the header, the footer and the page number sit in the same place
- Flip between the slides: only the bar moves
- Each slide here differs from its neighbor by one class

---

<!-- _class: content spectrum-edge-right -->

`Bar: right`

## A bar on the right mirrors it

- The heading, this list, the header, the footer and the page number sit in the same place
- Flip between the slides: only the bar moves
- Each slide here differs from its neighbor by one class

---

<!-- _class: content spectrum-edge-bottom -->

`Bar: bottom`

## A bar on the bottom reads as a baseline

- The heading, this list, the header, the footer and the page number sit in the same place
- Flip between the slides: only the bar moves
- Each slide here differs from its neighbor by one class

---

<!-- _class: content spectrum-edge-off -->

`Bar: none`

## No bar at all

- The heading, this list, the header, the footer and the page number sit in the same place
- Flip between the slides: only the bar moves
- Each slide here differs from its neighbor by one class

---

<!-- _class: content dark -->

`Bar: top · dark`

## A bar on top is the default (dark)

- The heading, this list, the header, the footer and the page number sit in the same place
- Flip between the slides: only the bar moves
- Each slide here differs from its neighbor by one class

---

<!-- _class: content dark spectrum-edge-left -->

`Bar: left · dark`

## A bar on the left reads as a rail (dark)

- The heading, this list, the header, the footer and the page number sit in the same place
- Flip between the slides: only the bar moves
- Each slide here differs from its neighbor by one class

---

<!-- _class: content dark spectrum-edge-bottom -->

`Bar: bottom · dark`

## A bar on the bottom reads as a baseline (dark)

- The heading, this list, the header, the footer and the page number sit in the same place
- Flip between the slides: only the bar moves
- Each slide here differs from its neighbor by one class
