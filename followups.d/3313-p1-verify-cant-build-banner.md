---
origin: 3313
priority: P1
recorded: 2026-11-19
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §1
deferred: blocked — needs a real Claude Code web session, which the session that wrote it could not start
source: https://github.com/Laticent/lattice/pull/3313
---

# See the session-start can't-build banner in a real web session's context

why now   — #3313's hook now exits 0 with a banner when npm install fails, so the text should land in the session's context; that rests on the SessionStart contract, not on an observed session. It is the one gap that kept #3313's card at HIGH.
where     — .claude/hooks/session-start.sh (the npm install step); start a Claude Code web session on main with package installs OFF.
done when — the new session quotes the "LATTICE CANNOT BE BUILT IN THIS SESSION" banner from its own context, word for word; or, if it does not, the hook is fixed so it does.
evidence  — the session's reply quoting the banner, linked or pasted into the PR that deletes this file.
verify    — tier 0, because the check is the observation itself.
