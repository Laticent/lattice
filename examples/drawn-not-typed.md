---
marp: true
theme: indaco
paginate: true
header: "Lattice · drawn, not typed"
footer: "Drawn, not typed"
---

<!-- _class: title silent -->

`Feature demo · HARD RULE #29`

# The check mark you typed is not a shape.

It is a request that some font, on some machine, draw one.

---

<!-- _class: content -->

## What a typed glyph actually does.

A deck reaches at least three surfaces: the CLI's headless Chromium, a shared
`.html` export opened on somebody else's laptop, and PowerPoint on Windows.

A character like `U+2713` can render differently on all three. Inter, Source
Serif, Helvetica and Arial carry no glyph for it, so the renderer falls back to
whatever font that machine happens to have — or to a color emoji, which takes no
color from the element at all, or to a hollow box, which takes nothing.

> The engine already draws every one of these as an SVG mask, so the shape is
> ours and only the color comes from the theme. Nothing had extended that idea
> past status marks to the rest of the chrome.

---

<!-- _class: compare-prose -->

## Typed asks. Drawn answers.

- **Typed.**
  - You do not choose the shape; you ask a stranger's font to supply one. It
    arrives at a different weight and a different baseline from the type beside
    it, or in full color, or not at all. The same deck reads three ways, and you
    see none of them — your machine has the font.
- **Drawn.**
  - One `--icon-*` mask, painted in a palette token. The shape is ours and only
    the color is the theme's, so it is identical on every machine, at every
    size, in light and dark, and legible in grayscale on a printer.

---

<!-- _class: compare-table state-cells -->

## `state-cells` — status in any table's cells.

| Criterion    | Chorus | Productboard | Notion | Sprig + Log |
| ------------ | :----: | :----------: | :----: | :---------: |
| Speed        |  [x]   |     [ ]      |  [x]   |     [x]     |
| Auditability |  [ ]   |     [x]      |  [x]   |     [x]     |
| Adoption     |  [x]   |     [x]      |  [ ]   |     [x]     |
| Calibration  |  [ ]   |     [-]      |  [ ]   |     [x]     |

> Two layouts already decoded `[x]` inside a cell. Everywhere else a comparison
> table had no drawn status at all — which is exactly why authors typed a check.

---

<!-- _class: cycle -->

## The chrome the engine draws for you.

- Collect the signal
- Score it against the rubric
- Route it to the owner
- Log the decision

---

<!-- _class: list note-warn -->

## `note-warn` — a caveat, without the emoji.

- The warning sign is the glyph most likely to arrive in full color.
- An emoji takes no color from the element, so it breaks a palette-blind slide.
- The modifier draws the triangle in the theme's warn token instead.

> These figures predate the Q3 restatement and are superseded by it.

---

<!-- _class: code -->

## The linter coaches. It does not refuse.

```text
⚠ deck.md · slide 3 · typed-shape-glyph [compare-table]
    ✓ ✗ in a table cell (and 3 more lines on this slide) — typed, not
    drawn, so each machine sets it in whatever font it can find for it,
    next to type set in yours
    fix: Write the state marker instead — [x] done · [-] partial ·
    [ ] not met · [/] out of scope — and add `state-cells` to the
    slide's class so the cells decode them.
```

A warning, never an error. Authors write what they like; the linter offers the
better option, names the modifier, and says what the glyph will look like on a
machine that is not yours.

---

<!-- _class: cards-stack -->

## Where the rule deliberately stops.

- The a11y and print status glyphs stay
  - They are the grayscale-safe shape channel, and empty-alt `content` is the only mechanism measured to keep them out of the accessibility tree.
- A fenced block is quoted material
  - Two decks reproduce the CLI's own warning line verbatim, and the CLI really does print it. Terminal text is not a rendered surface.
- A quadrant axis eyebrow is syntax
  - Its arrow is the axis delimiter, and the ASCII spelling the parser advertises does not survive HTML escaping.

---

<!-- _class: closing silent -->

`Consistency is king · flexibility, the necessary evil`

# We warn, we coach.

The gate holds the line on the decks we ship. Everyone else gets the advice.
