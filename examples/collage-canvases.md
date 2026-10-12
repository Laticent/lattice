---
marp: true
theme: indaco
size: standard
paginate: true
header: "Lattice · collage"
footer: "Sample photographs from lib/samples"
---

<!-- _class: title silent -->

`Feature demo · imagery`

# A bleed collage packs for the slide it sits on.

This deck is 4:3. The packer reads the canvas, so edge-to-edge photos keep their shape.

---

<!-- _class: collage bleed -->

`bleed · 4:3`

## Four photos fill a 4:3 slide.

`Packed for the real shape`

The same four photos crop a third of each picture if the packer assumes a wide slide. On this slide each loses a few percent.

- ![Tall portrait](sample:photo-tall.jpg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)

---

<!-- _class: collage bleed -->

`bleed · five photos`

## Five photos, one slide, no bands.

`Free order`

The layout changes with the count, and the grid still reaches all four edges.

- ![Tall portrait](sample:photo-tall.jpg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)
- ![Narrow column](sample:photo-column.svg)

---

<!-- _class: collage bleed -->

`bleed · hero`

## `hero` still makes one photo the largest.

`The first photo leads`

A hero keeps the largest tile while the packer closes the slide.

- ![Wide landscape](sample:photo-wide.jpg) `hero`
- ![Tall portrait](sample:photo-tall.jpg)
- ![Square](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)

---

<!-- _class: collage -->

`The default`

## Without bleed the text keeps its column.

`Beside a 4:3 slide`

The photos pack beside the text with no cropping. Only a bleed collage fills the slide.

- ![Tall portrait](sample:photo-tall.jpg)
- ![Wide landscape](sample:photo-wide.jpg)
- ![Square](sample:photo-square.jpg)
- ![Panorama](sample:photo-pano.jpg)

---

<!-- _class: collage bleed ordered -->

`bleed · ordered`

## `ordered` keeps the written order.

`Left to right, top to bottom`

The sequence stays as written even when the slide is edge to edge.

- ![First: tall](sample:photo-tall.jpg)
- ![Second: wide](sample:photo-wide.jpg)
- ![Third: square](sample:photo-square.jpg)
- ![Fourth: panorama](sample:photo-pano.jpg)
