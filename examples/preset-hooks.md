---
marp: true
theme: indaco
paginate: true
header: "Lattice · Preset hooks"
meta: "Preset hooks · rule weight, rail weight, card corner"
spectrum-card: auto
style: |
  /* `rule-auto` restores the default heading rule, a no-op in a deck with no `rule:` key, so it
     marks the slides that set the hooks without adding a class of the deck's own. */
  section:is(.rule-auto, .rule-short) {
    --rule-w: 3px;
    --rule-mark: var(--text-heading);
    --rail-w: calc(var(--_sec-1cqi, 1cqi) * 0.9);
    --radius-card: 0;
  }
  section.stats {
    --rule-w: 6px;
    --rule-style: double;
    --radius-card: 0;
  }
---

<!-- _class: title silent -->

`Tokens · for presets`

# Five hooks, no new settings

A preset can now set the heading rule's weight, style and ink, the card rail's thickness and a card's corner. Unset, every deck renders exactly as before.

---

<!-- _class: cards-grid three -->

`Unset · today's render`

## With no hook set, nothing moves

1. Heading rule
   - A one-pixel hairline in the border gray, under the masthead.
2. Card rail
   - A thin spectrum rail down each card's left edge.
3. Card corner
   - The theme's medium radius on every card surface.

The hooks read today's values as their fallbacks, so every existing deck keeps its bytes.

---

<!-- _class: cards-grid three rule-auto -->

`Set · a heavier hand`

## Four hooks set on the same cards

1. Heading rule
   - Three pixels, drawn in the heading ink.
2. Card rail
   - Two and a half times the default thickness.
3. Card corner
   - Square cards; the slide keeps its own corner.

One rule in the deck's `style:` block sets `--rule-w`, `--rule-mark`, `--rail-w` and `--radius-card`.

---

<!-- _class: stats -->

`Set · a ledger rule`

## A double rule and square tiles read as print.

1. 6px
   - rule weight
2. double
   - rule style
3. 0
   - card radius

---

<!-- _class: list-steps rule-auto -->

`Set · on steps`

## Step cards take the same square corner.

1. Unset
   - Rounded at the theme's medium radius, as before.
2. Set once
   - One token squares every card surface on the slide.
3. Pills stay round
   - Capsules keep their full radius; only card surfaces change.

---

<!-- _class: content rule-short -->

`Set · on the short rule`

## The short rule takes the weight

`rule:` still picks the shape. The weight token sets how heavy the short segment is, here three pixels in place of the default 0.22% of the slide width.

- `rule: short` and `rule: accent` read `--rule-w` for the segment's height.
- `rule: accent` keeps its accent ink whatever `--rule-mark` says.

---

<!-- _class: decision rule-auto -->

## Square cards keep square tags.

`Set · on a decision`

- Adopt the hooks
  - One rule in the deck squares the cards and the tag in each corner together.
- Why not a register
  - Presets set these internally, so the Basic settings gain no control.
- Why not per component
  - One token per family keeps every card on the slide in one corner language.

---

<!-- _class: cards-grid three dark rule-auto -->

`Set · in dark mode`

## The hooks hold on a dark slide.

1. Rule ink
   - The heading ink, resolved on the slide, so it follows the dark scheme.
2. Rail
   - The same heavier rail, painted in the deck's spectrum.
3. Corner
   - Square cards on the dark canvas.

---

<!-- _class: closing -->

## Presets set these; authors do not have to.

`Five tokens · no new registers`
