---
origin: 2436
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2436
---

# Re-render `gallery.pdf` and `token-contrast/indaco.pdf`, stale since the card-tag kernel

why now   — while #2436 checked that its phone canvas moves nothing at 16:9, a fresh HD render of
            test/integration/baseline-decks/gallery.md differed from the committed gallery.pdf on 16 of
            116 pages, and examples/token-contrast/indaco.pdf differed on pages 8–9 (the split slide's page
            number ink). Both differences were already there without #2436's changes, so the drift is
            main's, most likely #2428's card-tag CSS landing without a re-render. #2436 left both as
            committed so its diff carried only its own changes. Not covered by
            followups.d/2327-p2-rebuild-stale-committed-pdfs.md or 2404-p1-rerender-goldens-through-shared-writer.md.
where     — test/integration/baseline-decks/gallery.{md,pdf}; examples/token-contrast/indaco.{md,pdf}.
done when — both PDFs are rebuilt from main and each changed page is looked at and confirmed intended.
evidence  — tools/pixel-check.js before/after, and the changed pages rasterized and sent for review.
verify    — tier 0; a rebuild of generated artifacts, reviewed by eye.
