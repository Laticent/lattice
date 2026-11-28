---
marp: true
theme: indaco
pagination: true
header: "Lattice · Restore tokens"
spectrum: solid left
card-spectrum: solid top
heading-rule: accent
eyebrow: dot
headline-align: center
---

<!-- @meta{layout=title, class=silent} -->

`Accent registers · restore tokens`

# Back to the default, one slide at a time

This deck sets a non-default value on six accent registers. Each slide after the next uses one restore token to put a single register back on its default.

---

<!-- @meta{layout=content} -->

`The deck's own look`

## Every slide follows the deck until it says otherwise

This slide carries no tokens of its own, so it shows the deck's settings: a solid bar on the left edge, an accent rule under the heading, a dot before this label, and a centered heading.

---

<!-- @meta{layout=content, class=spectrum-top} -->

`spectrum-top`

## The bar goes back on top

A deck that writes `spectrum: left` puts every bar on the left. `spectrum-top` returns one slide to the top bar, and the bar still takes the deck's solid style.

---

<!-- @meta{layout=content, class=with-spectrum} -->

`with-spectrum`

## The rainbow comes back on one slide

The deck runs `spectrum: solid`. `with-spectrum` returns this slide to the theme's rainbow ribbon, still on the deck's left edge, because the two registers are independent.

---

<!-- @meta{layout=content, class=heading-rule-auto eyebrow-plain} -->

`heading-rule-auto · eyebrow-plain`

## A plain label and the masthead's own rule

`heading-rule-auto` drops the deck's accent rule for the default hairline, and `eyebrow-plain` drops the dot before this label. Each token resets only its own register.

---

<!-- @meta{layout=content, class=headline-align-auto} -->

`headline-align-auto`

## The layout chooses its own alignment again

The deck centers every heading with `headline-align: center`. `headline-align-auto` hands this slide back to the layout, so the masthead sits on the left as it does by default.

---

<!-- @meta{layout=cards-grid, class=three} -->

`Card rails · the deck's setting`

## The deck puts card rails on top

- Top rail
  - Every card in this deck carries its rail across the top.
- Solid, like the bar
  - The deck pins the rail solid (`card-spectrum: solid`).
- No token here
  - This slide writes no token, so it shows the deck's choice.

---

<!-- @meta{layout=cards-grid, class=three card-spectrum-left} -->

`card-spectrum-left`

## One slide moves the rails back to the left

- Left rail
  - `card-spectrum-left` returns these rails to the default edge.
- Same style
  - Only the placement changes; the rail stays solid.
- One slide only
  - The next slide carries its rails on top again.

---

<!-- @meta{layout=content} -->

`When to reach for one`

## Use a restore token when one slide must break from the deck

We recommend setting the look once in the deck's front matter and keeping restore tokens for the rare slide that needs the default back: a quote, a cover, a chart that reads better plain. In the Studio, each slide picker offers the default as an ordinary choice and writes the token for you.

