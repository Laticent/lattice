---
marp: true
theme: indaco
paginate: true
header: "Lattice · header scope"
footer: "Board review"
---

<!-- _class: silent -->

`Feature demo · slide chrome`

# A slide's header stays on that slide.

Front matter sets the header, footer and page number for every slide. A slide comment sets its own slide only.

---

# Front matter sets every slide

- This slide shows the deck's header, footer and page number.
- They come from three lines at the top of the deck: `header:`, `footer:` and `paginate:`.

---

<!-- header: "Appendix A · this slide only" -->

# A plain header comment

- This slide carries `<!-- header: "Appendix A · this slide only" -->`.
- Its header reads "Appendix A · this slide only". Marp would carry it onto every later slide; Lattice does not.

---

# The next slide is back to the deck's header

- No comment here, so the header is the front matter's again.
- Nothing carried over from the slide before.

---

<!-- _footer: "Source: Q3 board pack" -->

# An underscore footer, as before

- `<!-- _footer: … -->` still sets this slide only.
- The plain spelling now means the same thing.

---

<!-- _class: no-header no-paginate -->

# Dropping the deck's chrome on one slide

- `_class: no-header no-paginate` hides the header and page number here.
- The footer stays, because only those two are named.

---

# And the deck's chrome is back

- Every later slide reads the front matter's header, footer and page number.

---

<!-- _class: silent -->

# Front matter for every slide; a comment for one.
