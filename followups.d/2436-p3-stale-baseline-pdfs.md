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

**Checked 2026-09-28, held rather than rebuilt.** A fresh render of both decks, compared per page
with the committed PDF and with a PNG render of the same deck (the live layout):
- gallery: 17 of 116 pages change beyond anti-aliasing noise. 15 are intended (the card-tag kernel's
  equal tag widths and 4 px lower card body from #2428/#2433; the split-panel chrome and restored
  footer from #2457). Two are the new PDF writer's defects, not layout: p.51 loses the rejected
  tag's strikethrough and p.86's quadrant washes go flat
  (followups.d/2436-p1-pdf-writer-drops-text-decoration.md).
- indaco: p.9's dark divider is lighter navy with a left spectrum rule in both the fresh PDF and the
  PNG render, so the committed page is simply stale; the rest is anti-aliasing (this container's
  text rasterizes differently from the one that committed the PDFs, on every page, even for a PDF
  committed the day before).
Rebuilding now would commit the writer's two defects into the goldens, and whether goldens are
re-rendered through the shared writer at all is still the owner's call
(followups.d/2404-p1-rerender-goldens-through-shared-writer.md). So: fix the writer or take that
decision first, then rebuild both PDFs.


**Update 2026-09-29 (the video-export continuation PR).** p.51's strikethrough is fixed in the writer
(`hideDrawn` pins the decoration color). p.86 was never a writer defect: a fresh writer render and
a PNG render of the same deck match (flat, `fill-opacity: 0.6` washes); only the COMMITTED
Chrome-printed gallery.pdf is saturated, because Chrome's printer drops `fill-opacity` on a
gradient-filled SVG shape (the note at the top of tools/pdf-writer-parity.mjs). So p.86 is one
more page that changes, correctly, on the rebuild. Neither blocker remains; the rebuild waits only
on the owner's re-render decision (followups.d/2404-p1-rerender-goldens-through-shared-writer.md).
