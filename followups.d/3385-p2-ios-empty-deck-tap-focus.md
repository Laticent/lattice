---
origin: 3385
priority: P2
recorded: 2026-11-22
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — met on #3385's iOS dispatch, but #3385 does not touch the empty-deck tap; the flake desk assigned it to this session on its own branch from main after #3385's probe fix lands (2026-11-22)
source: https://github.com/Laticent/lattice/pull/3385
---

# The empty-deck tap failed once to give the Compose editor the focus on the iPhone simulator

why now   — one occurrence: platform-suites run 44973877783, job 137060162549 (ios-safari-studio-iphone at b90f4b7). The
            empty-deck tap probe's single delivery at 6,349 landed on the start grid (`DIV.absolute.inset-x-0 "Start your
            deckPick"`), but the editor never took the focus (active: empty) and no caret sat in the empty line. pointerdown
            came at +24 ms and pointerup at +264 ms of listener lag. The same step passed on every other Studio run that day,
            on both devices and both PRs (#3368's 7751b2b and 5fe0e9e, #3385's 7bb2314 and 1e89f0c), and on main's 11-21
            nightly.
where     — docs/scripts/ios-safari/run.mjs `emptyDeckTap` and docs/scripts/ios-safari/empty-deck-probe.js; the start grid's
            canvas handler in the Studio's Compose empty-deck state (2026-11-17-compose-empty-deck.md).
done when — the cause is named: the flake desk's first lead is a read too early (F3), the tap made before the empty-deck
            overlay reached its settled state; and #3288 (merged 11-17, closing #3273's iOS empty-deck tap items) is read
            first so the fix extends its approach (#15). Fixed at the cause, or, if it does not reproduce, the probe logs
            what will name it next time, as 3368-p1 does for the first-render stall.
evidence  — the run and job above; the tap log line in that job.
verify    — the iPhone and iPad ios-safari-studio suites, dispatched ten times; the tap log on any failure.
