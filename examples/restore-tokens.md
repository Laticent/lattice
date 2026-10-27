---
marp: true
theme: indaco
paginate: true
header: "Lattice · Restore tokens"
spectrum: solid
spectrum-edge: left
spectrum-card: auto
spectrum-card-edge: top
rule: accent
eyebrow: dot
headline: center
---

<!-- _class: title silent -->

`Accent registers · restore tokens`

# Back to the default, one slide at a time

This deck sets a non-default value on six accent registers. Each slide after the next uses one restore token to put a single register back on its default.

---

<!-- _class: content -->

`The deck's own look`

## Every slide follows the deck until it says otherwise

This slide carries no tokens of its own, so it shows the deck's settings: a solid bar on the left edge, an accent rule under the heading, a dot before this label, and a centered heading.

---

<!-- _class: content spectrum-edge-top -->

`spectrum-edge-top`

## The bar goes back on top

A deck that writes `spectrum-edge: left` puts every bar on the left. `spectrum-edge-top` returns one slide to the top bar, and the bar still takes the deck's solid style.

---

<!-- _class: content spectrum-on -->

`spectrum-on`

## The rainbow comes back on one slide

The deck runs `spectrum: solid`. `spectrum-on` returns this slide to the theme's rainbow ribbon, still on the deck's left edge, because the two registers are independent.

---

<!-- _class: content rule-auto eyebrow-plain -->

`rule-auto · eyebrow-plain`

## A plain label and the masthead's own rule

`rule-auto` drops the deck's accent rule for the default hairline, and `eyebrow-plain` drops the dot before this label. Each token resets only its own register.

---

<!-- _class: content head-auto -->

`head-auto`

## The layout chooses its own alignment again

The deck centers every heading with `headline: center`. `head-auto` hands this slide back to the layout, so the masthead sits on the left as it does by default.

---

<!-- _class: cards-grid three -->

`Card rails · the deck's setting`

## The deck puts card rails on top

- Top rail
  - Every card in this deck carries its rail across the top.
- Follows the bar
  - The rail follows the deck's solid style (`spectrum-card: auto`).
- No token here
  - This slide writes no token, so it shows the deck's choice.

---

<!-- _class: cards-grid three spectrum-card-edge-left -->

`spectrum-card-edge-left`

## One slide moves the rails back to the left

- Left rail
  - `spectrum-card-edge-left` returns these rails to the default edge.
- Same style
  - Only the placement changes; the rail stays solid.
- One slide only
  - The next slide carries its rails on top again.

---

<!-- _class: content -->

`When to reach for one`

## Use a restore token when one slide must break from the deck

We recommend setting the look once in the deck's front matter and keeping restore tokens for the rare slide that needs the default back: a quote, a cover, a chart that reads better plain. In the Studio, each slide picker offers the default as an ordinary choice and writes the token for you.

