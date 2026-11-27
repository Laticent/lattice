---
marp: true
theme: indaco
pagination: true
header: "Lattice · running header"
---

<!-- @meta{layout=cards-grid, class=three claim-hero} -->

## The running header steps aside at hero.

- Header
  - The deck's `header:` is a band, so `claim-hero` drops it with the footer.
- Heading
  - Nothing prints over the heading, and no `_header: ''` is needed.
- Page number
  - The page number stays, as before.

---

<!-- @meta{layout=cards-grid, class=three} -->

## A standard slide keeps its header.

- Header
  - Without `claim-hero` the running header still shows above the heading.
- Footer
  - The footer band is unchanged.
- Page number
  - Unchanged.
