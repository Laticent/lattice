---
marp: true
theme: indaco
spectrum: solid
pagination: true
header: "Lattice · white-label"
---

<!-- @note{The `spectrum:` register white-labels the brand bar — the rainbow gradient every
     slide carries on its top border (and a divider carries as a left rail). This deck
     runs `spectrum: solid`, so the whole bar is the theme's single --accent instead of
     the Lattice rainbow. Set --accent to a client's brand color and every bar follows.
     `spectrum: off` (shown mid-deck via a per-slide override) removes the bar entirely;
     omitting the key is the rainbow default.} -->

<!-- @meta{layout=title, class=pinned} -->

`A feature demo`

# One bar, the client's color

`spectrum: solid` repaints the brand bar in the theme's single `--accent` — no
Lattice rainbow. Set the accent to a client's brand and the whole deck follows.

---

<!-- @meta{layout=content} -->

## The bar above is solid, not a rainbow

Every section paints the brand bar from two tokens — `--spectrum-bar` (the top border)
and `--spectrum-bar-vertical` (a divider's left rail). The `spectrum:` register sets
the style they read, so one setting recolors every place the bar appears.

---

<!-- @meta{layout=divider} -->

# The divider rail follows too

---

<!-- @meta{layout=content, class=no-spectrum} -->

## `spectrum: off` — a clean edge

A per-slide `no-spectrum` overrides the deck: no bar at all, for a slide (or a whole
deck) that wants nothing at the top. The rest of this deck keeps the solid accent bar.

---

<!-- @meta{layout=cards-grid} -->

## Three values, one register

- `on`
  - The Lattice rainbow — the default. Omit the key entirely.
- `off`
  - No brand bar. A clean top edge and no divider rail.
- `solid`
  - A single `--accent` bar — the white-label seam for a client's brand color.

---

<!-- @meta{layout=content} -->

## Where it lives

`spectrum:` is a deck front-matter register — a sibling of `finish:` / `drawing:` /
`stamp-shape:` / `tone:`. A typo is caught as `unknown-spectrum`; a per-slide `spectrum-*`
token overrides the deck. It composes with `accent` and `tone: edge`, the per-slide
brand-bar recolors.

---

<!-- @meta{layout=closing, class=revised} -->

# Your bar, your brand

`spectrum: off | solid` in front matter — the rainbow is just the default.
