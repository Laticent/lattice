---
origin: 2997
priority: P3
recorded: 2026-11-02
area: engine
severity: low
swimlane: engineering/fluid.md
deferred: off-path — stale on main before #2997; re-blessing 80 decks' page hashes needs each drift explained, which is its own review
source: https://github.com/Laticent/lattice/pull/2997
---

# `npm run split:golden:check` fails on main: 285 page-hash drifts across 80 decks

why now   — the split-pages oracle (test/oracle/split-pages.json) was last blessed in #2923 (2026-10-28) and no gate
            runs the check, so it drifted silently. Measured on origin/main and on #2997 (after its walker fix, which
            restored the 28 chart decks the check had stopped reading): the same 285 drift lines on both, mostly
            non-chart galleries (quote, split-panel) at portrait and mobile. #2997 adds no drift of its own.
where     — tools/split-pages-golden.js; test/oracle/split-pages.json; whichever changes since #2923 moved split pages.
done when — each drift is attributed to an intended change and the oracle re-blessed, or a real regression found and
            fixed; and the check runs somewhere (a nightly), so it cannot drift silently again (a CI change: owner's
            call).
evidence  — `npm run split:golden:check` exit 0
verify    — npm run split:golden:check
