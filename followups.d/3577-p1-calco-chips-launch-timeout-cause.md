---
origin: 3577
priority: P1
recorded: 2026-11-27
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-27-shared-chrome-for-tests.md
deferred: blocked — the timeout did not reproduce in 4,469 timed launches; it waits on a recurrence that prints a `launch diagnostics:` line
source: https://github.com/Laticent/lattice/pull/3577
---
# Find what held calco-chips' Chrome launch for 30 s

why now   — `calco-chips.test.js` once failed in its `before` hook with "Timed out after 30000 ms while waiting
            for the WS endpoint URL" (7 canceled), during `test:integration:pr` beside a repo clone and `npm ci`.
            PR #3577 ran five reproductions (4,469 launches, max 1.93 s, no failure) and found no cause. It ruled
            out D-Bus, fontconfig, disk space, `/dev/shm` and leaked profiles on its sandbox. The test passes;
            HARD RULE #33 keeps the cause owned until it is known.
where     — `test/integration/export/calco-chips.test.js` launches through `launchOrExplain`
            (`test/helpers/chrome.js`), which appends the machine's state to a launch failure.
done when — a recurrence's `launch diagnostics:` line (wait, load, free memory, Chrome processes, temp space)
            is read, and the cause it points at is fixed at that cause, or the line shows none of those fields
            explains it and the helper gains the field that would.
evidence  — the failing run's log with its diagnostics line, and the fix's #34 arms.
verify    — `node tools/shared-chrome-lab/launch-probe.mjs` beside the condition the line names.
