---
marp: true
theme: indaco
paginate: true
header: "Lattice · Accent finishes"
meta: "Accent finishes · spectrum / rule / eyebrow"
spectrum: duo
---

<!-- _class: title silent -->

`Finish axis · the accent sub-family`

# Accent finishes

Three baked-in details — the **spectrum** ribbon, the heading **rule**, and the **eyebrow** — are now first-class, selectable finishes. Pick one deck-wide or per slide; every value is palette-blind and defaults to today's render.

---

<!-- _class: content -->

`Spectrum · style`

## One selection, every accent

The `spectrum:` key sets the gradient identity — and because every accent reads the same `--spectrum` token, the whole system follows at once.

- `rainbow`
  - The default 3-stop theme ribbon.
- `solid` / `duo` / `mono`
  - A single accent, a two-tone pair, or a quiet tint — this deck runs `duo`.
- `off`
  - Flattens every accent to a neutral hairline and drops the edge bar.

---

<!-- _class: code spectrum-mono -->

`Spectrum · consolidation`

## The structural accents follow too

Set `spectrum: mono` on this slide and the code panel's accent strip recolors with the bar — no per-site edit.

```js
// the panel strip below reads var(--spectrum); the style flows to it
const accents = ['edge bar', 'table rails', 'timeline spine', 'code strip'];
accents.forEach((a) => paint(a, 'var(--spectrum)'));
```

---

<!-- _class: content spectrum-edge-left -->

`Spectrum · placement`

## Move the bar to any edge

`spectrum-edge:` places the section-edge ribbon on the top (default), left, right, or bottom — this slide runs it on the **left**. Placement touches only the bar; the structural accents stay put.

---

<!-- _class: content spectrum-edge-bottom -->

`Spectrum · placement`

## A bottom rail reads as a baseline

The same `spectrum-edge:` control on the **bottom** edge. Use `off` to drop the bar entirely while keeping the deck's other accents intact.

---

<!-- _class: content rule-accent -->

`Heading rule · accent`

## The heading rule is its own finish

The `rule:` key controls the underline beneath a heading: `full`, `short`, an `accent`-colored segment (this slide), or `none`. A short accent rule gives a masthead a signature without shouting.

- Restrained by default
  - `auto` keeps today's full hairline where it already draws.
- Opt into a signature
  - `short` and `accent` are the expressive moves; `none` is the clean slate.

---

<!-- _class: content eyebrow-dot -->

`Eyebrow · dot`

## The eyebrow gets a finish

The `eyebrow:` key decorates the mono-caps kicker. This slide leads with a `dot`; `bar`, `arrow`, and `underline` are the other marks — all in the accent color, all tasteful.

---

<!-- _class: content eyebrow-arrow -->

`Eyebrow · arrow`

## Same label, a leading chevron

An `arrow` eyebrow points into the title. Pick one treatment deck-wide so every kicker reads as one family — never a ransom note of mixed marks.

---

<!-- _class: closing -->

`Accent finishes`

## Deck-wide or per slide — palette-blind, export-safe

Set the feel once in front matter, override a single slide with a class, and every value recolors automatically with the theme.
