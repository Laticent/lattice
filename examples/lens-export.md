---
marp: true
theme: indaco
paginate: true
acronyms:
  KB: kilobytes
header: "Lattice · Reader views, exported"
lenses:
  brief: { label: "Brief", base: none, order: 1, kind: rung, approved: "sha256:34816b88a818fe468b832adecc52b74ae63e501b1c33fae26b91013e32de6282" }
  evidence: { label: "Evidence", base: none, order: 2, kind: rung, approved: "sha256:5e869db5cb6674532f55ae4421dd3d479422e6758dd1399e07715fd0cd129f46" }
  ask: { label: "The ask", base: none, order: 3, approved: "sha256:72d3e49459c5a6921fea42f0752cee62c5beedb984e8137a6429faeb269dcc0c" }
---
<!-- _class: title -->
<!-- _lens: brief evidence -->
<!-- _header: '' -->
<!-- _paginate: false -->

# One Deck, Three Audiences

`Reader views · Exported`

A deck is written once and read for different jobs. This file is that deck, exported so each reader can pick the view they came for.

---

<!-- _class: content -->
<!-- _lens: evidence -->

`The gap · Before`

## A reader view used to stop at the Studio door.

A deck could carry any number of approved views, and none of them could leave as a file. The board pack got the whole deck or nothing.

The workaround was page surgery: render all 52 pages, extract 2, 8 and 48, staple them back. That needs the absolute page numbers of a view's members — the coupling views exist to remove.

---

<!-- _class: list -->

## How a view is declared.

- Views are declared in front matter, in the deck's own registry block.
- Membership rides on the slide, so reordering never corrupts it.
- Approval is a person reading that view and saying yes.
- The hash covers what the reader sees, so an edit de-approves it.

---

<!-- _class: stats -->
<!-- _lens: brief evidence -->

`Measured · 16-slide deck, three views`

## Pruning saves almost nothing. That was never the point.

`Player export, prune applied. The 497 KB scaffold is mostly embedded fonts.`

1. 4.7%
   - saved by pruning
2. 2.7×
   - cost of separate files
3. 73 KB
   - what 16 slides add
4. 4
   - channels a slide escapes

---

<!-- _class: list -->
<!-- _lens: evidence -->

## What the export withholds, and what it only hides.

- Slides outside the exported views are withheld — absent from every channel.
- Slides inside one file are only hidden. Switching is a display rule.
- A recipient who must not have a view needs their own file.
- An export builds the bytes, so it can leave something out. A viewer cannot.

---

<!-- _class: content -->
<!-- _lens: evidence -->

`The fourth channel · Envelope`

## The re-importable envelope is the one people forget.

A player embeds the deck source so it can round-trip into an editable deck. That is the fourth way a withheld slide reaches a recipient, and the easiest: not a source view, an import.

So a projected export carries only what shipped. `--lens-source full` puts the whole deck back — the recipient then recovers every slide no view showed them.

---

<!-- _class: list -->
<!-- _lens: ask brief evidence -->

## Two commands.

1. One view, as many pages as it projects — pass its id to --lens.
2. Two views in one file — pass both ids, and add --player.
3. An unavailable view exits non-zero and writes nothing.
4. Several views need a carrier; a PDF refuses rather than guess.

---

<!-- _class: closing -->
<!-- _lens: ask brief evidence -->
<!-- _header: '' -->
<!-- _paginate: false -->

## The artifact now behaves the way the Studio does.

`Where this leaves us`

Switch the view above — a brief, the evidence, or the ask.

