---
title: Glossary
description: Every Lattice word this track uses, in one place — including the four that mean different things in different rooms.
---

Look anything up here. Terms are grouped by where you meet them, and the
four genuine collisions are called out, because each is a word doing more
than one job.

## The four words that collide

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

**Mark**:

1. **A state mark** — the drawn disc a marker like `[x]` or `[!]` becomes on
   a slide. This is the authoring meaning, and the one the
   [Status and labels](/guides/status/) guide uses.
2. **A finish's third layer** — a placed emblem, like a monogram.
3. **A `mark-*` treatment** — a class such as `mark-orbit` that adds an accent
   shape to one slide. A cousin of the finish layer, applied per slide.

The `--mark-*` tokens (`--mark-check`, `--mark-x`) are the drawn shapes inside
a state mark, so they belong to the first meaning.

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

## Status and labels

| Term | What it means |
|---|---|
| **Marker** | What you type: `[x]` `[-]` `[!]` `[?]` `[ ]` `[/]`. Six of them, one answer each. |
| **State mark** | What a marker draws: a disc or ring whose shape says the answer. |
| **Answer** | What a mark means — yes, partly, no, unknown, open, does not apply. The same in every layout. |
| **Pill** | A small rounded label. `` `{STABLE}:c2` `` places one by hand; some components place one from a word. |
| **Color slot** | `:c1` … `:c12` on a pill. Numbered, not named: a slot picks a distinct color, never a meaning. |
| **Status word** | One of ten words — `on-track`, `at-risk`, `blocked` … — that six chart components read and color by meaning. |
| **Label set** | `` `[{[x], Enacted}]` `` — renames the words a layout's key uses, without changing the answer. |
| **Key** | The legend a layout draws under its grid, naming each mark the slide uses. |

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
| **Mode** | A separate front-matter key for the deck's handwriting — `boardroom`, `sketch` or `sketch-clean`. Not a finish. |

## Words that are not Lattice's

| Term | What it means |
|---|---|
| **Front matter** | The `---` block at the top of a markdown file, holding deck-wide settings. |
| **WCAG AA** | The accessibility standard most organizations are held to. 4.5:1 for text. |
| **Specificity** | How a browser breaks a tie between two CSS rules that both apply — the more precisely a rule names its target, the higher it scores. |
| **`color-mix()`** | A CSS function that blends two colors, used so a finish never names one. |
| **Mermaid** | The diagram syntax Lattice renders inside a fenced code block. |
