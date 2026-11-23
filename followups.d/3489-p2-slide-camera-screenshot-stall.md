---
origin: 3489
priority: P2
recorded: 2026-11-23
area: engine
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — 0 of 13 failures here (alone and four-way parallel under CPU load); the one failure left only Puppeteer's protocol timeout, no trace of what Chrome was doing
source: https://github.com/Laticent/lattice/pull/3489
---

# slide-camera.test.js: Chrome's element screenshot stalled 180 s on examples/print-mode.md

why now   — it ejected #3489 (a one-note docs change) from the merge queue: run 45233518558, job 137899246981,
            integration shard 3/4. "the slide camera matches Chrome's own screenshot: examples/print-mode.md" failed at
            193 s with `Page.captureScreenshot timed out` (Puppeteer's 180 s protocolTimeout), from
            `CdpElementHandle.screenshot` at test/integration/export/slide-camera.test.js:64. The queue runs just before
            and after (#3479, #3486, #3481) passed the same shard. No issue, follow-up or claim named it.
where     — the oracle side of the test, `h.screenshot({ type: 'png' })` after `scrollIntoView`. It is Chrome's own
            capture, not the slide camera under test.
measured  — 8.3 s alone; 12 of 12 green running four copies at once with four CPU-burning loops (13–14 s each). It is
            a stall, not slowness: a passing run is under 15 s against the 180 s that timed out.
done when — the stall is caught with Chrome's state recorded: pass `protocolTimeout` lower than the test's own 240 s
            and dump the page's state (or a CDP `Page.captureScreenshot` with `fromSurface`/`captureBeyondViewport`
            noted) when it trips. Then fix the cause, and add the HARD RULE #34 runs.
evidence  — a failing integration run with that dump.
verify    — tier 0 plus the #34 runs on the integration tier.
