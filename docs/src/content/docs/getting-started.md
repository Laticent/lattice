---
title: Getting started
description: Install the Lattice toolchain, render the gallery deck, and build your first deck.
---

The quickest first look is the [playground](/playground/) — the full
engine, in your browser, nothing to install. To render locally you need
**Node 22 or newer**; `npm install` pulls in everything else, including a
headless Chromium for rendering. You won't need an account or any
configuration.

## Install

```sh
git clone https://github.com/Laticent/lattice.git
cd lattice
npm install
```

## Render the gallery deck

The repository ships a gallery deck that exercises every layout — all
55, in one 115-slide tour — and serves as the ground-truth fixture for
what the renderer produces. Render it with the bundled `lattice` CLI
(no network required):

```sh
npx lattice test/integration/baseline-decks/gallery.md gallery.pdf
```

Open `gallery.pdf` — that is the fastest answer to "what does this
produce?" (Prefer not to render it yourself? The same deck is served on
this site at [/gallery.pdf](/gallery.pdf).)

The output extension picks the format — the same render, delivered as a
vector PDF, a PowerPoint, or a PNG set:

```sh
npx lattice test/integration/baseline-decks/gallery.md gallery.pptx   # PowerPoint (image slides)
npx lattice test/integration/baseline-decks/gallery.md gallery.png    # → gallery.001.png, gallery.002.png, …
```

## Render your own deck

A deck is a Markdown file with a small front-matter block selecting a
palette. Each slide is separated by `---`, and a `<!-- _class: ... -->`
comment picks the layout.

```markdown
---
theme: indaco
paginate: true
---

<!-- _class: title -->

# From Signal to Strategy

`Product Strategy · Q3 2025`

A decision framework for product leaders.

---

<!-- _class: big-number -->

## 38%

of pipeline stalls trace to a single approval step.
```

Build it with the same CLI — same rule, the extension picks the format:

```sh
npx lattice deck.md deck.pdf     # vector PDF
npx lattice deck.md deck.pptx    # PowerPoint (image slides)
npx lattice deck.md deck.png     # → deck.001.png, deck.002.png, …
```

Need a copy someone can render with Marp? Use **Export to Marp** in the Drawing
Board (or `npm run export:marp`) to produce a self-contained `.zip` — splits
baked to literal `---`, themes, assets, and a zero-install bundled renderer.
Lattice itself never renders through Marp, and its front matter never needs
`marp: true` — add that key only if you preview decks with the VS Code Marp
extension, which activates on it.

## What to read next

- [Authoring decks](/guides/authoring/) — the layout catalog and how to
  feed each layout.
- [Themes & palettes](/guides/themes/) — pick a palette, or author your
  own.
- [Component reference](/components/) — every layout (a *component*, in
  the catalog's vocabulary), each slot and modifier, browsable in any
  palette.
