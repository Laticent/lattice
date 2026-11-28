---
origin: 3606
priority: P1
recorded: 2026-11-28
area: docs
severity: medium
swimlane: spec/diagnostics.md
deferred: blocked — #3554 (spec desk) rewrites rows 160/166/183/272 and #3607 rewrites row 440 with its lint-core rule; both are open PRs
source: https://github.com/Laticent/lattice/pull/3606
---

# The diagnostics table still describes slide comments the @meta cut retired

After #3563 the engine reads only `<!-- @meta{…} -->` records, and lint-core reports every old comment as
`legacy-directive-comment`. Five rows of `spec/diagnostics.md` (projected to
`docs/src/content/docs/spec/diagnostics.md`) still describe an old comment as current. #3606's guard holds each with a
TEMPORARY count in its `SANCTIONED` table, which fails once the row is fixed.

| Docs line | Rule | Old form |
|---|---|---|
| 160 | `track-directive` | `_track:` |
| 166 | `one-stepping-directive` | `_build` |
| 183 | `code-line-range` | `_focus: line` |
| 272 | `unknown-debug-facet` | `<!-- _debug: -->` |
| 440 | `meta-class-overridden` | "a `_class:` comment" |

`meta-class-overridden` also needs the rule: `lib/authoring/lint-core.js:1100-1104` still counts a `_class` comment as a
class setter.

done when — each row names the record field (`track=`, `build=`, `focus=`, `debug=`, `class=`) or names the old form as
history, and the `_track`, `_build`, `_focus`, `_debug` and `_class` counts leave the `diagnostics.md` entry.
