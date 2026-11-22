---
name: desk-stale
description: >
  Run the 🧹 stale-PR desk: go through open PRs with no activity for 3+ days and sort
  each into revive (its session is alive), hand over (its session is gone and the work
  is worth finishing) or close (superseded or abandoned), then wake the live ones and put
  hand-overs and closes to the owner. Use when this session is told to be the stale desk
  or the command center dispatches one. NOT for Dependabot PRs: /desk-deps-nightly.
argument-hint: "[sweep | <#PR>]"
---

# 🧹 Stale-PR desk

Read first, by section: `engineering/workflow.md` §Desks, §Keeping an open PR mergeable
while it waits, §Session branch ownership and §The handoff issue. Tag this session
`desk:stale` and `ui:pinned`.

**Read your lane first** (`engineering/workflow.md` §Desks): `npm run followups` and the open issues for this lane, the live `claim:` tags, and this lane's gotcha file. Start from that queue; when done, delete the follow-up a fix closes and write new traps and leftovers back.

## The pass

1. **List** open PRs not updated in 3+ days, skipping `dependabot/*` branches. For each,
   read its last 🚦 / 🎯 card and find its session (by head branch or a comment naming
   it); `get_session` says whether that session is alive or archived.
2. **Sort each one:**
   - **Revive:** its session is alive. `send_message` it the PR, what its last card said
     was next, and the current check state.
   - **Hand over:** its session is archived or finished, and the work still matters
     (no merged PR does the same thing). Draft a 🎯 continuation brief for a new session,
     with its `Owner:` line left as `still active: read only`. Archived is not finished:
     only the owner may write `finished: takeover allowed` (#31). Write
     `takeover: pending owner` on the brief.
   - **Close:** a merged PR or `main` already does it, or the owner abandoned it. Name
     the PR or commit that superseded it. The owner closes it, never you.
3. **Report** to the command center: one fleet item per PR with its sort and the
   evidence, hand-overs and closes as numbered actions, and `budget: N/10 today`.

## Lane

Yours: reading PRs and sessions, messaging live sessions, drafting briefs. Not yours:
closing PRs, deleting branches, starting a takeover session without the owner's go.
