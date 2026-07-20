---
marp: true
theme: indaco
paginate: true
header: "Lattice · Headline alignment"
---

<!-- _class: title silent -->

`Accent axis · framing alignment`

# Headline alignment

The alignment of a slide's **framing text** — eyebrow, heading, rule, subtitle, below-note, key insight, caption — is no longer baked into each layout. One register, `headline:`, sets it deck-wide or per slide. Every value defaults to `auto`, so today's decks are unchanged.

---

<!-- _class: content -->

`Register · auto`

## The component keeps its default

By default the register emits nothing and each layout keeps its own alignment — a content masthead sits **left**, a title stays **centered**. `headline:` only moves when you ask.

> Left by default — the eyebrow, heading, and this panel share one axis.

---

<!-- _class: content head-center -->

`Register · center`

## The same slide, centered

This slide carries `_class: head-center`. Every framing piece follows — no eyebrow left over a centered title, no note left behind.

> Centered here — the panel stays full-width; only its text re-anchors.

---

<!-- _class: content head-right -->

`Register · right`

## And right, as one cluster

`head-right` anchors the framing to the right edge — the rare escape, included for symmetry with the body `align-*` controls, which stay independent.

> The body `align-*` axis is untouched, so a right headline can sit over a left body.

---

<!-- _class: piechart head-center -->

`H1 2026 · centered header`

## Charts follow, too

`headline: center` re-centers the chart's masthead and caption in lock-step — no left title over a centered caption.

- Deck production `46%`
- Meetings `22%`
- Realigning `18%`
- Stakeholder work `9%`
- Deciding `5%`

Figure 1 — the caption follows the same axis as the title above it.

---

<!-- _class: content -->

`Deck-wide · front matter`

## Set it once for the whole deck

Add `headline: center` to the front matter and every slide centers its framing — the title and closing bookends included. A single slide opts back out with `<!-- _class: head-left -->`.

- Deck-wide
  - `headline: center` in the `---` block.
- One exception
  - `_class: head-left` on the slide that needs it.

---

<!-- _class: divider -->

`Section · two`

## Dividers keep their own default

---

<!-- _class: closing head-center -->

`Wrap`

## One axis, every framing piece

Alignment is now a token the author owns — `var(--headline-align)` — the way color already is. Set it deck-wide, override it per slide, and the framing text never disagrees with itself again.
