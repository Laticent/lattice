---
origin: 2219
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2219#issuecomment-5673123505
backfill: true
---

# Restore the split-panel coverless band chrome, and remove the pointer-suppression guard #2219 shipped in its place.

Backfilled verbatim from the continuation brief on #2219 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Restore the split-panel coverless band chrome, and remove the
       pointer-suppression guard #2219 shipped in its place.
       why now   — it is the only thing between today's engine and the wayfinding
                   the variant work was for; the suppression guard is a stopgap
                   that should not outlive it.
       where     — cut a FRESH branch from the merged main (do NOT continue
                   claude/component-autosplit-processor-p8jg3m — #17 bars stacking,
                   and it predates the merge). Cherry-pick or copy from that branch:
                   the 339-line band region of
                   lib/components/statement/split-panel/split-panel.styles.css,
                   test/unit/css/split-panel-coverless-band.test.js,
                   test/unit/css/split-panel-rail-ink.test.js, and the
                   tools/check-ownership.js sanction. Then delete the
                   `coverlessSplitPanel` guard in lib/core/auto-split.js
                   (applyRelationshipSignals) and re-measure the third-column case.
       done when — the pointer clears both edges on all 5 variants × 6 palettes with
                   the chrome present, the guard is gone, and no content panel is
                   crushed at portrait.
       evidence  — rendered PDF of examples/autosplit-coverage.md in BOTH dark and
                   light, sent with SendUserFile, plus tools/pixel-check.js. The two
                   restored test files are gates, NOT evidence (#23).
       verify    — tier 2, the adversarial trio, because this is exactly the code
                   whose instruments failed GREEN four times in the same family
                   (ancestry is not overlap; a layout rect is not painted ink; a
                   text range is not a filled box; a padding box is not a content
                   box). Read the decision record's round 3-10 arc BEFORE trusting
                   either test file — both were rewritten after passing a mutant.
```
