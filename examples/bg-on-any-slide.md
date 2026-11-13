---
marp: true
theme: indaco
paginate: true
header: "Lattice · Slide backgrounds"
---

<!-- _class: title -->
<!-- _header: '' -->

# A background on any slide

`Fix · Slide backgrounds`

Add `bleed` to the slide, and its one picture fills it

---

<!-- _class: content dark bleed -->

![A figure by a lake under a low sun](sample:photo-wide.jpg)

`Full-bleed background`

## The photo is the slide's background.

<!-- On a `bleed` slide, the one picture alone on its line is the slide's background, cropped to fill it. Marp's old `![bg]` keyword is retired: `lint:deck --fix` writes this form. -->

---

<!-- _class: content dark bleed -->

![A lone figure on a wide shore at dusk](sample:photo-pano.jpg)

`Any picture`

## It covers the canvas, centered.

<!-- Pair a background with `dark` so the type reads in light ink. -->

---

<!-- _class: image -->

## Beside the text, use the image layout.

On an `image` slide the same picture sits next to the words; `image mirror` puts it on the left.

![A figure by a lake under a low sun](sample:photo-wide.jpg)

---

<!-- _class: content dark bleed -->

![A figure by a lake under a low sun](sample:photo-wide.jpg)

`Same in every export`

## Every export agrees.

<!-- The player embeds the picture, so the file you send still shows it. -->

---

<!-- _class: closing -->
<!-- _header: '' -->

`One renderer, one answer`

## A background is a background.

Write `![A name](photo.jpg)` and give the slide `bleed`, or `image` to set it beside the text.
