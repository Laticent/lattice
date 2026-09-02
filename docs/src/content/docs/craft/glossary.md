---
title: Glossary
description: Every Lattice word this track uses, in one place — including the three that mean different things in different rooms.
---

Look anything up here. Terms are grouped by where you meet them, and the
three genuine collisions are called out, because each is a word doing more
than one job.

## The three words that collide

**Canvas** means three different things, and context is the only way to
tell them apart.

1. **The light or dark version of a deck.** "Check both canvases" means
   check the deck in light mode and in dark mode. This is the theme track's
   meaning, and by far the most common.
2. **A Form value** — `canvas` is one of the shapes a component can select,
   meaning one undivided block. `statement.canvas` is a component that puts
   a single block on the slide.
3. **`--fin-canvas`**, a token naming the surface a particular slide is
   painting. Usually the same as `--bg`, and deliberately not on the three
   dark bookends.

**Layer** likewise:

1. **The four backdrop layers** of a finish — wash, texture, mark, edge.
   These genuinely stack.
2. **The three "layers"** of the categorical contrast contract. These do
   not stack; they are three tests each color has to pass. Named for the
   contract, kept here because you will meet the phrase in the repo.
3. **The three things a deck is dressed in** — theme, component, finish.
   Separable, not stacked.

**Axis**:

1. **Function, Form, Substance, Finish** — the four axes a slide is decided
   along.
2. **`capacity.axis`** — what a component counts, from a fixed set of five.
3. **The brand axis** — the two or three anchor colors a theme is built
   from. Informal; not something the engine reads.

## Themes

| Term | What it means |
|---|---|
| **Theme** | One CSS file of colors. Also called a palette. |
| **Palette** | The same thing. The site header's picker uses this word. |
| **Token** | A named color, written `--like-this`. The name is a **role**, not a color. |
| **Role** | What a token is *for* — `--text-body` is "the color body prose is set in", not "dark gray". |
| **Ink** | The colors text is set in. Seven of them, loudest to quietest. |
| **Surface** | The colors things are painted on: the page, cards, the dark bookends. |
| **Accent** | The brand color, plus its pale wash and the ink that goes on top. |
| **Signal** | Success, warning, failure — three inks and three tinted grounds. |
| **Categorical** | The twelve colors a chart or diagram cycles through. |
| **Contrast ratio** | How different two colors are in lightness. 21:1 is black on white. |
| **`light-dark()`** | A CSS function naming both canvases at once: light value first, dark second. |
| **Manifest** | `themes/<name>.manifest.json` — the palette's identity. No colors except one swatch for the picker. |

## Components

| Term | What it means |
|---|---|
| **Component** | A named arrangement for one slide, selected with `<!-- _class: name -->`. |
| **Frame** | The cut that divides a slide — into columns, a grid, a band over a body. |
| **Cell** | One piece the cut leaves. An empty, sized box. |
| **Tile** | What fills a Cell — your heading, your list, your quote. |
| **Stage** | `.cell-stage`, the Cell your content lands in. Where component CSS attaches. |
| **Masthead** | `.cell-masthead`, the Cell holding the heading. The engine owns it. |
| **Sovereign** | A layout that takes neither Cell and owns the whole page — `title`, `image` and eight others. |
| **Slot** | A named part of a component, mapped to a CSS selector. |
| **Skeleton** | The smallest slide that uses a component. What "insert component" gives you. |
| **Capacity** | How many items a layout holds before it stops working. |
| **Density** | How much text fits inside one of those items. |
| **Escalation target** | The component to move to when you exceed capacity. |
| **Bucket** | The folder family a component lives in. Thirteen of them. |
| **Substance** | What the author writes: prose, structure, series, or graph. |
| **Transform** | Code that rebuilds the markdown into different elements before CSS lays it out. |
| **Variant** | A modifier that changes a component without replacing it. |
| **Reflow** | Rearranging for a different page shape, keyed on `data-family`. |

## Finishes

| Term | What it means |
|---|---|
| **Finish** | A backdrop painted behind the words. Selected with `finish:` in front matter. |
| **Backdrop** | The layer the engine adds inside each finished slide, where the finish paints. |
| **Wash** | Layer 1 — an ambient field of color. |
| **Texture** | Layer 2 — a repeating pattern. |
| **Mark** | Layer 3 — a placed emblem, like a monogram. |
| **Edge** | Layer 4 — what happens at the rim: a vignette, a rule, a frame. |
| **Screen face** | The version a browser shows, fading to transparent. |
| **Opaque face** | The `-opaque` twin used for print and export, ending on a real color. |
| **Register** | The list of recognized `finish:` names. Adding one is a row in it. |
| **Mode** | A separate front-matter key for the deck's handwriting — `boardroom` or `sketch`. Not a finish. |

## Words that are not Lattice's

| Term | What it means |
|---|---|
| **Front matter** | The `---` block at the top of a markdown file, holding deck-wide settings. |
| **WCAG AA** | The accessibility standard most organizations are held to. 4.5:1 for text. |
| **Specificity** | How a browser breaks a tie between two CSS rules that both apply — the more precisely a rule names its target, the higher it scores. |
| **`color-mix()`** | A CSS function that blends two colors, used so a finish never names one. |
| **Mermaid** | The diagram syntax Lattice renders inside a fenced code block. |
