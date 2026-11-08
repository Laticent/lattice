---
origin: 1928
priority: P2
recorded: 2026-11-08
area: infra
severity: medium
swimlane: engineering/decisions/2026-08-17-codeql-merge-gate.md §Settled 2026-11-08
deferred: blocked — the owner chose (2026-11-08) not to turn the gate on yet, to avoid dealing with its fallout now; it is a repository ruleset change only the owner can make
source: https://github.com/Laticent/lattice/pull/3084
---
# Turn on the CodeQL gate for pull requests (not the merge queue)

why now   — CodeQL runs on every PR but blocks nothing: the only ruleset, "Main Merge Queue",
            requires `ci` alone, so a high-severity alert can reach `main` if the human merging
            misses it (#1689 nearly did). The owner chose option (b) on 2026-11-08: gate the PR,
            never the queue, and deferred switching it on.
what was settled — default-setup CodeQL never runs on a merge-group ref. Four ejected queue commits
            (`2acefe7c`, `ef6eddea`, `0ff62e36`, `4f4da229`) carry 13 check runs each and no CodeQL
            run; the GHAS `CodeQL` check posts only on PR heads. So a required STATUS CHECK named
            `CodeQL` would park every queue entry until its timeout and eject it. The right tool is
            the ruleset rule "Require code scanning results", which GitHub documents as not applying
            to merge queue groups.
how       — Settings → Rules → Rulesets → New branch ruleset, Enforcement Active, target the
            default branch, tick "Require code scanning results", tool `CodeQL`, Alerts "Errors",
            Security alerts "High or higher". Leave "Main Merge Queue" unchanged.
the fallout to expect — from GitHub's merge-protection docs (concepts/code-scanning/merge-protection),
            a PR is blocked when a required tool finds an alert at the set severity, and "all the
            lines of code identified by an alert must exist in the pull request diff".
            (1) About 35 JavaScript alerts are still open on main (followups.d/1958-p2,
            fix-not-dismiss). A PR whose diff touches every line an old alert names can be blocked
            by an alert it did not create; fixing 1958-p2 first, or at least the alerts in hot
            files (notes-core, the chart tests), shrinks this. (2) A PR is blocked while CodeQL's
            analysis is still running: PR runs take a median 4.0 min (n=28, 2.5–11.3). (3) A PR is
            blocked if the required tool is not configured, so the rule must name `CodeQL` exactly
            as default setup reports it. (4) Exempt: merge queue groups, and Dependabot PRs
            analyzed by default setup. (5) CodeQL's `actions` language also scans workflows: the
            missing-workflow-permissions alerts were fixed in #3084, but a new workflow with no
            `permissions:` block will be blocked.
where     — the repository's rulesets (owner); engineering/decisions/2026-08-17-codeql-merge-gate.md.
done when — the ruleset is active, one small PR has gone through the whole path (blocked by a
            planted high alert on the PR, merged through the queue without waiting on CodeQL),
            and the decision note's status moves from blocked to shipped.
evidence  — the ruleset's settings page, the blocked PR, and the queue run that did not wait.
verify    — tier 0, plus the one-PR trial above.
