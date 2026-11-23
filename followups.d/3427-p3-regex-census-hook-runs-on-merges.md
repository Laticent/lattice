---
origin: 3427
priority: P3
recorded: 2026-11-23
area: infra
severity: low
swimlane: lefthook.yml regex-census-recheck
deferred: off-path — a hook's comment and install story; #3427 touches neither, and a hook change is the owner's call (CLAUDE.md, second filter, row 2)
---

# The regex-census pre-commit step runs on merges, though its comment says it skips them

`lefthook.yml`'s `regex-census-recheck` comment says "a merge … skips it". On #3427 it did not:
a merge of `main` staged `tools/regex-census.json` (main had changed it), the step ran, and the
commit failed with "recheck is not installed" after the 11-minute unit suite had already passed.
The fix was `npm ci --prefix tools/recheck --omit=optional --ignore-scripts`, and then all 10
changed verdicts matched.

The trap: a session that merges `main` into a long-lived branch (§Relay rule 5 makes that the
normal move) meets a tool it never installed, and loses the hook run. The comment's claim that
"anyone staging a real table already has it" does not hold for a merge.

where — `lefthook.yml` (`regex-census-recheck`) and `tools/regex-census.js --staged`.
done when — either the step skips a merge commit (`MERGE_HEAD` present) as the comment says, or
  the comment says it runs and the SessionStart setup installs `tools/recheck`; the owner picks,
  since it changes a hook.
evidence — a merge of `main` that stages the table commits cleanly in a fresh sandbox.
verify — a checker (a hook every session runs).
