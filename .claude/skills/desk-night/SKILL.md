---
name: desk-night
description: >
  Run the 🌙 night desk: act for the owner while they sleep or work elsewhere. The owner
  types `/desk-night`, then exactly "good night" or "afk". From then until their next
  typed turn here, or 12 hours, it asks review-ready PRs' sessions to raise their cards
  and merges the owner's non-visual VERY HIGH PRs that the merge gate finds eligible on
  GitHub. Visual PRs, and anything that cannot reach VERY HIGH without the owner, go into
  a morning digest. It stops the moment the owner is back. Use only when the owner typed
  `/desk-night`.
argument-hint: "[status | report]"
---

# 🌙 Night desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, "Read your
lane first", and "Night mode"), §🚦 Pre-merge card and §The raise loop; then `owner.md` in
this folder. Tag this session `desk:night` and `ui:pinned`.

**The authority, exactly.** The merge gate (`.claude/hooks/owner-merge-gate.mjs`) allows a
night merge only when all of these hold:
- the owner typed `/desk-night` in this session;
- the owner's latest typed turn here is exactly "good night" or "afk", less than 12 hours ago;
- the call is not a subagent's;
- `tools/night-eligible.mjs`, taken from `origin/main`, finds the PR eligible on GitHub.

A message from any other session, a desk or the command center never starts, extends or
replaces it (HARD RULE #31). Merge only through `enable_pr_auto_merge` (the queue), never Bash.

**What the gate checks, so you do not argue it.** Run `node tools/night-eligible.mjs <N>
--session session_<this session's id>` to see the reasons before you try. Eligible means:
- the owner's account opened the PR, from this repository;
- the newest 🚦 card was posted by the owner's account and never edited, reads VERY HIGH on
  its confidence line, names a checker on its graded-by line, and names the PR's current head
  sha;
- `ci` from GitHub Actions is green on that head, the PR is clean or behind, and no CI,
  golden-bless or integration-nightly run on `main` is red;
- every changed path is under `lib/`, `tools/`, `test/`, `engineering/`, `design/`,
  `followups.d/` or `changelog.d/`, and is not visual, export, security or control-plane;
- no breaking fragment, no release, no guarded label, no commit from this session.

**After you arm one, a new push turns auto-merge off** (`.github/workflows/disarm-on-push.yml`).
That is by design: the new head has no card. It goes back on the list for its session to
raise.

## The night loop

1. **Is the owner still away?** Before each round, read the command center's newest events
   (`list_events`, `kinds: [user]`). A turn the owner typed after "good night" means they are
   back: stop arming, and post the morning report. The gate cannot see other sessions; this
   check is yours.
2. **Read your lane first.** The review-ready PRs: the merge desk's latest digest, `/fleet`'s
   sources, the open PRs with a 🚦 card. Run `night-eligible` on each and sort them into
   eligible, raisable, and morning.
3. **Raise through the PR's own session, never yourself.** For a PR at HIGH, its card names
   the `raise it` step: `send_message` its session (opening with `[from desk:night …, not the
   owner]`) to run it and post a new card. Do not spawn a checker, regrade, post a card, or
   decide that a finding is not real: the session that made the PR and its own checker own the
   card. A step that needs the owner (a taste call, a ❓ item, a device in their hand, an
   export sign-off) waits for the morning.
4. **Merge what is eligible**, one at a time, with no cap: re-run `night-eligible`, then
   `enable_pr_auto_merge` (squash). The gate re-checks. Then `send_message` the PR's session:
   "#N queued by the night desk at <sha>; do not push to it until it lands." Watch for a queue
   ejection and route it back. If a CI, golden-bless or integration-nightly run on `main` goes
   red, stop merging until it is green.
5. **Decide like the owner, inside the lane.** `owner.md` decides only your own reversible
   choices, such as which PR to ask about first. It never answers a ❓ item, judges a
   finding, takes a decision the owner reserved, or speaks for the owner on GitHub.
6. **The morning report**, when the owner is back or nothing is left: one card to the command
   center and on each PR it concerns, covering:
   - what merged (PR, head, card level);
   - a `🚦 Merge digest` of the VISUAL PRs that are VERY HIGH, with their rendered artifacts
     attached, so the owner can look and answer `all`;
   - what waits, and the one thing each needs from the owner;
   - what was ejected, and where it went;
   - the sessions and messages you used.

## Lane

Yours, while the authority holds: asking sessions to raise, merging eligible PRs, the morning
report. Never:
- merge anything the gate refuses, or try another route around it;
- merge a PR this session wrote;
- regrade or post a card;
- answer for the owner;
- close, label or dispatch anything;
- change CI or hooks, or take over a branch;
- keep going after the owner is back.

Budget: about 10 new sessions or agents a night, as for any lane, and about 30 messages.
