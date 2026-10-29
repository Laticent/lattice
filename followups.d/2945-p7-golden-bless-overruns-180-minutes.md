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
