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
update    — 2026-10-11: the legs ran 9:43 / 5:42 / 7:05 / 3:51 (test step, run 38125793642; 1.49x mean).
            `tools/shard-tests.js` now deals files by committed per-file seconds (modelled 1.00x). STILL OPEN:
            confirm the spread on real runs (>=5, target slowest leg <=1.2x mean) and re-derive the 25 min cap.
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

## Re-measured 2026-10-12 — five real queue runs after #2629 (shard spread)

Test-step time per leg (`Integration tests (PR slice, one shard)`), mm:ss; spread = slowest / mean.

| run         | shard 1 | shard 2 | shard 3 | shard 4 | spread | slowest job (setup incl.) |
| 38254870711 | 6:22    | 7:07    | 6:19    | 6:33    | 1.08x  | 9:00 |
| 38272823518 | 6:15    | 6:44    | 5:51    | 5:07    | 1.12x  | 8:58 |
| 38273528557 | 5:08    | 6:49    | 5:03    | 7:40    | 1.24x  | 9:34 |
| 38284063058 | 6:34    | 5:06    | 3:49    | 6:29    | 1.20x  | 8:15 |
| 38294389459 | 5:35    | 5:44    | 4:14    | 5:44    | 1.08x  | 7:27 |

- Four of five runs are at or under 1.2x; the mean is 1.14x. Run 38273528557 is 1.24x: shard 4's `npm ci` and
  build were also slower there (0:30 + 0:44 vs 0:21 + 0:27 in shard 1 of the same run), so part of it is
  runner speed, not file balance. The balance itself is sound; the done-when ("<=1.2x on >=5 runs") is met in
  4 of 5, not 5 of 5. Re-bless is not indicated: the slow leg changes from run to run (shard 4, 1, 2, 2, 2).
- Slowest whole job in the five runs is 9:34. The 25-minute cap is 2.6x that. The method note in `ci.yml`
  sets caps near 3x, so 25 min is inside the house range; lowering it to 20 min (2.1x) is possible but is
  the owner's call and buys nothing today.
- Note the weights file does not model the setup steps (about 2.5 min of every job).
