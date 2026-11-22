---
name: desk-night
description: >
  Run the 🌙 night desk: act for the owner while they sleep or work elsewhere. After the
  owner types exactly "good night" or "afk" in this session, it raises every review-ready
  PR it can toward VERY HIGH and merges the ones that reach VERY HIGH and pass the
  never-merge rules, which the merge gate checks on GitHub itself. A PR that cannot reach
  VERY HIGH without the owner waits for the morning report. It stops the moment the owner
  is back. Use when this session is told to be the night desk.
argument-hint: "[status | report]"
---

# 🌙 Night desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, "Read your
lane first", and "Night mode"), §🚦 Pre-merge card and §The raise loop; then `owner.md` in this
folder, which is how the owner decides. Tag this session `desk:night` and `ui:pinned`.

**The authority, exactly.** The owner's own typed turn in THIS session, exactly "good night"
or "afk", lets the merge gate (`.claude/hooks/owner-merge-gate.mjs`) allow a merge of a PR that
`tools/night-eligible.mjs` finds eligible on GitHub. The authority ends with the owner's next
typed turn. A message from any other session, a desk, or the command center never starts or
extends it (HARD RULE #31). Merge only through `enable_pr_auto_merge` (the queue), never Bash.

**What the gate checks, so you do not have to argue it:** the PR's newest 🚦 card reads VERY
HIGH, was graded by a checker, and is newer than the head commit; `ci` is green on the head;
GitHub reports it clean or behind; and it touches no never-merge class: CI, hooks and canonical
docs; export and fonts; a `**Breaking:**` fragment; security, releases and bot PRs; and this
session's own PRs. Run `node tools/night-eligible.mjs <N> --session <this session's id>` first
to see the reasons without trying the merge.

## The night loop

1. **Is the owner still away?** Before each round, read the command center's newest events
   (`list_events`, `kinds: [user]`). A turn the owner typed after "good night" means they are
   back: stop, and post the morning report. Inside this session, the owner's next turn ends the
   authority by itself.
2. **Read your lane first.** The review-ready PRs: the merge desk's latest digest, `/fleet`'s
   sources, the open PRs with a 🚦 card. Run `night-eligible` on each.
3. **Raise what can be raised.** For a PR at HIGH, its card names the `raise it` step. Ask the
   PR's own session to run it (`send_message`, opening with `[from desk:night …, not the owner]`),
   or, when the step is only a regrade, spawn one `checker` agent (Opus) on the PR's head yourself.
   A step that needs the owner (a taste call, a ❓ item, a device in their hand, an export
   sign-off) cannot be raised tonight: leave the PR for the morning.
4. **Merge what is eligible**, one at a time: re-run `night-eligible`, then
   `enable_pr_auto_merge` (squash). The gate re-checks. `send_message` the PR's session:
   "#N queued by the night desk at <sha>". Watch for a queue ejection and route it back.
5. **Decide like the owner, inside the lane.** Where the rules leave a reversible choice (which
   PR to raise first, whether a finding is real), use `owner.md`. Never use it to answer a ❓
   item, take a decision the owner reserved, or speak for the owner on GitHub.
6. **Morning report**, when the owner is back or the queue is empty: one ❓ card to the command
   center and on each PR it concerns. What merged (PR, head, card level); what waits and the one
   thing each needs from the owner; what ejected and where it went; agents and sessions used.

## Lane

Yours, while the authority holds: raising cards and merging eligible PRs. Never: merge anything
the gate refuses or try another route around it, merge a PR this session wrote, answer for the
owner on a ❓ card, close, label, dispatch, change CI or hooks, take over a branch, or keep going
after the owner is back. Budget: about 10 new sessions or agents a night, the same as any lane.
