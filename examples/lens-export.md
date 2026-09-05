---
marp: true
theme: indaco
paginate: true
acronyms:
  KB: kilobytes
header: "Lattice · Reader views, exported"
lenses:
  brief: { label: "Brief", base: none, order: 1, kind: rung, approved: "sha256:bc7205fb1d53b752739374ce22834a613286209bb7ec806773804435e7303b32" }
  evidence: { label: "Evidence", base: none, order: 2, kind: rung, approved: "sha256:56b0b4a05010d1bb121e7cd14d2f82dcdcf1bc312875d81569921a9ee1d70b33" }
  ask: { label: "The ask", base: none, order: 3, approved: "sha256:f303a1db30f8e9474342baaea97c4c653bb78ac4fe104a840120dff232bbf06a" }
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

A player embeds the deck source so it round-trips into an editable deck — the fourth way a withheld slide reaches a recipient, and the easiest: an import, not a source view.

So a projection carries only what shipped — the views too, not just the slides. `--lens-source full` puts the whole deck back, views and all.

---

<!-- _class: list -->
<!-- _lens: ask brief evidence -->

## Two commands.

1. One view, as many pages as it projects — pass its id to --lens.
2. Two views in one file — pass both ids, and add --player.
3. Pick which one it opens on with --lens-default.
4. An unavailable view exits non-zero and writes nothing.

---

<!-- _class: closing -->
<!-- _lens: ask brief evidence -->
<!-- _header: '' -->
<!-- _paginate: false -->

## The artifact now behaves the way the Studio does.

`Where this leaves us`

Pick a view from the menu above — a brief, the evidence, or the ask.

