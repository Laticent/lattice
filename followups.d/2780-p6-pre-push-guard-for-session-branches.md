---
origin: 2780
priority: P6
recorded: 2026-10-18
area: infra
severity: low
swimlane: engineering/workflow.md §Session branch ownership
source: https://github.com/Laticent/lattice/pull/2780
---

# Price a pre-push guard for HARD RULE #31

why now   — #31 is a discipline rule and tools/branch-owner.sh only helps a session that remembers to run it.
where     — tools/branch-owner.sh, lefthook.yml pre-push. Adding a hook is a CI-contract change, so it goes to the owner with options first (CLAUDE.md second filter).
done when — the owner has the options with measured cost (seconds per push, how many past pushes it would have blocked) and has chosen.
evidence  — a timed run of the check and its output on the #2777 branch.
verify    — tier 1 independent checker if a hook is added: a bad gate is a permanent tax.
