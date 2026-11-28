---
marp: true
theme: carta
drawing: sketch
finish: atrium
pagination: true
---

# Slide One

Front-matter `drawing: sketch` should apply the `sketch` class here, and
`finish: atrium` should apply `finish finish-atrium` — the two compose.

---

<!-- @meta{layout=cards-grid} -->

## Slide Two

Per-slide `_class: cards-grid` should COMPOSE with the deck-wide `drawing:` and
`finish:` registers, not replace them — this section must carry `cards-grid`,
`sketch`, and `finish-atrium`.

- One
  - body
- Two
  - body

---

<!-- @meta{class=no-sketch} -->

## Slide Three

A per-slide `_class: no-sketch` opts THIS slide out of the deck-wide `mode:
sketch` (no `sketch` token here) — but the deck-wide `finish: atrium` backdrop
still applies.
