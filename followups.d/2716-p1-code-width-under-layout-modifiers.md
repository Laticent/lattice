---
origin: 2716
priority: P1
recorded: 2026-10-16
area: code
severity: low
swimlane: engineering/decisions/2026-10-15-code-plugin.md §11
source: https://github.com/Laticent/lattice/pull/2716
---

# `code-line-clipped` judges a `split` or `grid` slide against the full-width plain pane

why now   — #2716 gave plain slides a measured code budget (`content`: 102 / 58 / 36 / 36). A `_class` made only of modifiers counts as a plain slide, but `split` and `grid` are modifiers that narrow the column a fence sits in, so a line that is cut off there lints clean. It is a silence, not a false alarm (found by the checker on #2716).
where     — lib/authoring/lint-core.js `codeClipFindings` (the `layoutless` test) and `CODE_LINE_BUDGET`; Tier 2 of test/unit/components/code-line-width.test.js measures the panes.
done when — every modifier that changes a fence's column width either has a measured budget or makes the rule stand down (as `STAGE_RESIZING_MODIFIERS` does), and Tier 2 measures each one.
evidence  — Tier 2's browser measurement for each such modifier at every @size, plus a lint arm per modifier.
verify    — tier 0 gates: a lint rule with a browser-measured table, no shared-kernel change.
