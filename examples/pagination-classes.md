---
marp: true
theme: indaco
header: 'Q3 Board Review'
footer: 'Confidential · Lattice'
---

<!-- _class: title -->

`Feature demo · page numbers`

# Page numbers are a deck setting and a class

Every slide is numbered unless the deck or the slide says otherwise.

---

## Every slide is numbered by default.

- This deck's front matter has no `paginate:` line, and the slide still shows its number
- `paginate: false` in front matter is the one deck-wide off switch
- `paginate: no`, `off` and `0` mean off too

> Front matter numbers the deck.

---

<!-- _class: content no-pagination -->

## One slide drops its number with a class.

- This slide writes `<!-- _class: content no-pagination -->`, so it shows no number
- The slide after this one is numbered again
- Nothing a slide says carries onto the next one

> A class opts one slide out.

---

## A paginate comment does nothing.

- A slide that writes `<!-- paginate: false -->` still shows its number
- `lint:deck` flags the comment, and Export to Marp drops it
- Use the `no-pagination` class instead

> Page numbers are not a slide directive.

---

<!-- _class: content silent with-pagination -->

## with-pagination puts a number back.

- `silent` would drop the number with the rest of the chrome
- `with-pagination` wins over it, and over a component that opts out
- It works on a title or a closing slide too

> The slide's own class has the last word.

---

## Title and closing slides opt out in their manifest.

- The first and last slides of this deck show no number, with no line in the deck
- Their components declare `"chrome": { "pagination": false }`
- Export to Marp writes `<!-- _paginate: false -->` on each, so Marp agrees

> The component knows its own chrome.

---

<!-- _class: closing -->

# One rule

Front matter for the deck. A class for one slide.
