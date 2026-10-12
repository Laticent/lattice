---
marp: true
theme: indaco
paginate: true
header: "Lattice · collage"
footer: "Sample photographs from lib/samples"
---

<!-- _class: title silent -->

`Feature demo · imagery`

# Four to six photos, one frame.

The packer reads each photo's shape and fits them edge to edge with no cropping.

---

<!-- _class: collage -->

`The default`

## Five shapes share one frame without a crop.

`Free order: the packer picks the arrangement`

Tall, wide, square, panorama and column photos pack into one flush grid. Hover a photo on a live surface to focus it.

- ![Tall portrait](sample:photo-tall.jpg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)
- ![Narrow column](sample:photo-column.svg)

---

<!-- _class: collage -->

`Photo hints`

## `hero` makes one photo the largest tile.

`A trailing code span after a photo sets its hint`

The first photo is marked `hero`. A focal word such as `top` keeps that part of a photo in view, and a ratio such as `3:2` sizes a photo the build cannot measure.

- ![Tall portrait](sample:photo-tall.jpg) `hero`
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square](sample:photo-square.jpg) `top`
- ![Panorama](sample:photo-pano.jpg)

---

<!-- _class: collage ordered -->

`ordered`

## The photos keep the order you wrote.

`Left to right, top to bottom`

Use `ordered` when the sequence matters, such as a process shot from first step to last.

- ![First: tall](sample:photo-tall.jpg)
- ![Second: wide](sample:photo-wide.jpg)
- ![Third: square](sample:photo-square.jpg)
- ![Fourth: panorama](sample:photo-pano.jpg)
- ![Fifth: column](sample:photo-column.svg)
- ![Sixth: square](sample:photo-square.svg)

---

<!-- _class: collage fill -->

`fill`

## `fill` allows up to eight percent crop.

`Closes the last of the empty space`

With four photos the tightest fit can leave a margin. `fill` stretches the grid a little and lets the cover crop absorb it.

- ![Square one](sample:photo-square.jpg)
- ![Square two](sample:photo-square.svg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Tall portrait](sample:photo-tall.jpg)

---

<!-- _class: collage above -->

`above`

## The text sits above the photos.

`Best when the photos are wide`

Use `above` when the description is short and the photos are mostly landscape.

- ![Wide landscape](sample:photo-wide.jpg)
- ![Panorama](sample:photo-pano.jpg)
- ![Wide landscape svg](sample:photo-wide.svg)
- ![Panorama svg](sample:photo-pano.svg)

---

<!-- _class: collage mirror -->

`mirror`

## The photos on the left, the text on the right.

`Flips the composition`

`mirror` is the same modifier `image` uses: it changes the side without changing the layout.

- ![Tall portrait](sample:photo-tall.jpg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)
- ![Narrow column](sample:photo-column.svg)

---

<!-- _class: collage bleed -->

`bleed`

## The photos run edge to edge.

`The title rides a translucent card`

- ![Tall portrait](sample:photo-tall.jpg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)

---

<!-- _class: collage -->
<!-- _focus: item 3 -->

`_focus`

## `_focus: item 3` dims the other photos in print.

`The hover state, kept in the PDF`

A presenter who wants the hover moment in a PDF names the photo. The count follows the order you wrote, even when the packer rearranged the picture.

- ![Tall portrait](sample:photo-tall.jpg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square, the focused photo](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)
- ![Narrow column](sample:photo-column.svg)
