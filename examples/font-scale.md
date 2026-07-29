---
marp: true
size: 4K
theme: cuoio
paginate: true
header: "Lattice · Global Font Scale"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->

# Bigger when the room is bigger

`Typography · Global Font Scale`

One modifier bumps the readable fonts on a slide — or the whole deck — up in lockstep.

---

<!-- _class: cards-grid -->
<!-- _footer: "The three steps · cards-grid" -->

## Three steps, one knob.

- `scale-l` — ×1.15
  - Gentle bump. Slightly larger rooms; body lands near 18 pt.
- `scale-xl` — ×1.3
  - Strong. Projection and back-of-room reading; body near 21 pt.
- `scale-2xl` — ×1.5
  - Dramatic. Large halls and low-vision accessibility; body at 24 pt.
- One multiplier
  - `--fs-scale` feeds 10 of the 12 tokens. The two largest headings (h1, h2) stay fixed, so titles never balloon.

---

<!-- _class: cards-grid -->
<!-- _footer: "Default footprint — no modifier · cards-grid" -->

## Default — tuned for desk distance.

- Body
  - Cards, lists, and prose scale up.
- Titles
  - h1 and h2 hold steady — the title above is the same size on every step.
- Subheads & chrome
  - h3–h6, footer, and pagination scale.
- Hero
  - The one big number scales.

---

<!-- _class: cards-grid scale-l -->
<!-- _footer: "Same slide, scale-l · cards-grid scale-l" -->

## scale-l — a gentle lift.

- Body
  - Cards, lists, and prose scale up.
- Titles
  - h1 and h2 hold steady — the title above is the same size on every step.
- Subheads & chrome
  - h3–h6, footer, and pagination scale.
- Hero
  - The one big number scales.

---

<!-- _class: cards-grid scale-xl -->
<!-- _footer: "Same slide, scale-xl · cards-grid scale-xl" -->

## scale-xl — projection size.

- Body
  - Cards, lists, and prose scale up.
- Titles
  - h1 and h2 hold steady — the title above is the same size on every step.
- Subheads & chrome
  - h3–h6, footer, and pagination scale.
- Hero
  - The one big number scales.

---

<!-- _class: cards-grid scale-2xl -->
<!-- _footer: "Same slide, scale-2xl · cards-grid scale-2xl" -->

## scale-2xl — the back row.

- Body
  - Prose grows to 24 pt.
- Titles
  - This title is unchanged.
- Chrome
  - Footer and page number grow.
- Hero
  - Scales too.

---

<!-- _class: big-number scale-xl -->
<!-- _footer: "The hero scales too · big-number scale-xl" -->

`Across the Board`

- 1.3×
  - Hero, body, eyebrow, and chrome all ride `--fs-scale` together — only h1 and h2 sit it out.

---

<!-- _class: compare-table scale-xl -->
<!-- _footer: "Tables scale — cells and headers · compare-table scale-xl" -->

## Tables scale too.

| Surface | Token | At scale |
| --- | --- | --- |
| Cell text | `fs-body-compact` | Grows |
| Column header | `fs-meta` | Grows |
| Plain markdown table | `fs-body` | Grows |
| Slide title | `fs-h1 / fs-h2` | Holds |

---

<!-- _class: cards-grid three -->
<!-- _footer: "What moves, what holds, what's independent · cards-grid three" -->

## What moves when you scale.

- Scales
  - Body, lists, cards, h3–h6, hero, chrome, table cells, code blocks, and KaTeX math all ride `--fs-scale`.
- Holds
  - Slide titles and the big display numbers that reuse h1/h2 — KPI and stats figures, quote marks.
- Independent
  - Mermaid diagrams render their own SVG text; the scale doesn't reach inside. Size those at the diagram level.

---

<!-- _class: cards-grid -->
<!-- _footer: "Scope is native Marp class scoping · cards-grid" -->

## One slide, or the whole deck.

- One slide
  - `<!-- _class: cards-grid scale-xl -->` — the spot directive scales just this section.
- Whole deck
  - Put `class: scale-xl` in the front matter — every slide grows.
- Composes
  - Stacks with any layout or variant — `dark`, `kpi`, grids — it only sets a custom property.
- Not a size picker
  - For one wrong element, fix its token. Scale is for magnitude, not surgery.

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _footer: "Closing · closing" -->
<!-- _paginate: false -->

`Reach for it when the room demands it`

## Same deck, two distances.

`Author once at desk-distance, then scale up for the projector — the proportions you tuned come along for free, and the titles stay put.`
