---
origin: 2328
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2328
---

# Derive the axis/key body boundary in lint from markdown-it tokens, not a second regex model

```text
why now   — three checker passes found shapes where lint:deck's source-line body detector
            (`bodyOpens` in findLabelSetIssues, and findQuadrantAxisIssues' list-line test)
            disagreed with the render's boundary (the first body tag markdown-it emits).
            Each was patched; the class of bug stays open while two models exist.
where     — lib/authoring/lint-core.js findLabelSetIssues + findQuadrantAxisIssues;
            lib/core/lift-bracket-span.js bodyIndex is the render's model.
done when — lint and the render compute the boundary from the same token stream, and an
            axis code span wrapped across two source lines is seen by lint and narration
            (today only the render lifts it).
evidence  — a table of source shapes (comment, blockquote, pipeless table, wrapped span,
            HTML block) with lint verdict == render slot for each.
verify    — tier 1 checker: lint-core is browser-bundled and reads untrusted markdown.
```
