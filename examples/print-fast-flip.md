---
marp: true
theme: indaco
paginate: true
header: "Lattice · Fast reprint"
---

<!-- _class: title silent -->

`Print drawer · rasterize once`

# Flip the paper. Skip the wait.

The Print drawer now rasterizes each slide **once** and caches the images. Changing paper or orientation re-places those images onto the new sheet — no re-rasterize.

<!-- Speaker: this deck is the demo for the cached-image re-place path; print it, flip Letter↔Legal↔A4, and the second build is instant. -->

---

`Why it was slow`

## A paper change used to rebuild the whole PDF.

- Every Letter → Legal → A4 flip re-ran the expensive step: **clone, embed fonts, rasterize** each slide.
- On a chart-heavy deck that is the dominant cost — paid again on every toggle.
- The pixels never changed, though — only where they land on the page did.

---

<!-- _class: cards-grid -->

## Rasterize and assemble are now two steps.

- Rasterize
  - Each slide becomes a self-contained image at its native box, cached by render — not by paper.
- Assemble
  - Place the cached images on the chosen sheet: pure geometry, fit and centered.

---

<!-- _class: stats -->

`What the flip costs now`

## Re-place is a fraction of a rebuild.

1. 1×
   - rasterize per deck
2. 0
   - re-rasterizes per flip
3. 3
   - paper sizes reuse it
4. 2
   - orientations reuse it

---

<!-- _class: cards-grid -->

## The cache key is the render, not the sheet.

- Paper size
  - Re-places from cache — Letter, Legal, and A4 reuse the same images.
- Orientation
  - Re-places from cache — landscape and portrait share the pixels.
- Color mode
  - Re-renders — black & white is new ink, so the cache drops.
- One tap
  - Desktop still prints the vector deck in a single click.

---

`One source of truth`

## The drawer and the CLI assemble the same way.

- `rasterizeDeckImages` and `assembleSheetPdf` live in the shared print kernel.
- The Print drawer caches images across flips; a Node export calls the same halves.
- `fitSlideOnSheet` places every slide — so the two surfaces can never disagree.

---

<!-- _class: closing silent -->

`Print · shared kernel`

# Configure freely. Build once.

Rasterize once, assemble as often as you like — the boardroom handout is one tap away, on any paper.
