---
origin: 2909
priority: P2
recorded: 2026-10-26
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md § a canceled green beacon
source: https://github.com/Laticent/lattice/actions/runs/40321461646
---

# The `ci` gate job concluded success while integration shard 3/4 was cancelled

why now   — On #2909 head `aa0302c`, integration shard 3/4 hung for 23 minutes (most likely
            a bundling error that left the new test's server open, so node:test never exited; the
            orphaned esbuild in the job log fits, the hang itself was not reproduced) and was cancelled; the `ci` job's "Verify gate" step then
            concluded success and the green beacon read "ran: lint · unit · docs-build; cancelled:
            integration". A cancelled shard ran none of its remaining tests, so the gate certified
            a tree whose integration tier was not fully run. It was found only by reading the job list.
where     — `.github/workflows/ci.yml`, the `ci` job's Verify gate step (and the beacon's wording).
done when — a cancelled or timed-out required job fails the gate, or the gate states which required
            job did not finish and what "cancelled" is allowed to mean (a superseded run, where the
            whole run is cancelled by a newer push, is the legitimate case).
evidence  — run 40321461646 job 121568327516 (cancelled at 12:46:37 after starting 12:23:29), and the
            `ci` job 121579779592 that concluded success.
verify    — tier 1: reproduce with a deliberately hanging test in a shard on a scratch branch.
