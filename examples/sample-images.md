---
marp: true
theme: indaco
pagination: true
header: 'Sample images · one folder, every surface'
logo: sample:logo-acme-mark.svg
---

<!-- @meta{layout=title, header="", footer=""} -->



# Sample images, one folder

`Feature demo · lib/samples`

Every picture in this deck is named `sample:<file>`. It resolves the same way in the CLI, the Playground and the Studio.

---

<!-- @meta{layout=image} -->

`Image slide`

## A photo named sample:photo-wide.svg.

The image layout reads the photo's shape from the file in `lib/samples/`, so the composition matches what the Studio previews.

![A figure by a lake under a low sun](sample:photo-wide.svg)

---

<!-- @meta{layout=image, class=split} -->

`Raster sample`

## The JPEG twin takes the same path.

`sample:photo-tall.jpg` is a real raster photo, so a deck can test the JPEG route without bringing its own file.

![A figure before violet hills and a pale sun](sample:photo-tall.jpg)

---

<!-- @meta{layout=team-profile} -->

`Team profile`

## Each portrait is a sample, not a placeholder.

- Ada Okafor
  - ![](sample:portrait-ada.svg)
  - `Executive Sponsor`
  - Clears blockers above the program.
- Marcus Vale
  - ![](sample:portrait-marcus.svg)
  - `Program Director`
  - Runs the weekly cadence.
- Priya Raman
  - ![](sample:portrait-priya.svg)
  - `Head of Delivery`
  - Staffs the pods; holds the dates.

---

<!-- @meta{layout=logo-wall} -->

`Logo wall`

## The Add slide template now shows real marks.

- ![Acme](sample:logo-acme.svg)
  - Acme
  - `{Series B}`
- ![Globex](sample:logo-globex.svg)
  - Globex
  - `{Enterprise}`
- ![Vantage](sample:logo-vantage.svg)
  - Vantage
  - `{Public}`
- ![Umbra](sample:logo-umbra.svg)
  - Umbra
  - `{Series C}`

---

<!-- @meta{layout=video, class=companion} -->

`Video poster`

## The poster resolves like every other picture.

Ninety seconds, unscripted: signup to a published deck without touching support.

`@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", poster="sample:video-poster.svg"}`

---

<!-- @meta{layout=closing, header="", footer=""} -->



# One folder: lib/samples/

`sample:<file>`

The deck logo in the corner is `sample:logo-acme-mark.svg`, set once in the front matter.
