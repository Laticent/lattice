---
marp: true
theme: indaco
paginate: true
footer: "Laticent · Q3 board review · confidential"
---

<!-- _class: divider -->

`Section 01 · The frame`

# The footer is a real cell now

A running footer, a page number, and the section rail all share one
in-flow `.cell-footer` band — the stage above ends exactly where it begins.

---

## What changed

- one
- two
- three

The page number used to be a `::after` pseudo-element painted over the
slide. It is now a real `<span class="lat-pagination">` that lives in the
footer band beside the running footer text — content, not decoration.

---

<!-- _class: stats -->

`Metrics`

## The band holds its line

- 3
  - cells per frame
- 1
  - in-flow footer row
- 0
  - magic padding guesses

---

<!-- _class: divider -->

`Section 02 · Wayfinding`

# The rail docks in the band

The section dot-rail parks just left of the page number, so the two
wayfinding marks read as a single group at the right edge.

---

## Long body, bounded stage

- The stage cell clips at its own edge, so an over-stuffed body is walled
  above the footer band instead of bleeding through the page number.
- The footer's height *is* the reserve — no `--footer-reserve` guess.
- One visual contract across every migrated frame.

The footer text sits at the left, the rail and page number group at the
right, and nothing the body does can push into that band.

---

<!-- _class: footer-inset -->

## Lift it with `footer-inset`

- Hugging the bottom edge is the default — a board footer conventionally sits at
  the page edge.
- Add the `footer-inset` universal modifier to lift the band into the frame, so
  the bottom inset mirrors the top.

This slide carries `footer-inset`; the footer band sits higher, off the edge.

---

<!-- _class: closing -->

`Fin`

## One band, three marks
