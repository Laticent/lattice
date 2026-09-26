---
marp: true
theme: indaco
paginate: true
header: "Lattice · Deck presets"
meta: "Deck presets · preset: editorial"
preset: editorial
---

<!-- _class: title silent -->

`Deck settings · presets`

# Deck presets

One word in the front matter sets the bar, the rules, the kicker, the trim and the cards together. This deck runs `preset: editorial` and sets none of those ten keys itself.

---

<!-- _class: content -->

`Preset · what it sets`

## One word sets ten settings

`preset:` picks a named look. Each setting it covers still works on its own, and a key you write wins over the preset.

- What a preset sets
  - The brand bar and its edge, card rails, trim, heading rule, eyebrow, headline alignment, card lift and corners.
- What it never touches
  - The theme, color mode, finish, header, footer, logo and language.

---

<!-- _class: cards-grid four -->

`Preset · the four looks`

## Four presets, each different on every slide

- Classic
  - The house default: rainbow bar, quiet trim, a hairline rule, flat cards.
- Editorial
  - A short rule, a bar on the kicker, single-hue trim, lifted cards. This deck.
- Brand-forward
  - The accent everywhere: solid bar, card rails, full trim, an accent rule.
- Minimal
  - No bar, no rule, rounded corners — the content and nothing else.

---

<!-- _class: cards-grid three spectrum-solid spectrum-card spectrum-trim rule-accent eyebrow-dot lifted -->

`Preset · brand-forward`

## Brand-forward puts the accent everywhere

- Solid bar
  - Set the theme accent to a client color; the deck follows.
- Card rails
  - Every card carries a rail that follows the bar.
- Full trim
  - Table rails, the timeline spine and code strips take the accent too.

---

<!-- _class: content spectrum-off spectrum-trim-off rule-none corners-rounded flat -->

## Minimal leaves only the content

No bar, no heading rule, flat cards and a rounded slide. Use it when the content is the design: a product walkthrough, a screen share, a deck read on a phone.

- Same content, less furniture
  - The layout and the type are unchanged; only the accent and surface details go.

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

The Studio counts these overrides as changes from the preset and offers a Reset back to it.

---

<!-- _class: content -->

`Studio · basic and advanced`

## Basic first, Advanced one tap away

- Basic
  - Preset, theme, color mode, size, page numbers and logo in one short list. A slide shows canvas, type scale, clean slide and its note.
- Advanced
  - Every setting, grouped or listed. The "More…" drawers are gone; their rows sit under plain headings.
- Search
  - Always spans every setting, whichever view is open.

---

<!-- _class: closing -->

`Deck presets`

## Pick a look, then change only what you need

Start from a preset, and every setting you change afterwards overrides it. Reset takes the deck back to the preset.
