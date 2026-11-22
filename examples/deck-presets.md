---
marp: true
theme: indaco
paginate: true
header: "Lattice · Deck presets"
meta: "Deck presets · four looks"
---

<!-- _class: title -->

`Classic · the default`

# Deck presets

One word in the front matter sets the backdrop, the alignment, the bar, the rules and the cards together. This is Classic, the house default: centered, no backdrop.

---

<!-- _class: content -->

`Preset · what it sets`

## One word sets up to eleven settings

`preset:` picks a named look. Each setting it covers still works on its own, and a key you write wins over the preset.

- What a preset sets
  - The backdrop, heading alignment, brand bar and its edge, card rails, trim, heading rule, eyebrow, card lift and corners.
- What it never touches
  - The theme, color mode, header, footer, logo and language.

---

<!-- _class: title cover-light cover-masthead head-left eyebrow-bar typography-ledger -->

`Editorial · preset: editorial`

# A newspaper masthead, set flush left

A light cover under a heavy rule, a serif voice and no backdrop. Headings align left.

---

<!-- _class: title finish-strata head-center eyebrow-dot -->

`Brand-forward · preset: brand`

# The accent, everywhere

Centered, with corner marks over a faint grid. Set the theme accent to a client's color and the whole deck follows it.

---

<!-- _class: title head-left corners-rounded -->

`Minimal · preset: minimal`

# Nothing but the content

Flush left, no backdrop, no bar and no heading rule. Rounded slide corners on screen.

---

<!-- _class: content head-left rule-full eyebrow-bar trim-spectrum-mono lifted typography-ledger -->

`Editorial · a content slide`

## Line 3 runs at 94% before the peak even starts

Every other line has at least 15% headroom. Line 3 has six, and the Q4 forecast adds eleven.

- Overtime covers the first four weeks
  - After that the line is the constraint, not labor.

---

<!-- _class: cards-grid three finish-strata head-center spectrum-solid card-spectrum-solid trim-spectrum-solid rule-accent eyebrow-dot lifted -->

`Brand-forward · a card slide`

## Three ways to buy back the headroom

- Pre-build
  - Run Line 3 on weekends and stock ahead.
- Re-route
  - Move two SKUs to Line 1.
- Extend
  - Add a second shift for six weeks.

---

<!-- _class: code -->

`Preset · overrides`

## A key you write wins over the preset

```yaml
---
theme: indaco
preset: editorial
rule: none      # everything from Editorial except the heading rule
---
```

The Studio shows each preset as a picture of one sample slide, counts your overrides as changes, and offers a Reset.

---

<!-- _class: content -->

`Studio · basic and advanced`

## Basic first, Advanced one tap away

- Basic
  - Theme, preset, color mode, size, page numbers and logo in one short list. A slide shows canvas, type scale, clean slide and its note.
- Advanced
  - Every setting, grouped or listed. The "More…" drawers are gone; their rows sit under plain headings.
- Search
  - Always spans every setting, whichever view is open.

---

<!-- _class: closing -->

`Deck presets`

## Pick a look, then change only what you need

Start from a preset, and every setting you change afterwards overrides it. Reset takes the deck back to the preset.
