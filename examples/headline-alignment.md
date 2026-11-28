---
marp: true
theme: indaco
pagination: true
header: "Lattice · Headline alignment"
---

<!-- @meta{layout=title, class=silent} -->

`Accent axis · framing alignment`

# Headline alignment

The alignment of a slide's **framing text** — eyebrow, heading, rule, subtitle, below-note, key insight, caption — is no longer baked into each layout. One register, `headline:`, sets it. `auto` keeps each component's own default; `left`, `center`, and `right` pin the whole cluster — even on a layout whose default is the other way.

---

<!-- @meta{layout=content} -->

`Register · auto`

## The component keeps its default

By default the register emits nothing and each layout renders exactly as before — a content masthead sits **left**, a title stays **centered**. `headline:` only moves when you ask, so no existing deck shifts a pixel.

> Left by default here — the eyebrow, heading, and this Key Insight already share one axis on a content slide.

---

<!-- @meta{layout=title, class=head-left} -->

`Same title · head-left`

# Left-aligned, on demand

A title centers by default. `class=head-left` pins its eyebrow, heading, and subtitle to the left margin together — the whole framing cluster, not one piece.

---

<!-- @meta{layout=stats, class=head-left} -->

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

<!-- @meta{layout=content, class=head-center} -->

`Register · head-center`

## The missing lever — center a left-default layout

A content masthead lefts by default, so before this there was no way to center it. `class=head-center` centers the whole framing cluster — the eyebrow, this heading (as a *box*, so it centers on the frame even when it wraps), and the rule — while the body keeps its own axis.

> The register centers the framing; the body is yours to align separately. That separation is the point.

---

<!-- @meta{layout=content} -->

`Deck-wide · front matter`

## Set it once, or per slide

Add `headline: left` to the front matter and every slide left-aligns its framing — the title and closing bookends included. Or leave the deck on `auto` and pin just the slides that need it.

- Deck-wide
  - `headline: left` in the `---` block.
- Per slide
  - `class=head-left` on one slide.

---

<!-- @meta{layout=content, class=head-right} -->

`Register · head-right`

## Right-align, the rare escape hatch

The full set now ships — `auto`, `left`, `center`, `right`. `right` pins the whole cluster to the far edge with the exact machinery as `center`: the eyebrow, this heading, and the rule ride one `align-items` on the flexed masthead-lede. Rarely what you want, but there when you need it.

> Alignment is a token the author owns now — `var(--headline-align)` — the way color already is.

---

<!-- @meta{layout=closing, class=head-left} -->

`Wrap`

## One axis, every framing piece

Set `headline:` deck-wide or per slide, and the framing text stops disagreeing with itself. `auto` respects each component; `left` / `center` / `right` make them all agree, whichever way you choose.
