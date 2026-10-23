---
marp: true
theme: indaco
paginate: true
header: Brand review
footer: Confidential
logo: lattice
logo-finish: bottom-center accent-ink lg
---

<!-- _class: title -->

# One line styles the logo

`logo-finish: bottom-center accent-ink lg` seats it, colors it and sizes it. The footer text yields to a bottom-center logo.

---

## Light slide

- The mark takes the blend on a light canvas
- The header and the page number stay where they were

---

<!-- _class: dark -->

## Dark slide

- The same word resolves against the dark palette
- No per-mode setting to tune

---

<!-- _class: no-logo -->

## This slide hides it

- `_class: no-logo` removes the mark
- The footer text returns, because nothing sits in its band

---

<!-- _class: logo-ink -->

## One slide, another color

- `_class: logo-ink` evicts the deck's color word on this slide only
- Placement and size stay the deck's

---

## Change a word to move the brand

- `top-left` hides the running header
- `bottom-right` hides the page number and the rail
- `title` shows the mark on the cover only

---

<!-- _class: logo-brand -->

## Original colors, nothing behind them

- `_class: logo-brand` keeps the file's own colors
- No plate: a logo with a transparent background stays transparent over the slide

---

<!-- _class: logo-brand logo-plate -->

## A plate, when asked for

- `_class: logo-brand logo-plate` puts a soft plate behind the mark on this slide
- The deck line can ask for it everywhere: `logo-finish: plate`
- `_class: logo-no-plate` takes it back on one slide
