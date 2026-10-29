---
origin: 2945
priority: P7
recorded: 2026-10-29
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-06-goldens-bot-blessed.md
deferred: blocked — clearing the backlog means merging or closing bless PR #2751, and a re-bless cap is a new number; both are the owner's
source: https://github.com/Laticent/lattice/actions/runs/40646134972
---

# The golden-bless nightly is cancelled at its 180-minute cap because drifted goldens pile up

status    — narrowed 2026-10-29 (owner's pick D2-A on #2973): re-blessing now stops starting new
            items after an hour (`BLESS_BUDGET_MS`, tools/lib/golden-bless-verdict.mjs), reports
            how many wait as a deferred line, and prints progress per item. What is left is the
            owner's half: merge or close #2751, then a scheduled run that finishes.
status    — SECOND LOOK 2026-10-29 (run 40914407337, dispatched on main at 242de4a, which carried D2-A):
            still CANCELLED at the 180-minute cap, because the hour is counted from the start of the
            re-bless phase and the phase before it is not short. The check phase took 125 minutes
            (16:47:53 to 18:53:11), 369 re-blesses were due, 259 finished (7 to 10 seconds each, not the
            28 and 12 the budget was sized on), and the cap hit at 19:45 with the budget not yet spent.
            Fixed: `BLESS_DEADLINE_MS` (160 minutes from the process start) stops new re-blesses
            whatever the hour says, leaving 20 of the 180 for the missing-golden renders, the showcase
            builds, the artifact upload and the PR. At the 125-minute check that is about 35 minutes of
            re-blessing, roughly 200 items. The margin after the deadline is a measurement,
            not a guess: on the last green run (40167488191, 2026-10-25) the renders and builds that follow the
            re-blesses took 4 minutes 5 seconds (08:25:42 to 08:29:47 in the step's log), and the upload and PR
            took 22 seconds, against the 20 minutes the deadline leaves. A run on a branch cannot show the
            fix: the `automation` environment refuses anything but `main` (run 40954627889 failed in one
            second). A scheduled run on main must still finish and open a fresh
            bless PR before this item closes; #2751 is still the owner's to merge or close.
why now   — Green through 2026-10-25 at 2h28m; cancelled on 10-26, 10-27 and 10-28. The check
            phase finishes; the re-bless phase then re-renders every drifted deck in its own
            `regression-gate --bless --only` process with no cap (`tools/golden-bless.mjs:215-222`),
            and drift grew from 219 of 431 decks (10-25) to 378 of 430 with 516 drifted themes
            (10-28). The bless PR #2751 has been open since 10-17 and nothing merges it in the dry
            run (issue #2737), and #2905 restyled every chart. Not the ubuntu-24.04 pin: these runs
            already used that image.
where     — `tools/golden-bless.mjs` (`MISSING_CAP = 40` at `:85` covers first renders, not
            re-blesses), `.github/workflows/golden-bless.yml:47`.
done when — #2751 is merged or closed so the backlog clears, and the re-bless phase has a cap like
            `MISSING_CAP` that names what it left for the next night and prints progress, so a
            cancelled run shows how far it got.
evidence  — the run's `check.json` artifact (378/430 drifted on 10-28); runs 40167488191 (green,
            10-25) and 40646134972 (cancelled, 10-28).
verify    — tier 1: a unit test in the `tools/lib/golden-bless-verdict` style for the cap, then a
            scheduled run that finishes.
