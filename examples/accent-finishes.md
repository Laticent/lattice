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

## One selection sets the gradient

The `spectrum:` key picks the gradient identity — the ribbon on the **brand bar**. Elegant by default: the bar carries the spectrum, the in-content accents stay quiet.

- `on`
  - The default 3-stop rainbow ribbon (omit the key).
- `solid` / `duo` / `mono`
  - A single accent, a two-tone pair, or a quiet tint — this deck runs `duo`.
- `off`
  - Drops the section-edge bar entirely.

---

<!-- _class: code spectrum-trim-restrained -->

`Spectrum · trim`

## Three tiers on the structure — quiet by default

By default the code strip, table rails, and rules stay a quiet accent-tint hairline — no rainbow repeated on every line. `spectrum-trim:` dials the presence up in three tiers; this slide runs `restrained`, so the panel strip below is a quiet single-hue ramp.

```js
// spectrum-trim: off → a quiet accent-tint hairline (the default)
//                restrained → a single-hue accent ramp (this slide)
//                on → the deck's full spectrum flows onto the structure
const tiers = ['off', 'restrained', 'on'];
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

<!-- _class: cards-grid spectrum-card -->

`Spectrum · cards`

## Opt a spectrum rail onto card surfaces

- Deck-wide or per slide
  - `spectrum-card: auto` rails every card; `_class: spectrum-card` opts in one slide.
- Follows the bar by default
  - `auto` inherits the deck's `duo` — no per-card edit.
- Off by default
  - No card gets a rail unless you ask — restraint over a stripe on everything.
- Palette-blind
  - The rail recolors with the theme and `dark` automatically.

---

<!-- _class: cards-grid spectrum-card-solid -->

`Spectrum · cards`

## The rail tunes independently of the bar

- Pin any variant
  - `spectrum-card: solid` here, while the bar stays `duo` — all variants are on-brand.
- Its own placement
  - `spectrum-card-edge: top|right|bottom` moves the rail; `left` is the default.
- Independent axes
  - Style and placement each override per slide without touching the deck bar.
- Same restraint
  - One curated look per deck — the rail is a signature, not a stripe on everything.

---

<!-- _class: cards-grid spectrum-card-rainbow spectrum-card-edge-top -->

`Spectrum · cards`

## Rainbow rail, on top

- A pinned rainbow
  - `spectrum-card: rainbow` shows the full theme ribbon even when the bar is quieter.
- Moved to the top edge
  - `spectrum-card-edge: top` runs the rail across the card's head.
- Boardroom-safe
  - Solid or two-tone fills — no rainbow-alpha hazard in the exported PDF.

---

<!-- _class: closing -->

`Accent finishes`

## Deck-wide or per slide — palette-blind, export-safe

Set the feel once in front matter, override a single slide with a class, and every value recolors automatically with the theme.
