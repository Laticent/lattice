---
marp: true
theme: indaco
paginate: true
header: "Lattice · Print handouts"
---

<!-- _class: title silent -->

`Print · paper · N-up · notes`

# Three ways to leave the room with paper.

The Print drawer and the `lattice` CLI now fit a deck onto real sheets, pack several slides per page, and print a speaker-notes handout — the boardroom leave-behinds.

<!-- Speaker: this is the demo deck for the paper-fit CLI, N-up, and the notes handout; print it from the drawer or render it with the CLI --paper flag. -->

---

`Paper size`

## Fit the deck onto the paper you actually have.

- Auto picks the least-wasteful sheet for the aspect — 16:9 lands on US Legal, 4:3 on Letter.
- Every slide is fit and centered inside a 9mm safe margin, never cropped.
- The CLI bakes the paper MediaBox: `lattice deck.md deck.pdf --paper letter`.

---

<!-- _class: cards-grid -->

## One kernel decides the sheet, everywhere.

- Studio drawer
  - Flip paper or orientation and the preview re-fits instantly, no re-render.
- Node CLI
  - The same `--paper` decision, baked into the exported PDF's MediaBox.
- Shared math
  - `resolvePrintSheet` lives in one place, so the two surfaces can't disagree.

---

<!-- _class: stats -->

`What N-up saves`

## More slides, fewer sheets.

1. 1
   - slide per page, the default
2. 2
   - stacked per sheet, review-friendly
3. 4
   - to a page, the 2×2 grid
4. 9mm
   - safe margin, always held

---

<!-- _class: cards-grid -->

## Pick the layout for the room.

- One-up
  - Full-page slides — the projector-quality print.
- Two-up
  - Two slides a sheet — halves the paper for a read-through.
- Four-up
  - A 2×2 grid — the compact hand-around.
- Notes
  - Each slide over its speaker notes — the presenter's leave-behind.

---

`Notes handout`

## The slide and what you meant to say about it.

- Each page carries one slide on top and its speaker notes below.
- Notes come from the same boundary the presenter reads — they can't drift.
- Portrait gives the notes the most room; long notes clip with an ellipsis.

---

<!-- _class: closing silent -->

`Print · shared kernel`

# Configure the sheet. Print the room.

Paper, N-up, or notes — one rasterize, assembled the way the moment needs it.
