---
marp: true
theme: indaco
paginate: true
header: "Lattice · Reading a picture"
---

<!-- _class: title -->
<!-- _header: '' -->

# A turned photo lands the way the browser paints it

`Fix · one header reader`

Three pictures the old readers got wrong, and one they always got right

---

<!-- _class: image -->

`Exif after the frame header`

## The mug is stored on its side and turned back upright.

Its turn sits after the frame header, where every engine still reads it. The layout now sizes it as the wide photo it is, so the composition follows the picture you see.

![The red mug](media/mug-exif-after-frame.jpg)

---

<!-- _class: content -->

`Late Exif · in the PDF`

## The same file, drawn in the page, stays upright in the PDF.

`@image{media/mug-exif-after-frame.jpg, title="The red mug", sm}`

The PDF writer embeds the file once and draws it through its turn, so it lands upright without a whole-slide photo.

---

<!-- _class: image -->

`PNG turned by eXIf`

## The canoe is a PNG that Chromium turns, and the layout now agrees.

The picture is stored a quarter turn round. Chromium and Firefox apply its rotation, so the layout reads it as wide.

![A canoe on a still lake](media/canoe-turned.png)

---

<!-- _class: content -->

`Turned PNG · in the PDF`

## In the PDF it is no longer stretched across the turned box.

`@image{media/canoe-turned.png, title="A canoe on a still lake", sm}`

The writer used to embed the PNG's stored pixels into the box the browser had turned. It now draws them through the turn.

---

<!-- _class: image -->

`AVIF`

## An AVIF photo now gets its shape read like any JPEG.

The header reader finds the primary picture's size, so the layout picks a composition instead of falling back to its plainest one.

![A canoe on a still lake](media/canoe.avif)

---

<!-- _class: content -->

`Control · an ordinary JPEG`

## A plain photo exports exactly as it did before.

`@image{media/canoe.jpg, title="A canoe on a still lake", sm}`

Every gallery and photo deck kept its bytes; only the files above change.

---

<!-- _class: closing -->
<!-- _header: '' -->

## Each picture lands as painted.

`Fix · one header reader`

One reader now settles every turn, and the exports follow the browser.
