---
origin: 2554
priority: P2
recorded: 2026-10-06
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-06-conflict-reduction.md
source: engineering/decisions/2026-10-06-conflict-reduction.md
---

# Take the generated gallery PDFs off the cross-PR conflict path (owner picks A/B/C/D)

```text
  P2 · [no ticket] Decide, then build, how committed PDFs stop forcing catch-ups.
       why now   — PDFs were in 11 of 19 real conflicts (2026-09-30..10-06); five gallery
                   PDFs alone were in 6 of the 12 PDF conflicts over the whole replay window.
       where     — the five: lib/components/chart/chart.gallery.{light,dark}.pdf and
                   examples/data-viz-gallery.{light,dark}.pdf (both GENERATED), and
                   test/integration/baseline-decks/gallery.pdf (hand-curated, 120 slides).
                   Touch points: PDF ownership rules in tools/check-ownership.js,
                   tools/build-staged-pdfs.js, test/unit/tools/showcase-galleries.test.js,
                   tools/lib/golden-set.mjs (derived from git ls-files, so it follows),
                   tools/build-component-docs.js links, .gitignore.
       options   — A: stop committing the 4 generated (2 catch-ups fully avoided, 5 made
                   cheaper; nothing unique lost). B: all 5 (3 / 6; golden-diff loses the
                   baseline deck's before/after). C: PRs commit only decks whose markdown
                   changed, nightly bot re-renders the rest (5 avoided; reviewers lose
                   golden-diff on engine changes). D: drop. Recommended: A.
       blocked   — on the owner's pick.
       done when — the picked set is not tracked, every gate that read it is updated or
                   its entry removed, and a replayed pair of concurrent chart PRs merges
                   without a PDF conflict.
       evidence  — `git ls-files` of the set before/after; the replayed merge-tree
                   output on GitHub's terms.
       verify    — tier 1 checker: it edits PDF ownership gates every PR runs.
```
