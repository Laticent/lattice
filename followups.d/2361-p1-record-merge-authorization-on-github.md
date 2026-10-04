---
origin: 2361
priority: P1
recorded: 2026-09-25
---

# The human merge authorization leaves no record on GitHub

why now   — CLAUDE.md rule 7 says a human approves every merge, but the ruleset requires no
            reviewer, `settings.json` pre-approves `git merge*`, and agents arm auto-merge under
            the owner's account. From GitHub's record an agent-initiated merge cannot be told
            apart from an authorized one (audit §3, chapter 3 §2).
where     — the branch ruleset (`engineering/workflow.md` §Merging), `.claude/settings.json`.
done when — the owner has chosen one: a required approving review, an authorization marker the
            queue checks, or a written decision to keep chat-only authorization.
evidence  — the chosen setting or note, linked from workflow.md §Merging.
verify    — owner decision: branch protection is shared state (second filter, row 1).
