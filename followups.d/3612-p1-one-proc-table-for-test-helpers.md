---
origin: 3612
priority: P1
recorded: 2026-11-28
area: infra
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — test/helpers/chrome.js launch diagnostics, shared by many integration suites
---

# Two test helpers each parse /proc/<pid>/stat

why now   — `test/helpers/spawn-progress.js` (`statFields`, `treeCpu`) and `test/helpers/chrome.js`
            (`describeDescendants`) both walk `/proc` and split each `stat` line after its last `)`.
            Two copies of a fiddly parse drift apart (HARD RULE #15).
where     — test/helpers/spawn-progress.js, test/helpers/chrome.js
done when — one exported reader (pid, ppid, state, CPU ticks, start time) serves both, and
            `describeDescendants` keeps its output byte for byte
evidence  — tools/flaky-test-helpers tests green; a `launchOrExplain` diagnostic line unchanged
verify    — tier 1 checker, because chrome.js runs in every render-backed suite
