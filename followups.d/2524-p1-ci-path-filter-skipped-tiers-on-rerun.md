---
origin: 2524
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/actions/runs/37368507308
---

# CI's `changes` job sometimes gets no runner and ends canceled

why now   — the gate hole this item was filed for is closed in the same PR: the `ci` gate now fails when `changes` did not succeed (`engineering/gotchas/ci.md` §The `ci` check is green on a PR whose test tiers never ran). The cause stays open, and with the gate closed it now costs a red run or a merge-queue ejection instead of a silent pass. On 2026-10-05 `changes` sat queued with no runner (`runner_id: 0`, no log) for 15-19 minutes and ended `cancelled` in both attempts of #2524's PR run (37368507308) and in the queue groups for #2525 (37371326188) and #2535 (37366133406). The jobs API does not say who or what canceled it.
where     — `.github/workflows/ci.yml`, the `changes` job; the jobs API for the runs above; githubstatus.com for that evening.
done when — the no-runner cancel has a named cause (a GitHub incident, a concurrency or queue setting, or a hand cancel) or a measured rate low enough to accept.
evidence  — the run IDs above, plus whatever names the canceler.
verify    — tier 1: maker-checker if `ci.yml` changes. Adding, moving or splitting a CI job is the owner's call (CLAUDE.md second filter, row 2): bring options.
related   — the integration tier's timeout and the queue's handling of a `cancelled` tier are 2494-p1 and 2521-p2.
