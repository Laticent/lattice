---
marp: true
theme: indaco
paginate: true
present: true
header: "Lattice · presentation mode"
---

<!-- _class: title silent -->

`Export · Full-screen on open`

# Open straight into presentation mode.

`This very PDF carries the hint. Open it in Adobe Acrobat or Reader and it launches full-screen — no menu hunting.`

---

<!-- _class: list -->
<!-- _footer: "What --present does" -->

## A few catalog hints turn a PDF into a deck.

- The document opens in full-screen
  - `/PageMode /FullScreen` plus a single-page layout — one slide filling the display, the same hint Keynote and PowerPoint emit.
- Leaving full-screen lands somewhere clean
  - A page-only fallback (no thumbnail or bookmark panel springing open) and fit-to-window, so the exit is as composed as the entrance.
- Slides cross-fade as you advance
  - A subtle `/Trans /Fade` between pages — presenter-driven, with no auto-advance timer.

---

<!-- _class: list -->
<!-- _footer: "Where it applies" -->

## Honored where it helps, ignored where it doesn't.

- Adobe Acrobat and Reader
  - Open the deck directly in full-screen presentation view — the headline case this is built for.
- Most desktop PDF viewers
  - Respect the same full-screen and single-page hints; presenting from a laptop just works.
- Browsers and macOS Preview
  - Quietly ignore the hints and open the deck normally — a no-cost enhancement with no downside anywhere.

---

<!-- _class: list -->
<!-- _footer: "How to use it" -->

## One flag, or one line of front matter.

- Turn it on at export
  - `lattice-emulator deck.md out.pdf --present` marks the exported PDF; every other byte is unchanged.
- Or bake it into the deck
  - A `present: true` front-matter key does the same for that deck, mirroring how `--fluid` works.
- Off by default
  - Without the flag or key the catalog is untouched, so no deck opens full-screen by surprise.

---

<!-- _class: closing silent -->

## Open it full-screen. Present from the PDF.

`Related`

- `--present` — mark any deck to open in presentation mode
- `--fluid` — emit the responsive on-screen viewer instead
- Speaker notes — embedded per slide, surfaced on click
