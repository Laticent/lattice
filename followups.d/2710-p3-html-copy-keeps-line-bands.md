---
origin: 2710
priority: P3
recorded: 2026-10-15
area: code
severity: low
swimlane: engineering/decisions/2026-10-15-code-plugin.md §9
source: https://github.com/Laticent/lattice/pull/2710
---

# "Copy as HTML" drops a diff line's band and a marked line's tint

why now   — `styledOf` in lib/core/code-copy.mjs writes each text run's computed color and the background of the run's own element, never the background of its `.ln` row. A `diff` block's inserted/deleted bands and a `mark=` line's tint live on the row, so a pasted block keeps its token colors and loses those bands. Found by the checker on #2710; cosmetic.
where     — lib/core/code-copy.mjs `styledOf`; the row rules in lib/plugins/code/code.styles.css (`[data-diff]`, `.lat-mark`).
done when — a pasted diff or marked block shows its line bands, by wrapping each `.ln` row's runs in an element carrying the row's computed background, or the decision not to is recorded.
evidence  — a paste of `@code{copy, diff}` into a rich-text editor, before and after.
verify    — test/unit/core/code-copy.test.js, an arm on the HTML payload of a diff block.
