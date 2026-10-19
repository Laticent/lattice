---
origin: veduta-map
priority: P3
recorded: 2026-10-19
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-preview-as-library-audit.md
source: engineering/decisions/2026-10-16-preview-as-library-audit.md#11g
---

# The deck outliner drops an empty slide the engine renders, so editors that count by outline unit miss it.

`'# A\n\n---\n\n---\n\n# C\n'` renders three slides and the outline holds two units. The outliner drops an
empty chunk on purpose (`splitSlides`'s unit model, which every slide-indexed editor caller relies on), and the
engine renders the blank slide, so the two lists disagree from the blank slide on.

```text
  why now   — the slide map reads both lists. The rendered index (docs/src/lib/rendered-index.ts) now finds the blank
              page from its markup (`blanksOf`) and gives it no part, so the map places every other page correctly
              (tested through the real engine). What remains is the outline itself: a blank slide is not a unit,
              so the Studio's pills and counters skip it while the PDF counts it.
  where     — docs/src/lib/deck-outline/deck-outline.ts (the unit model) or a blank-slide mark in the rendered index.
              The failing arm is `it.fails` in docs/src/lib/rendered-index.test.ts: it goes red the day the outline
              counts the blank slide, which is the cue to delete it.
  scope     — measured: 0 of the 292 example and baseline decks hold an empty slide, so no shipped deck is affected.
              An author who types `---` twice in a row is.
  done when — either the outline keeps an empty chunk as a unit (and splitSlides' callers are audited for it), or the
              rendered index finds the blank page itself (an empty section) and gives it no part.
  evidence  — the `it.fails` arm flips, plus a Playground e2e that picks the slide after a blank one.
  verify    — tier 1 checker; the outline is read by every Studio editor path.
```
