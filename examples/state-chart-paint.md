---
marp: true
theme: indaco
size: 16:9
pagination: true
header: "Lattice · State chart paint"
---

<!-- @meta{layout=title} -->

`Lattice · Feature deck`

# Paint a state machine without leaving the palette.

Status words, a heavy main path, line patterns and palette slots — every one a word, and every one in the key.

---

<!-- @meta{layout=divider, class=subsection light} -->

## The vocabulary

A status word or a slot `c1`…`c8` after a state; `=>` for the main path, `dashed` or `dotted` after a line's target.

---

<!-- @meta{layout=state-chart, class=lr} -->

`Plain`

## The default reads as one system.

Every line takes the connector color; every state is a neutral tile.

- Draft `start`
  - -submit-> Review
- Review
  - -approve-> Published
  - -reject-> Draft
- Published `end`

*The baseline the next slides paint — same machine.*

---

<!-- @meta{layout=state-chart, class=lr} -->

`The main path`

## A heavy arrow carries the happy path.

`=>` for the path the machine is meant to take; the key names it.

- Draft `start`
  - =submit=> Review
- Review `on-track`
  - =approve=> Published
  - -reject-> Draft `dashed`
- Published `end`

`[{"=>", Happy path}, {dashed, Sent back}]`

*Same machine — a word on each line that carries meaning.*

---

<!-- @meta{layout=state-chart, class=lr} -->

`Outcomes`

## A status paints the tile.

The end states carry their outcome, and words that paint alike share one key entry.

- Intake `start`
  - -triage-> Triage
- Triage `at-risk`
  - =accept=> Accepted
  - -refuse-> Refused
- Accepted `done` `end`
- Refused `fail` `end`

---

<!-- @meta{layout=state-chart} -->

`Slots`

## A slot names a palette color, not a hue.

`c1` on a state, `c2` on a composite; the key shows a composite's slot by its name.

- Queued `start` `c1`
  - -claim-> Workers
- Workers `c2`
  - Running
    - -finish-> Done
    - -crash-> Queued `dotted`
  - Retrying
    - -> Running
- Done `end`

*A slot re-themes with the palette: no color is written anywhere.*
