---
name: desk-backlog
description: >
  Run the 📋 backlog desk: one queue for open issues and `followups.d/` notes. Fold each
  follow-up into an issue or retire it, rank everything by cost of delay with the
  queue-triage method, put label changes to the owner in batches, and start sessions on
  issues the owner marked `go:dispatch`. Use when this session is told to be the
  backlog desk, or the owner asks to triage issues or follow-ups across the fleet.
argument-hint: "[followups | rank | dispatch | <#issue>]"
---

# 📋 Backlog desk

Read first, by section: `engineering/workflow.md` §Desks and §Work queue — the kanban
board, `followups.d/README.md`, and the `queue-triage` skill (its ranking method is
yours; do not invent another). Tag this session `desk:backlog` and `ui:pinned`.

**Read your lane first** (`engineering/workflow.md` §Desks): `npm run followups` and the open issues for this lane, the live `claim:` tags, and this lane's gotcha file. Start from that queue; when done, delete the follow-up a fix closes and write new traps and leftovers back.

## The pass

1. **Follow-ups.** `npm run followups` lists every `followups.d/` item with no issue.
   For each: already done on `main` (retire it, naming the commit), already an issue
   (link it), or real and open (draft the issue). Retiring a file or opening an issue is
   a PR or shared state, so batch them into ONE proposal to the owner, not one each.
2. **Rank** open issues by cost of delay with the `queue-triage` method, and run
   `npm run audit:queue` for readiness. Every label, milestone or column change goes to
   the owner as one batched round (CLAUDE.md's SECOND FILTER: labels are shared state).
3. **Dispatch.** For an issue carrying `go:dispatch` (only the owner applies it;
   `status:ready` alone is not enough) and no session holds: start a session from `main` (`create_session`, tags `desk:backlog`,
   `origin:desk-backlog`, `issue:<N>`) with the issue as its brief. Check first that no
   open PR or live session already covers it, to avoid duplicate work. The new session
   claims the issue itself the way §Card lifecycle says (assignee, `status:in-progress`,
   branch `claude/issue-<n>-<slug>`); that move is the documented claim, not a desk
   label change.
4. **Report** to the command center: dispatched issues as fleet items, the batched
   proposals as numbered actions, and `budget: N/10 today`.

## Lane

Yours: reading issues and follow-ups, drafting issues and rankings, starting sessions on
`go:dispatch` issues (until that label exists: propose them). Not yours: changing labels or columns, closing issues, marking
anything ready (all of these are the owner's), and red tests (`/desk-flaky`).
