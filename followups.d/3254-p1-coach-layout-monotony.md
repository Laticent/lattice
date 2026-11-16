---
origin: 3254
priority: P1
recorded: 2026-11-16
area: engine
severity: medium
swimlane: design/editorial.md §Cadence variation between slides
deferred: off-path — the Coach review rules (lib/authoring/review-core.js, scorecard.js); this PR changes only decks and docs
source: https://github.com/Laticent/lattice/pull/3254
---

# The Coach scores a deck 100 with six tables in a row

```text
  P1 · [no ticket] flag a run of same-looking slides in the Coach
       why now   — The Semantic Testing deep dive had 28 tables in 60 slides, with runs of
                   three and six, and the Coach gave it craft 100 / style 96. An
                   independent review then marked it down for exactly that monotony, and
                   the owner ruled that slide-to-slide variety is critical: a deck should
                   read as a storyboard of different pictures. review-core.js checks
                   heading cadence (`monotone-openings`) but nothing checks layout
                   cadence, so the machine gate and the human bar disagree.
       done when — reviewText emits a suggestion when two adjacent content slides share a
                   `_class`, or when one layout covers more than about a quarter of the
                   content slides, and scoreDeck's style (or pacing) score counts it
                   through the same saturating curve as the other findings. A test pins
                   both arms: the deep dive at 78489c4 is flagged, and the deck at the
                   commit that varied its layouts is not.
       evidence  — `git show 78489c4:examples/semantic-testing-deep-dive.md`: slides
                   50–55 are six `table table-fill` slides in a row.
       verify    — tier 0: node --test on the review-core and scorecard unit tests; then
                   `npm run lint:deck` over examples/ to count how many shipped decks
                   the new rule flags before choosing its thresholds.
```
