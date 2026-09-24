---
origin: 2328
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2328
---

# Close two small axis-grammar gaps the checkers left open

```text
why now   — (1) slide-speech.js blankHtmlComments may treat a literal `<!--` inside inline
            code as a comment opener, the defect lint's blankCommentSpans had and #2328 fixed;
            unconfirmed. (2) an axis list with more members than its component has axes
            prints as text, and only quadrant's lint names it; scatter/matrix-grid/gantt are
            silent.
where     — lib/core/slide-speech.js blankHtmlComments; lib/authoring/lint-core.js (a
            component-generic over-cap rule driven by axisSetFor).
done when — (1) confirmed or refuted with a repro, fixed if real; (2) one rule covers every
            component that declares axisSet.
evidence  — a repro for (1); lint output on an over-cap scatter list for (2).
verify    — tier 0 gates.
```
