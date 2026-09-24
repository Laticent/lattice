---
origin: 2331
priority: P4
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2331
---

# The Studio compose editor's CSS carries the #2308 selector defect

```text
why now   — #2331 fixed `:has(> code:only-child)` matching a sentence with one code span across the engine bundle; the Studio compose editor has its own copy of the pattern and was out of scope.
where     — docs/src/components/studio/ComposeView.tsx:2047 (`.cs-host p > code:only-child`).
done when — a compose paragraph mixing prose and one code span keeps its normal code styling, or the rule is shown to be intended there.
evidence  — a screenshot of the compose view with the "The `background:` shorthand…" sentence, before/after, at the three widths (tools/screenshot.js).
verify    — self-review; docs-site UI change.
```
