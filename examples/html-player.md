---
marp: true
theme: indaco
pagination: true
header: "Lattice · HTML player"
player: true
---

<!-- @meta{layout=title, class=silent} -->

# The deck that is also a webpage.

`Present · Read · Share`

One self-contained `.html` — double-click it and it *is* your deck. No install, no network, nothing to configure.

---

<!-- @meta{layout=content, footer="One file, three ways to read it"} -->


## A deck is a talk and a document at once.

So the exported file is both. It opens in **Present** mode for the room, reflows to a scrolling **Read** view for the reader, and never phones home — every font, image, and diagram is baked into the single file you send.

---

<!-- @meta{layout=cards-grid, footer=Pick a view from the top bar} -->


`Three views`

## The same deck, three ways.

- Present
  - One slide at a time, fit-scaled to any screen, arrow-key navigation.
- Read · Slides
  - Every slide stacked in a scrolling column — full fidelity, nothing lost.
- Read · Article
  - A Typora-style document with a table of contents down the left.

---

<!-- @meta{layout=cards-grid, footer="Safe to open, safe to send"} -->


`Built to be shared`

## Portable by construction.

- Self-contained
  - Fonts, images, and charts inline as data — zero external requests.
- Locked down
  - The slide HTML is sanitized and pinned behind a strict content-security policy.
- Round-trips
  - The exact source rides along, so the file re-opens into Lattice losslessly.

---

<!-- @meta{layout=content} -->

## "Give me the one file that is my deck."

The emotional default a share format has to earn — not a zip to unpack, not a link that rots. One file, and it just opens.

---

<!-- @meta{layout=content, footer=Dark and light travel together} -->


## It adapts to the reader.

Both color modes are baked in, so the file follows the reader's system preference and flips on a single tap — the whole document re-themes at once, slides and article alike.

---

<!-- @meta{layout=closing, class=silent} -->

## Write once. Present, read, and share from the same file.

`lattice deck.md deck.pdf --player`
