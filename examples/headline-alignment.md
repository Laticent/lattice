---
marp: true
theme: indaco
paginate: true
header: "Lattice · Headline alignment"
---

<!-- _class: title silent -->

`Accent axis · framing alignment`

# Headline alignment

The alignment of a slide's **framing text** — eyebrow, heading, rule, subtitle, below-note, key insight, caption — is no longer baked into each layout. One register, `headline:`, sets it. `auto` keeps each component's own default; `left` pins the whole cluster to the margin; `center` centers it — even on a layout that lefts by default.

---

<!-- _class: content -->

`Register · auto`

## The component keeps its default

By default the register emits nothing and each layout renders exactly as before — a content masthead sits **left**, a title stays **centered**. `headline:` only moves when you ask, so no existing deck shifts a pixel.

> Left by default here — the eyebrow, heading, and this Key Insight already share one axis on a content slide.

---

<!-- _class: title head-left -->

`Same title · head-left`

# Left-aligned, on demand

A title centers by default. `_class: head-left` pins its eyebrow, heading, and subtitle to the left margin together — the whole framing cluster, not one piece.

---

<!-- _class: stats head-left -->

`Metrics · head-left`

## Even a centered layout follows

1. 53
   - components
2. 14
   - themes
3. 4
   - export formats
4. 1
   - source file

---

<!-- _class: content head-center -->

`Register · head-center`

## The missing lever — center a left-default layout

A content masthead lefts by default, so before this there was no way to center it. `_class: head-center` centers the whole framing cluster — the eyebrow, this heading (as a *box*, so it centers on the frame even when it wraps), and the rule — while the body keeps its own axis.

> The register centers the framing; the body is yours to align separately. That separation is the point.

---

<!-- _class: content -->

`Deck-wide · front matter`

## Set it once, or per slide

Add `headline: left` to the front matter and every slide left-aligns its framing — the title and closing bookends included. Or leave the deck on `auto` and pin just the slides that need it.

- Deck-wide
  - `headline: left` in the `---` block.
- Per slide
  - `_class: head-left` on one slide.

---

<!-- _class: content -->

`Roadmap · what's next`

## Auto, left, center — right is next

Three values ship: `auto`, `left`, and `center`. `center` aligns the framing *boxes* (not just their text) and, with a masthead bay, centers the cluster *beside* the meta — never under it. Right-aligning the cluster is the one remaining follow-up, so it lands designed, not patched.

> Alignment is a token the author owns now — `var(--headline-align)` — the way color already is.

---

<!-- _class: closing head-left -->

`Wrap`

## One axis, every framing piece

Set `headline:` deck-wide or per slide, and the framing text stops disagreeing with itself. `auto` respects each component; `left` and `center` make them all agree, whichever way you choose.
