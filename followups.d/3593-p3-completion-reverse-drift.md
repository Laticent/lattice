---
origin: 3593
priority: P3
recorded: 2026-11-28
area: engine
severity: low
deferred: blocked — on #3593's branch the lint parser predates `--fit` (#3362), so a reverse check goes red there until the branch meets main; the gap is older and covers all five verbs
swimlane: test/unit/cli/completion.test.js
source: https://github.com/Laticent/lattice/pull/3593
---

# Tab completion's drift tests check one direction only

```text
  P3 · [no ticket] assert Tab offers nothing a parser refuses
       why now   — #3593's checker found it. The drift tests in test/unit/cli/completion.test.js
                   prove every flag a parser accepts is a Tab candidate (`missing(...)`), but
                   not the reverse. Remove `--fit` from lib/cli/lint-deck.js and Tab still
                   offers it; the user gets "unknown option" and no test goes red. The same
                   gap covers the render command, `packages`, `video`, `lint`, `fmt` and both
                   `migrate` forms.
       done when — for each verb, every flag Tab offers is in that parser's accepted set
                   (offered ⊆ accepted), with a failing arm: a table row the parser refuses
                   is reported.
```
