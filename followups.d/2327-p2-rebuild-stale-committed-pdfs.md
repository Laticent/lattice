---
origin: 2327
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2327
---

# Rebuild the committed PDFs that were already stale before #2327

Found while #2327 rebuilt every PDF its state-marker change could move. For each one below,
a render from the branch tip WITHOUT #2327's changes already differed from the committed
PDF, so the drift came from earlier merges, not from #2327. #2327 left them as committed so
its diff carries only its own pixel changes.

Four more had the same older drift but also carried a #2327 change, so #2327 rebuilt them
and they now show both: `examples/debug.pdf`, `examples/social-grid.pdf`,
`exemplars/general-team/roadmap-review.pdf` (its page 6 timeline rings are the older drift;
page 3 is #2327's), and `examples/data-viz-gallery.{light,dark}.pdf` (the heatmap page is
the older drift from #2319; the roadmap page is #2327's). They are off this list.

```text
  P2 · Rebuild the stale committed PDFs
       why now   — the goldens a reviewer compares against no longer show what the
                   engine renders, so a real regression on these pages is harder to see.
       where     — examples/portrait-roadmap.pdf,
                   exemplars/general-team/{project-kickoff,project-status,status-update}.pdf
                   (a timeline's status rings changed color),
                   and kit/Sample-Deck.pdf (marp-cli render; 12 of 13 pages differ from a
                   fresh render, and the decision note 2026-08-11-palette-concat-signoff §7e
                   records that it does not reproduce across environments).
       done when — each is rebuilt with its own producer and golden-diff shows only the
                   drift named above.
       evidence  — the golden-diff comment on the rebuild PR.
       verify    — tier 1: render, pixel-compare against the committed copy, look at every
                   changed page.
```
