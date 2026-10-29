---
origin: 2971
priority: P2
recorded: 2026-10-29
area: infra
severity: low
swimlane: engineering/decisions/2026-10-29-ci-job-tiers.md
deferred: off-path — the route-budget step in docs-build; #2971 keeps it as a hard failure and changes nothing there
---

# Tell an author about an undeclared route-budget raise before CI does

why now   — 85% of `docs-build`'s failures in 999 PR runs (2026-10-18..28) were the route budget asking a PR to
            declare bytes (38 per 100 PR branches), each costing an 11-minute docs build to learn. The declaration
            is the point and stays a failure; only the moment the author learns of it should move.
where     — `docs/route-budget.d/README.md`, `docs/scripts/measure-route-base.sh`, the pre-push hook in `lefthook.yml`.
done when — a local command (or the pre-push hook, if its cost is acceptable) prints the line to add before the
            push, and the PR that adds it shows the miss rate it measured.
evidence  — before/after count of route-budget declaration failures per 100 PR branches.
verify    — tier 1: self-review with the gates.
