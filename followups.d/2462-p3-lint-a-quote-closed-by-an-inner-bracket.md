---
origin: 2462
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2462
---

# Warn on a quoted part closed by a stray inner `]`

why now   — #2462's red team: the bracket-list fix (298bd420e) changed how two TYPOS read.
            `["Cost, excluding tax"]]` read as 1 part before and 2 now; both readings were
            already wrong, and no well-formed input changed (300k fuzzed lists, 557
            differences, all this doubled-bracket shape). An author should hear about it.
where     — lib/authoring/lint-core.js (HARD RULE #7); lib/core/bracket-list.js.
done when — `lint:deck` warns on a quote followed by `]` inside a bracket list that goes on.
evidence  — the two red-team inputs in a lint test.
verify    — tier 1.
