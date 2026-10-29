---
origin: 2966
priority: P1
recorded: 2026-10-29
area: engine
severity: low
swimlane: engineering/decisions/2026-10-26-squadra-lint-library/design.md §15.4
deferred: off-path — the report of each rule's detector, which this PR did not touch beyond the four list-shape rules; Fix all no longer edits a fenced line for any rule
source: https://github.com/Laticent/lattice/pull/2966
---

# Some lint rules still report a line inside a code fence

why now   — PR 2966 made `fixLineIndex` skip fenced lines, so no fix edits a fenced example, and stopped the
            card, ledger, split and number-slot rules from reporting fenced examples. Other rules still read
            past fences when they REPORT: the fix diff's fourth corpus shows `gantt-retired-delimiter`
            flagging a fenced copy of a gantt line (a finding with no fix now, where it used to be "fixed" by
            rewriting the example). A fenced sample of the wrong form is documentation, not a slide.
where     — lib/authoring/lint-core.js: each detector that splits `slide` into lines without
            `stripFencedCode` (start with the gantt rule, search `gantt-retired-delimiter`); the audit is
            `npm run squadra:fix-diff`'s corpus 4, read for findings left on fenced lines.
done when — no lint rule reports a line inside a code fence unless the rule is about fences; corpus 4 of
            the fix diff leaves no fixable finding on any line, fenced or live.
evidence  — the fix diff report's "fixable findings left" falling to 0 on corpus 4.
verify    — tier 0: the fix diff and the lint unit tests.
