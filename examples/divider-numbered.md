---
marp: true
theme: indaco
paginate: true
header: "Lattice · numbered bookends"
meta: "numbered · divider / closing section stamp"
---

<!-- _class: title silent -->

`Bookend modifier · numbered`

# The section stamp, back on the canvas

`numbered` stamps a running section index on a divider. It wrote that numeral onto `section::after` — the pseudo the engine reserves for the page number — and two separate owners took it back. It now rides the slide heading, at the top-left edge.

---

<!-- _class: divider silent numbered -->

`divider silent numbered`

## This is the slide that rendered nothing.

---

<!-- _class: content -->

`Defect · the pack`

## The browser path stripped the counter

`packTheme` comments out every `content` on a slide's own `::after` that isn't the pagination attribute — the guard that stops a theme clobbering the page number.

- The stamp survived in the emulator PDF
  - The CLI export path does not pack, so the counter stayed live and the numeral drew.
- The stamp vanished in the browser
  - The docs Playground, the Studio and `lib/runtime` all load the packed stylesheet, where the declaration came out as a comment.

---

<!-- _class: content -->

`Defect · silent`

## `silent` nulled the same pseudo

`silent` suppresses the page number with `section.silent.silent::after { content: none }`, doubled to `(0,2,2)`. The stamp's selector scored `(0,2,2)` too.

- A tie goes to source order
  - `base.variants.css` loads after `base.modifiers.css`, so `content: none` won and the numeral never generated a box.
- Every shipped sample hit it
  - `divider.docs.md`, the manifest and `divider.gallery.md` all read `divider silent numbered` — precisely the losing pair.

---

<!-- _class: divider numbered -->

`divider numbered`

## The dark divider counts its own series.

---

<!-- _class: divider light numbered -->

`divider light numbered`

## The light divider continues the same count.

---

<!-- _class: content -->

`The fix · carrier`

## Move the carrier, not the geometry

The numeral now rides `section.divider.numbered :is(h1, h2)::after` — a selector the pagination mask cannot cross, sharing no pseudo with `silent`.

- The corner did not move
  - `position: absolute` still resolves against the section, which every slide sets to `relative`, so `top` and `right` measure from the same slide corner.
- The heading is undisturbed
  - An absolutely positioned pseudo is out of flow, so `text-wrap: balance` and the bookend measure are unaffected.
- The page number came back
  - `numbered` no longer eats the pagination pseudo, so this slide shows both its stamp and its page number.

---

<!-- _class: content -->

`The fix · ink`

## A section marker is content, so ink it to be read

Drawing again exposed a second defect: the numeral sat on the 12% decoration rung under an `opacity` — 1.4:1.

- The rung was wrong, not the value
  - The ramp's rule is that text takes `primary` or `secondary`; `ghost` draws lines. The stamp now takes the same rungs the eyebrow beside it uses.
- The `opacity` is gone, not re-tuned
  - A wash steps ink and backdrop down together, by whatever headroom each already had.
- Measured, not asserted
  - 5.05:1 to 11.79:1 across the shipped palettes.

---

<!-- _class: content -->

`The fix · scope`

## One counter, dividers only

Three counters used to run in parallel — `divider`, `divider light` and `closing` each restarting at 01. A closing that announces itself as section 01 is a number telling the room nothing.

- One series
  - `divider` and `divider light` share `lat-divider`, so mixing them never restarts the count.
- No bookends
  - `closing` and `title` do not take the modifier. A bookend is not a section.
- The header steps aside
  - A numbered divider suppresses its running header: the stamp takes that corner, and two labels stacked there is not a layout.

---

<!-- _class: closing -->

## The closing carries no stamp, by design.
