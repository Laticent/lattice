---
origin: 2321
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2321
---

# Studio Share → PDF renders every CSS counter as zero

why now   — every numbered component exports with its numbers gone. Driven on the real Studio (Playwright, `desktop` project, Share → PDF) on this branch: the `inventory` ledger reads `00 00 00 00` and the timeline dots `0 0 0 0`, and `list-criteria`, which #2321 does not touch, reads `00 00 00`. The same decks render 01–04 / 1–4 in the Studio's live preview, the Playground and the engine's PDF. Affects at least inventory, list-criteria, list-steps, authority-chain, regulatory-update, compare-prose and redline (every component with `counter-increment`).
where     — `docs/src/components/studio/export/deck-export.js`: rasterization clones each slide through `html-to-image` (`toPng`), which inlines computed styles and re-emits pseudo-elements. The counter's `content: counter(…)` survives, but the list's counter scope (`counter-reset` on the list, `counter-increment` on each row) evidently does not reach the clone, so every row evaluates the counter at its reset value.
done when — a Studio Share → PDF of `lib/components/inventory/inventory/inventory.gallery.md` and of a `list takeaway numbered` slide shows 01, 02, 03… exactly as the live preview does; an e2e spec on the exported artifact pins it (the PDF text layer or a page raster).
evidence  — seed a deck with `<!-- _class: list takeaway numbered -->` + three `1. Lead` rows, each with a nested `- body` into the Studio, Share → PDF, open the file.
verify    — the same export for every `counter-increment` component, in both color modes; this changes exported bytes, so it goes through the export sign-off (CLAUDE.md Quality Bar).
