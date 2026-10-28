---
origin: 2921
priority: P2
recorded: 2026-10-27
area: website
severity: medium
swimlane: engineering/development.md
source: https://github.com/Laticent/lattice/pull/2921
---

# Two e2e specs fail on `main` (34b07aa) in the cloud sandbox

why now   — found while running the neighbors of PR #2921. Both fail on a `build:e2e` of `main` with this PR's changes
            removed, so the PR did not cause them. The e2e suite is nightly, so a red arm here goes unseen per PR.
where     — docs/e2e/playground-stress.spec.ts:274 "Explore → Edit → Explore comes back to the same slide" (desktop,
            failed 2 of 2 on base and 3 of 3 on the PR head: the slide after the round trip is not 6);
            docs/e2e/plugin-admission.spec.ts:168 "under defaults: [] the rail splits a `$$` block as the engine does"
            (desktop, a `toContain` on the Marp bundle).
decided   — nothing. Root-cause each; whether either reproduces on the nightly runner is unknown.
done when — both pass on a fresh `build:e2e` of `main`, or each has a root cause in a decision note.
evidence  — the failing assertion and its trace for each, before and after.
verify    — tier 1 self-review with the gates.
