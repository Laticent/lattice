---
marp: true
theme: indaco
spectrum: duo
pagination: true
header: "Lattice · spectrum overrides"
---

<!-- @note{The deck sets `spectrum: duo`, so every slide carries the blue-to-green bar. A slide that
     makes its own explicit choice -- `accent`, or a semantic tone with `tone-edge` -- keeps its
     own bar, as it does in a default-rainbow deck.} -->

<!-- @meta{layout=title, class=silent} -->

`A fix demo`

# The deck's spectrum, and the slide's own say

`spectrum: duo` is the deck-wide default. An explicit per-slide bar wins over it.

---

<!-- @meta{layout=content} -->

## A plain slide carries the deck's duo bar

- Nothing on this slide asks for another bar.
- The gradient above is the deck's style.

---

<!-- @meta{layout=content, class=accent} -->

## An accent slide keeps its single stripe

- `accent` signals "this is the point".
- The bar above is the solid accent, not the duo gradient.

---

<!-- @meta{layout=content, class=tone-pass tone-edge} -->

## A pass keeps its green

- `tone-pass tone-edge` recolors the bar with the tone.

---

<!-- @meta{layout=content, class=tone-fail tone-edge} -->

## A fail keeps its red

- Status is information. A gradient cannot say "fail".

---

<!-- @meta{layout=content, class=tone-edge} -->

## A tone-edge with no tone keeps the duo bar

- With no semantic tone there is nothing to recolor, so the deck's style stays.
