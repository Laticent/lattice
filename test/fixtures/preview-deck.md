---
marp: true
theme: indaco
size: hd
pagination: true
header: "Lattice · Test Fixture"
---

<!-- @meta{layout=title} -->

# Test fixture deck

`Used by integration tests · do not edit casually`

A minimal 3-slide deck for fast integration tests. Add slides only if a
new test needs them — keeping this small keeps the integration tier fast.

---

<!-- @meta{layout=cards-grid, footer=fixture · cards-grid} -->


## Three cards for selector tests.

- Card Alpha
  - First card body. The h2 above is the selector target for `h2:Three cards`.
- Card Beta
  - Second card body. Class on the section is `cards-grid` for `class:cards-grid`.
- Card Gamma
  - Third card body. Footer is "fixture · cards-grid" for `footer:fixture`.

---

<!-- @meta{layout=closing, footer=fixture · closing} -->


## Final slide of the fixture deck.

The closing slide is here so tests can verify multi-slide behavior
(slide count, last-slide reachability) without relying on the larger
gallery.
