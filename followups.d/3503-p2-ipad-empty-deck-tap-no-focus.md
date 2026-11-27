---
origin: 3503
priority: P2
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-17-compose-empty-deck.md
deferred: blocked — needs a failing iOS-sim run that carries the fallback-timer log this PR adds; a healthy simulator does not produce the failure
source: https://github.com/Laticent/lattice/pull/3503
---

# iPad: a tap on the empty deck's start grid got no click and no focus

why now   — platform-suites dispatch run 45238975828, job ios-safari-studio-ipad (137920664351), head 81f62d8. The step
            "empty deck tap" failed: a 42 ms tap with listeners about 99 ms late; pointerdown, touchstart, pointerup and
            touchend on the start grid; then no mousedown, no click and no focusin for the 4 s the probe waits. The
            simulator was unhealthy in that job (Safari launch 68 s, the first WebDriver session timed out, `simctl
            terminate` ETIMEDOUT). Handed to the flake desk by Segno Worker B; the command center kept it there.
where     — the grid's touch-release fallback, docs/src/components/studio/StudioShell.tsx `armStartGridFallback`
            (START_GRID_CLICK_WAIT_MS 500): when Safari withholds a tap's click, a 500 ms timer puts the caret. In the
            failing run it did not, so the timer never armed, or fired late on a starved main thread, or fired and the
            focus did not take. A later press cancelling it is ruled out: the tap log shows none.
measured  — with this PR's probe log, a healthy iPad simulator (dispatch 45250083697, job 137959483215):
            - the normal tap: `timer500-set@64`, then the click at 97 ms took the focus (the timer was cancelled);
            - the withheld tap: no click came, `timer500-fire@571`, `focusin@573` in the editor, caret in the line.
            So the fallback works when the simulator is healthy.
done when — a failing run's log shows which of the three it was. Then fix that: a starved timer would want the caret
            put on the release itself once the click is known to be late, or a longer-lived retry; a timer never armed
            would point at `onPointerUp`'s guards. Do not relabel the probe's verdict to hide it (tap-guard.mjs).
evidence  — the next iOS-sim nightly or dispatch where "empty deck tap" fails, read for timer500-set/-fire.
verify    — tier 0 plus an iPad dispatch; a real iPad stays UNVERIFIED unless the owner checks one.
