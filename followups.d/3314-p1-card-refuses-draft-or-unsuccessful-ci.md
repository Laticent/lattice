---
origin: 3314
priority: P1
recorded: 2026-11-19
area: infra
severity: medium
swimlane: engineering/workflow.md §Iterating on an open PR — park it as a draft, then mark it ready
deferred: blocked — the owner chose (2026-11-19, on #3314) to land this guard in its own PR after #3314 merges, to keep #3314's scope to CI
source: https://github.com/Laticent/lattice/pull/3314#issuecomment-7001027506
---

# `npm run card` builds a pre-merge card for a draft PR or a head whose `ci` did not succeed

why now   — Since #3314 a draft push leaves a completed `ci` check that concluded `skipped`, and
            GitHub counts that as passing. workflow.md says only a ready PR whose head `ci`
            concluded `success` may be asked to merge, but nothing in the tree reads check
            state: `tools/card.js`, `tools/queue-precheck.sh` and the Stop hook do not. The red
            team and the inversion pass on #3314 both named this as the open hole.
where     — `tools/card.js` / `tools/agent-card.js` (the pre-merge renderer), with a REST read of
            `repos/{owner}/{repo}/pulls/<pr>` (`draft`, `head.sha`) and the head's `ci` check run.
done when — `npm run card` refuses a pre-merge card when the PR is a draft or the head's `ci`
            check is not `completed`/`success`, and says which; it fails closed, with a clear
            message, when GitHub cannot be read.
evidence  — the #3314 review findings (red team 1, inversion "main objection"); draft runs on
            #3314 concluded `skipped` (e.g. 44452981779).
verify    — a unit test with a stubbed read: draft, `skipped`, `in_progress`, `failure` and
            unreadable each refuse; ready + `success` passes. A failing arm per HARD RULE #34.
