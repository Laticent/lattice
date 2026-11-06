---
theme: indaco
size: 16:9
paginate: true
header: "Lattice · Hidden slides"
---

<!-- _class: title -->

# Keep a slide without showing it.

`Lattice · Feature deck`

One line at the top of a slide hides it from Present and every export.

---

<!-- _class: divider -->

`Section 01`

## How hiding works

---

## A hidden slide stays in the deck

- It keeps its place in the source and in the editor
- Present skips it, and every export leaves it out
- Its notes and its review comments leave with it
- Page numbers count only the slides that show

<!-- This deck has eight slides. Two are hidden, so the PDF has six pages, numbered without a gap. -->

---

<!-- hide -->

## Backup: the full cost model

This slide is hidden. If you can read it in the exported PDF, hiding is broken.

---

## Write one line to hide a slide

```markdown
<!-- hide -->
## Backup: the full cost model
```

`<!-- _hide -->` and `<!-- _hide: true -->` do the same. `<!-- _hide: false -->` shows the slide again.

---

<!-- _hide: true -->
<!-- _class: divider -->

`Section 02`

## Appendix

---

## The numbers skip nothing

- The slide before this one was a hidden divider, so it opens no section
- This slide reads page 5 of 6 in the PDF, and page 7 in the editor
- In the Studio, the slide menu has Hide slide and Show slide

---

<!-- _class: closing -->

## Hide a slide, keep the deck.
