---
origin: 2436
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2436
---

# Present's caption shows an author's `**bold**` as literal asterisks

why now   — found while checking the Guide in live Present on `test/fixtures/q3-board-review.md`:
            the decision slide's `<!-- caption: … **It costs more than the segment earns.** -->`
            reads `**It costs more than the segment earns.**` in the caption band, asterisks and all.
            The fixture has carried that markup since #2372; this PR does not touch caption text.
            Either captions strip (or render) inline emphasis, or the lint tells the author a caption
            is plain text. Whichever, the exported player's caption and the `.vtt` should agree.
where     — the caption text path: `PresentCaption.tsx`, Cadenza's track build, the export's caption.
done when — a caption carrying `**x**` shows `x` (or is flagged at authoring), the same on every surface.
evidence  — a screenshot of Present and the export on the fixture's decision slide.
verify    — tier 0.
