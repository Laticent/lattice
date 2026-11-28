---
marp: true
theme: indaco
pagination: true
header: "Lattice · per-slide finishes"
---

<!-- @meta{layout=title} -->

# Finishes, per slide

`No deck-wide finish: — each slide sets its own`

Write one class. The finish paints on that slide alone.

---

<!-- @meta{class=statement finish-atrium} -->

## One class activates the whole finish.

`class=finish-atrium` — no deck-wide `finish:`, no second `finish` token. The backdrop paints on this slide alone.

---

<!-- @meta{class=statement finish-halo} -->

## The compositor is implied.

A `finish-<name>` class carries the whole finish: the engine adds the `finish` layer for you, so the backdrop paints on this slide only.

---

<!-- @meta{class=statement finish-gallery dark} -->

## Same on a dark canvas.

`class=finish-gallery dark` — the finish is palette-blind, so it tracks light and dark from the one class.

---

<!-- @meta{class=statement finish-meridian} -->

## Mix finishes across a deck.

Each slide can wear a different finish — atrium, halo, gallery, meridian — because the finish is a per-slide class, not a deck-wide switch.

---

<!-- @meta{layout=title} -->

# Independent by slide

`built-in presets AND your saved finishes`
