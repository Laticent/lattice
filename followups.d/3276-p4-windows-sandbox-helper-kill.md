---
origin: 3276
priority: P4
recorded: 2026-11-17
area: infra
severity: low
swimlane: engineering/workflow.md
deferred: off-path — reap()'s kill predates #3276, which only adds the retry; reaching Chromium's helper processes on Windows needs a job object or a tree kill, a design change of its own
source: https://github.com/Laticent/lattice/pull/3276
---

# On Windows, reap() kills only the browser's main process

why now   — #3276's card checker. `reap()` in lib/cli/code-door.js kills a killed worker's browser with `process.kill(-pid)` and then `process.kill(pid)`. On Windows there are no process groups, so only the main process dies; Chromium's helper processes can live on and hold files in the profile. #3276's `removeProfile` retries for about 5.5 s, which covers helpers that exit with their parent, but a helper that lives longer still makes the removal throw EBUSY.
where     — lib/cli/code-door.js `reap()` (~L177-196); lib/core/os-sandbox.js `removeProfile`.
done when — on Windows, `reap()` ends the whole browser process tree (for example `taskkill /T /F /PID <pid>`, or a job object at launch) before it removes the profile, and a Windows test kills a worker mid-render and finds no profile folder left.
evidence  — Node's `process.kill` on Windows terminates one process; `-pid` throws there. #3276's HELD PROFILE test shows a held file blocks removal until the holder lets go.
verify    — dispatch platform-suites `suites=os-sandbox-measure` with a test that SIGKILLs the worker mid-render on windows-2025, then list %TEMP% for `lattice-code-sandbox-*`.
