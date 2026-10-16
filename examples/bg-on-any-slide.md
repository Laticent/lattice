---
marp: true
theme: indaco
paginate: true
header: "Lattice · Slide backgrounds"
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _paginate: false -->

# A background on any slide

`Fix · Slide backgrounds`

The CLI now draws `![bg]` the way the Studio always has

---

<!-- _class: content dark -->

![bg](sample:photo-wide.jpg)

`Full-bleed background`

## The photo is the slide's background.

<!-- A ![bg] on a slide that is not `image` is the slide's own background, cropped to fill it. The CLI used to drop it: the picture drew nothing in the PDF, the HTML or the player. -->

---

<!-- _class: content dark -->

![bg](sample:photo-pano.jpg)

`Any picture`

## It covers the canvas, centered.

<!-- Pair a background with `dark` so the type reads in light ink. -->

---

<!-- _class: image -->

## Beside the text, use the image layout.

`![bg right](…)` on an `image` slide sets the picture next to the words. On any other slide, `lint:deck` now warns that `right` does nothing.

![bg right](sample:photo-wide.jpg)

---

<!-- _class: content dark -->

![bg](sample:photo-wide.jpg)

`Same in every export`

## Every export agrees.

<!-- The player embeds the picture, so the file you send still shows it. -->

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _paginate: false -->

`One renderer, one answer`

## A background is a background.

Write `![bg]` on any slide, or use `image` to set it beside the text.
