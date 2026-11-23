---
name: desk-jank
description: >
  Run the 〰️ jank desk: own layouts that MOVE when content grows: a mark that drifts,
  two boxes that collide, a band that crowds the text. Start from the jank follow-ups
  and issues, sweep the catalog with `check:jank`, rank by how often real decks hit
  each one, and drive each fix with a before/after sweep. Use when this session is
  told to be the jank desk, or the owner asks what shifts, drifts or jumps on a slide.
argument-hint: "[census | <component> | followups]"
---

# 〰️ Jank desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and
"Read your lane first"), then `engineering/jank.md` §What "jank" means here, §Running it,
§The judgment, §What a green run does NOT mean and §Three traps this already paid for.
Tag this session `desk:jank` and `ui:pinned`.

**The question this desk owns:** every fit gate asks whether content FITS. This desk asks
whether the layout STAYS PUT as content grows. A still image cannot show it, so a claim
here is a `check:jank` table, never a screenshot alone.

## The pass

1. **Read your lane first.** `npm run followups` and keep the items about layout motion
   (`grep -li jank followups.d/*.md` is the start; read each, since the word also covers UI
   stutter, which is not this lane), the open issues that mention jank, drift, collision or
   crowding, and `claim:` tags already on live sessions. This is your starting queue: never
   open a fix that a follow-up or a claim already covers.
2. **Sweep.** For a component you did not write, run `node tools/check-jank.js "<class>"
   --anchors` first, pick the anchor, then sweep it (`jank.md` §Running it). For the whole
   catalog, follow §The census, and compare with its last recorded run.
3. **Rank** by reach: how many decks in `examples/`, `exemplars/` and the galleries use
   the component and modifier, then by size of the move (px of drift, collision yes/no).
   Keep the top three.
4. **Act inside the lane:** start one fix session per item from `main` (tags
   `desk:jank`, `origin:desk-jank`, `claim:issue:<N>` or a `claim:` naming the component).
   Its brief carries the sweep table as the baseline and says: the fix ships with the
   same sweep, before and after, and with `--style` neutralizing the fix as the failing
   arm (`jank.md` §Running it); a visible change owes a demo deck (HARD RULE #9); the PR
   deletes the follow-up file it fixes.
5. **Write back** (through a session you start, counted in the budget). A new trap goes into `jank.md` §Three traps (or a new section). A move you
   found but will not fix this pass becomes a `followups.d/` file
   (`deferred: large|blocked|off-path`). A census run updates §The census.
6. **Report** to the command center: the top items as fleet rows, the follow-ups claimed
   and closed, and `budget: N/10 today`, with its `meter:` ledger.

## Lane

Yours: motion of a layout as its content grows, in engine CSS, components and themes.
Not yours: content that does not fit (the fit gates own it), a red test (the flake desk),
visual taste that does not move (the polish desk), Studio UI stutter (performance, the
optimize desk). Never: loosen a fit or jank threshold, add a `SANCTIONED_*` entry
without its justification in the PR, or add `margin` to engine CSS (HARD RULE #20).
