---
origin: 3183
priority: P7
recorded: 2026-11-13
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-13-image-library.md §5
deferred: large — moves three ink hosts (the runtime, the CLI's bleed-ink stamp and the Studio's photo-ink read) and the card-ink samplers onto one read across Node, browsers and workers; PR 3183 built the decoders this needs and stops there
source: https://github.com/Laticent/lattice/pull/3183
---

# lastra slice 3's second half: measure and crop, and the bleed and card ink hosts on one read

why now   — PR 3183 shipped lastra's read, clean, decode, resize, encode and decide, but not `measure` (mean color of a
            region in linear light, from lib/core/card-ink.mjs) or `crop` (the cover/contain source rectangle for a focus).
            A bleed slide's ink is still read by three hosts three ways: lib/transformers/bleed-ink.js, the CLI's
            lib/export/bleed-ink-stamp.js (which draws the photo in its page first) and the Studio's photo-ink-read.ts; the card-ink
            samplers use canvas getImageData. Their answers can drift apart as the image path changes.
where     — docs/src/lib/lastra (measure.ts, crop.ts), lib/core/card-ink.mjs, lib/core/bleed-ink.mjs, the three hosts above,
            docs/src/components/studio/card-ink-sampler.ts, photo-verdict.ts.
done when — measure and crop live in lastra with tests; every ink host reads the photo through lastra; the inks picked
            are unchanged on the galleries, examples/image-plugin.md, examples/bleed-auto-ink.md and two photo decks.
evidence  — an ink census before and after on those decks (every slide's chosen ink), equal; e2e on three engines.
verify    — tier 1 checker.
