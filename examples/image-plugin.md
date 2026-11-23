---
marp: true
theme: indaco
pagination: true
header: "Lattice · Images"
---

<!-- @meta{layout=title, header=""} -->


# Pictures you can set like the deck

`Feature · The image plugin`

One record describes the picture; the slide decides where it goes

---

<!-- @meta{layout=image} -->

`Seat · the image slide`

## The record becomes the layout's photo.

An `image` slide makes the picture its panel and reads the photo's shape. The finish here is `nimbus`, the deck's own blooms.

`@image{media/canoe.jpg, title="The lake at dawn", description="A canoe on a still lake, mountains behind.", nimbus}`

---

<!-- @meta{layout=content} -->

`Frame · mat`

## A gallery mat, with the title shown.

`@image{media/canoe.jpg, title="The lake at dawn", frame=mat, show=title}`

---

<!-- @meta{layout=content} -->

`Frame · keyline · duotone`

## One accent hairline, and the picture in the accent.

`@image{media/mug.jpg, title="The red mug", keyline, duotone, sm}`

---

<!-- @meta{layout=content} -->

`Frame · device`

## A screen bezel for product shots.

`@image{media/canoe.jpg, title="On the device", device, lg}`

---

<!-- @meta{layout=content} -->

`Frame · corners · grayscale`

## Registration brackets, and the picture in grays.

`@image{media/mug.jpg, title="In grays", corners, grayscale}`

---

<!-- @meta{layout=content, class=dark} -->

`Frame · float · halo · dark`

## Lifted on a shadow that stays dark on a dark theme.

`@image{media/canoe.jpg, title="Lifted", float, halo}`

---

<!-- @meta{layout=content, class=dark bleed} -->

`Seat · bleed · meridian`

## Or the slide's own background.

`@image{media/canoe.jpg, description="The lake, behind the words.", meridian=40}`

---

<!-- @meta{layout=content} -->

`Shared · a clip`

## A clip takes the same frames and finishes.

`>{"https://youtu.be/dQw4w9WgXcQ", title="The 90-second tour", poster=media/canoe.jpg, device, nimbus}`
