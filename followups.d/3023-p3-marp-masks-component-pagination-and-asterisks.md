---
origin: 3023
priority: P3
recorded: 2026-11-04
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-04-switch-vocabulary.md
deferred: off-path — these are component looks, not switches; PR #3023 fixed the switch (`no-pagination`, `silent`) half of the same mask
source: https://github.com/Laticent/lattice/pull/3023
---

# A Marp render shows page numbers three components hide, and drops half of mark-asterisks

why now   — Marp's CSS pipeline (marpit's `postcss/pagination`) comments out every `content` declaration on a selector shaped `section…::after` with no whitespace or combinator. PR #3023 found that this left `no-pagination` and `silent` inert in every Marp render and fixed them in the bytes (`lib/core/marp-bundle-scope.js`) and live (`syncMarpPagination`, `lib/runtime/index.js`). A scan of the bundled `lattice.css` (2026-11-04) found four more rules the mask reaches, none of them a switch:
            · `section.collage.collage:not(.with-pagination)::after { content: none }` — a collage shows a page number in Marp;
            · `section.image.image[data-img-composition=statement]:not(.with-pagination)::after` — so does a statement image;
            · `section.form.claim-bleed:is(.chart-frame, .big-number, .diagram, .image, .video).claim-bleed::after` — and a claim-bleed slide;
            · `section.mark-asterisks::after { content: '' }` — the bottom-left asterisk cluster never paints in Marp (the pseudo keeps Marp's page number instead).
where     — the four rules above (collage.styles.css, image.styles.css, stage.css, base.treatments.css); the mask shape is recorded in `lib/forms/cell/stage/stage.css` above `section[data-lattice-pagination]:has(> .lat-pagination)::after`.
done when — each renders in marp-cli as it does in the engine; the fix is either a selector the mask does not match (a `>` inside `:has()`, as stage.css does) or the pagination decision moving into `slidePaginates` so the bundle bakes `_paginate: false` for them.
evidence  — the scan: strip comments from a bundle's `lattice.css`, then test each `content` rule's selectors against `/^section(?![\w-])[^\s>+~]*::?after$/` after removing `[…]`.
verify    — export a deck with a collage, a statement image, a claim-bleed chart and a `mark-asterisks` slide; `marp --no-stdin -c marp.config.cjs deck.md --images png`; compare with `npx lattice deck.md deck.pdf`.
