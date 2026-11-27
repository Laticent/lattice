---
origin: 3489
priority: P2
recorded: 2026-11-23
area: engine
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — the stall has not happened again in 0 of 33 file runs and 600 hammered captures here; the test now reports Chrome's state when it trips, and the next CI failure is the evidence this needs
source: https://github.com/Laticent/lattice/pull/3489
---

# slide-camera.test.js: Chrome's element screenshot stalled 180 s on examples/print-mode.md

why now   — it ejected #3489 (a one-note docs change) from the merge queue: run 45233518558, job 137899246981,
            integration shard 3/4. "the slide camera matches Chrome's own screenshot: examples/print-mode.md" failed at
            193 s with `Page.captureScreenshot timed out`, from `CdpElementHandle.screenshot`. That is the oracle side:
            Chrome's own capture, not the slide camera under test. `puppeteer.launch` set no `protocolTimeout`, so
            Puppeteer's 180 s default applied. The queue runs just before and after (#3479, #3486, #3481) passed the
            same shard.
done so far (2026-11-27, fix/slide-camera-oracle-capture) —
            1. The oracle captures with `captureBeyondViewport: false`. Puppeteer's element screenshot defaults to
               `true`, which makes Chrome override the page's device metrics to the whole document for each shot and
               restore them after: one resize event per shot, measured 6 of 6, and at scale 2 the override lands right
               after the test's own `setViewport`. That was the only part of the oracle path that changed Chrome's
               state mid-capture. With `false` the pictures are byte-identical (60 shots, four decks, both scales) and
               no resize fires. It is the prime suspect, not a proven cause: nothing here reproduced the stall with
               it on.
            2. `protocolTimeout: 60_000` (a whole passing test takes 8–15 s) and a hang report: on a failed oracle
               capture the error carries the page's `visibilityState` / `hasFocus` / `readyState` / viewport, the
               slide's box, the browser's target list, and a fresh `Page.captureScreenshot` on a new CDP session with
               `fromSurface: true, captureBeyondViewport: false` and the clip, each probe bounded at 10 s.
measured  — no stall in: 600 element captures with `captureBeyondViewport: true` alternating scale 1 and 2, four
            processes against four CPU-burning loops (worst capture 525 ms); 5 runs of the file alone (37–39 s for all
            five tests); 20 runs four at once (47–51 s each). Earlier: 13 of 13 green (8.3 s alone, 13–14 s loaded).
what the report will say — how to read the next failure:
            - `state` and `box` answer, `freshCapture` answers: Puppeteer's own call was stuck, not Chrome. Look at the
              step named in the error.
            - `state` and `box` answer, `freshCapture` says "no answer": the renderer runs but the compositor gives no
              frame. Check `visibility` and `hasFocus` (a hidden or background page draws no frames) and the target
              list (a second page in front).
            - nothing answers: the renderer's main thread is stuck, which is what holding it on purpose produced here
              (DOM.describeNode timed out at 60 s, report back at 105 s, inside the test's 240 s).
done when — the report names the cause on a real failure, and the fix lands there. If a month of nightlies and queue
            runs passes with no stall, step 1 was the cause: delete this file.
evidence  — a failing integration run with the report in its error.
verify    — the HARD RULE #34 runs on the integration tier.
