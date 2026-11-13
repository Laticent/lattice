---
origin: 3194
priority: P3
recorded: 2026-11-13
area: engine
severity: low
swimlane: engineering/decisions/2026-10-26-squadra-lint-library.md §6
deferred: off-path — older than PR #3194 and not in a rule it moved; found by its maker-checker review
source: https://github.com/Laticent/lattice/pull/3194
---

# The `paginate-comment-retired` fix deletes a whole line that also holds another comment

why now   — Fix all on `<!-- _paginate: false --> <!-- _class: cards banner-tag -->` deletes the line, so the class
            directive goes with the retired comment.
where     — `lib/authoring/lint-core.js` `fixReplacement`, case `paginate-comment-retired` (returns `''`).
done when — the fix removes only the retired comment when the line holds anything else.
evidence  — a test in `test/unit/authoring/` with the line above, before and after.
verify    — self-review with the gates.
