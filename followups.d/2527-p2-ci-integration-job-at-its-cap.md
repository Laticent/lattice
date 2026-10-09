---
origin: 2527
priority: P2
recorded: 2026-10-06
area: infra
severity: high
swimlane: engineering/development.md
---

# CI's integration (node 22) job runs at its 25-minute cap, and a capped run reads green

```text
status    — the owner picked the split (2026-10-09): branch `claude/ci-shard-integration` runs
            the slice as four `--test-shard` legs, 25 min cap each. The merge queue already
            fails a `cancelled` tier; the PR run still passes one, with the reason in ci.yml's
            Verify gate. Done once the table below is re-measured on the sharded legs.
why now   — measured on the 11 newest completed merge-queue runs of ci.yml (2026-10-05 21:17Z
            to 2026-10-06 03:18Z): the integration (node 22) job's median is 25.0 min and its
            max 25.3. 8 of 11 ran within 2 min of the cap or hit it. Six ended `cancelled` at
            about 25 min, and two of those (37405868635, 37371538187) show the test step
            itself as success, so the cap fired after the tests had finished. The fast runs
            took 16.7 and 17.2 min. ci's gate counts `cancelled` as passing, so a capped run
            reads green; whether it ran every test is not checked.
            | run         | job min | conclusion | test step | run end to end |
            | 37408319982 | 24.5    | success    | 23.1      | 25.9 |
            | 37405868635 | 25.1    | cancelled  | 23.6      | 27.4 |
            | 37405777780 | 17.2    | success    | 15.9      | 18.8 |
            | 37387813775 | 25.3    | cancelled  | 23.6      | 28.1 |
            | 37381298486 | 16.7    | success    | 15.5      | 19.2 |
            | 37375745821 | 25.2    | cancelled  | 23.7      | 35.2 |
            | 37375556878 | 25.3    | cancelled  | 23.6      | 31.4 |
            | 37375555075 | 25.2    | cancelled  | 23.6      | 40.8 |
            | 37375044401 | 24.8    | success    | 22.7      | 40.6 |
            | 37374986938 | 20.6    | success    | 19.2      | 31.3 |
            | 37371538187 | 25.0    | cancelled  | 23.4      | 39.2 (run failed) |
where     — .github/workflows/ci.yml: the integration job's timeout-minutes, the ci gate's
            `cancelled` allowlist, and the test:integration:pr slice.
done when — the owner picks one of: raise the cap; split the slice across two jobs; speed the
            slice up. Separately, the gate stops counting a `cancelled` integration job as a
            pass, or the decision to keep it is written down with its reason.
evidence  — the table above, and the same table re-measured after the change.
verify    — a CI-contract change: the owner's call (CLAUDE.md second filter, row 2).
```
