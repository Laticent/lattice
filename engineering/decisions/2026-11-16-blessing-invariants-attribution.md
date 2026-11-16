---
status: in-progress
summary: Proposal for blessing that one human can sustain. Today a nightly bot finds drift on main and asks the owner afterward, record by record, and its bless PR waits for a person (#3118 sat from Nov 10). Proposed. (1) A handful of universal INVARIANTS (a new clip or overflow, a page added, removed or resized, a phone rule going inert, a component leaving the clipping roster, contrast under its floor) are never re-recorded automatically; a PR that breaks one on purpose declares it in an exception file the owner approves at merge, and the merge is the bless. (2) All other drift is ATTRIBUTED to the merge that caused it by rendering at merge commits, re-recorded one golden at a time, and the bless PR merges itself for every golden that is attributed and breaks no invariant. (3) The owner gets a DIGEST, not questions: a receipt on each PR showing what it actually moved, worst pages first. (4) Records, sanctions and the tools that measure them are FENCED so no PR or agent can re-record a regression away. (5) Drift no merge explains (runner, Dependabot, nondeterminism) is classed as platform drift and handled once, not nightly. Reviewed by the adversarial trio on 2026-11-16, whose findings reshaped the first draft (§9).
---

# Blessing one human can sustain: invariants, attribution, receipts

**Date:** 2026-11-16 · **Status:** approved by the owner 2026-11-16; rollout step 1 next · **Scope:** how a change to what slides look like
becomes the new recorded truth: the committed goldens (`golden-bless.yml`), the oracles in
`test/oracle/`, `SANCTIONED_CLIPS` in `tools/check-chart-fit.js`, and the ceilings in
`docs/route-budget.json`. **Supersedes:** rollout step 4 of
`2026-10-06-goldens-bot-blessed.md` (the four-rule hybrid, never switched on).

## 1. The problem

We bless **after** the merge, record by record, away from the decision that caused the change.
Every design decision returns later as micro questions to the one human, and the bless PR waits
for a person who has no context to judge it.

The week of #1845 / #3221, as it reached the owner on 2026-11-15:

| Asked of the owner | What actually caused it |
|---|---|
| Re-record 105 rows of family-conformance drift (115 counting #3221's roster fix) | Drift building since 2026-09-24: 13 rows then, 59 by 2026-10-25, 88 after #3021 and #3031 (both 2026-11-04), 93 by 2026-11-11, 105 after #3131 (2026-11-13). Nobody re-recorded it because nobody owned it. |
| Re-record the family-overflow roster | #3113 (2026-11-10) and #3131 added components; a detector bug (#3221) dropped two |
| "gift-card PDF missing" | Not a defect. PRs never commit PDFs (2026-10-06 note, step 3). The bless PR #3118, a rolling dry-run PR open since 2026-11-10, simply had not been merged by a person. The test went red on 2026-11-14 when its 3-day grace ran out. |
| Raise a route-budget ceiling by 0.5 KB | #3221's own fix |
| Roadmap card taller than a phone page | #3131: a genuine design question, and the only one of the five that needed the owner |

## 2. The principle

- **The owner decides at the macro level, once, at merge.** Not record by record, not afterward.
- **The machine decides what it can measure.** Pixels that moved because a merged PR moved them,
  with no invariant broken, are re-recorded without asking anyone.
- **The owner sees, but is not asked.** What moved arrives as a digest that can be read on a phone,
  worst first. Seeing is not gating.
- **Nothing that measures can be quietly edited to stop measuring.**

## 3. Invariants: the only things that need a decision

Most drift is fine: text reflowed, a color moved, a chart grew. What is *always* either a regression
or a deliberate decision is a short, fixed list, the same for every PR:

| Invariant | Measured today by |
|---|---|
| No new clip or overflow (stage clip, viewBox clip, family-overflow clip) | `check-chart-fit` (absolute gate), `check-family-tiers` "NEW CLIPS" |
| No page added, removed or resized in a golden | `golden-bless-verdict.mjs` `pageShapeChanged` (one flag today; split into count vs size, §8) |
| No phone rule going from firing to inert | family-conformance, per cell (needs JSON output, §8) |
| No component leaving the clipping roster | `check-family-tiers` roster line (needs JSON output) |
| No text under its contrast floor | player-contrast against its oracle |

A PR that breaks one **on purpose** says so in an **exception file**, `exceptions.d/<slug>.yml`:
the invariant, the goldens or components it applies to, and why ("roadmap leaves the clipping
roster because it now reflows by a width query"). The 🚦 card shows it on its own line, and **the
owner's merge is the bless** for exactly those items. Exceptions are rare by design: most PRs
write none, so the file is never boilerplate.

Budget ceilings stay owner decisions (CLAUDE.md's second filter). The only change: a PR that needs
one says so as an exception, and the raise lands in its own PR, as #3229 does (open at this writing).

## 4. Attribution: who caused each change

"Covered" means **caused by a person-merged PR**, never "inside a declared scope" (the trio's main
finding, §9). For each golden that drifted overnight, the bless bot bisects the night's merges:

- render the golden at the merge commits since the last bless, and find the first merge whose
  render matches tonight's;
- that merge is the cause. If it is a person-merged PR, the drift is **attributed**.
- If no merge reproduces it, or the cause is a bot merge (Dependabot, the release, the backlog
  sync), or the drift appears with no render-relevant merge at all, it is **platform drift** (§6).

Cost, estimated: the 2h36m golden sweep renders about 600 goldens, about 15 s each. A night with
10 merges bisects in about 4 renders per drifted golden, so 100 drifted goldens cost about 1.7 h
more. That is bounded, it runs only for goldens that drifted, and gallery goldens of one change
can share renders. **To measure before step 3 ships.**

**A revert is a merge like any other.** A person-merged revert is the cause of the drift it
makes, so that drift is attributed and blessed, which restores the earlier render: undoing a
change is a decision, and its merge is the bless. A revert that brings back a broken invariant
(a clip, a page-shape change) is still held, exactly as the original change would have been. A
revert that removes a PR's exception file removes the exception with it, so the invariant it
excused is enforced again from that night.

The oracles in `test/oracle/` get the same treatment: an oracle cell that changed is attributed
by re-running the check at the bisected merge.

## 5. The bless: per golden, automatic, never all-or-nothing

The bless PR is built from the goldens and oracle cells that are **attributed and break no
invariant, or break one that a merged exception names**. It merges itself. Everything else stays
drifted on `main` and goes to §6. One unexplained golden never holds the rest back, which is the
mechanism that stalled #3118 and #2624.

Each record family has one named writer. `golden-bless.yml` writes goldens today. The oracles have
**no bot writer**; they are blessed by hand (`--bless`). This design gives them one, in the same
bless run, after the integration nightly's results are in (§8).

## 6. What no merge explains, and who handles it

- **Platform drift** (a runner patch, a Dependabot bump of Chrome or a font, render nondeterminism):
  one entry on the rolling issue, keyed by record and golden. If the drift is uniform and small, it
  is re-recorded once with the bump named. If not, it is escalated **once**, not nightly.
- **A broken invariant with no exception** is a regression. A **scheduled cloud session** (a Claude
  Code scheduled task on the owner's account, fired after the nightly) picks it up:
  - It reads the ledger and skips anything that already has an open fix PR or ❓ card.
  - It fixes the cause in a PR (HARD RULE #33), or posts one ❓ card when the fix is a design call.
  - It may **never** edit a record, a sanction, an exception, or a measuring tool (§7).
  - It runs with a per-run budget, and stops after 3 nights on the same item.

  Nothing in the repo starts a session today (`grep` of `.github/` finds no agent action), so this
  is new. It lives on the owner's account, not in CI, and costs one session on red nights.

## 7. The fence: records cannot be edited to stop measuring

A PR that changes any of the following needs the owner's explicit line on its card:

- `test/oracle/**`
- `SANCTIONED_CLIPS` and the other `SANCTIONED_*` allowlists
- `docs/route-budget.json`
- `exceptions.d/**`
- a measuring tool (`tools/check-*.js`, `tools/regression-gate.mjs`, `tools/lib/golden-*`)

A CI check names these paths. Exception files are read from the commit that added them, and an
edit or late add to another PR's exception is refused. This closes the laundering route the red
team found: a session "fixing" a clip by sanctioning it, or by re-blessing a record by hand.

## 8. Receipts: what the owner sees

After each bless, the bot posts a **receipt** on every PR it attributed drift to:

- how many goldens it moved;
- the 12 worst pages by pixel change, as a before and after montage;
- any invariant exceptions it applied.

One comment per PR, readable on a phone, never a gate. Over time the receipts also show whether
sessions predict their impact well.

New instrumentation this needs (the checker found these are not measured today):

- family-conformance and family-overflow write per-cell JSON, not only text;
- `pageShapeChanged` splits into page count and page size;
- chart-fit gets no oracle: it stays an absolute gate, which is already an invariant.

## 9. What the adversarial trio changed

The first draft had each PR write a **claim** of the scope it may move, and counted any drift
inside a claim's scope as covered. The trio showed why that fails:

- **Red team.** A scope is not a cause. 16 of the 18 merge days since 2026-10-17 touched a shared
  engine, theme or lockfile path, which would honestly claim "everything", so the nightly
  regression check would be off on most nights. It is the "could have rendered is not was shown"
  mistake the 2026-10-06 note rejected. It also found:
  - bounds such as `may-move` that cannot fail;
  - a path-based "is a claim owed" check that misses records and measuring tools, which is the
    laundering route;
  - claims that a later PR can edit;
  - Dependabot and reverts breaking "the merge is the bless" (answered: a bot merge is platform
    drift, §6; a revert is attributed like any merge, §4).
- **Inversion.** The all-or-nothing bless would stall again, as #2624 and #3118 did. Platform drift
  would flood the morning agent and then the owner. Claims would become boilerplate. The simplest
  version (a per-golden auto-bless blocked only on invariants) clears most of the pile on its own,
  so it should ship first.
- **Checker.** It corrected several facts:
  - the conformance drift started 2026-09-24, not 2026-11-04;
  - gift-card was a dry-run bless no one merged, not a PR's mistake;
  - golden-diff's cap is 40 gallery renders plus decks;
  - the route budget is checked per PR, never nightly;
  - the split oracles run nowhere;
  - the last two scheduled nightlies skipped the golden and conformance steps (#3214 fixes that).

  It also found that nothing in the repo can start an agent session today.

## 10. Rollout, cheapest and most valuable first

Each step has a measured exit before the next starts.

1. **Per-golden auto-bless blocked only on invariants**, with receipts. No attribution yet: a
   golden that breaks no invariant is re-recorded. Exit: two weeks with no bless PR waiting more
   than a day.
2. **The fence** (§7) and exception files (§3), the check warn-only at first. Exit: every
   invariant break in those two weeks either named in an exception or fixed.
3. **Attribution** (§4), after measuring its render cost on one real night. Platform drift is
   classed from here on.
4. **The morning agent** (§6). Exit: its fix PRs merge, and the ledger shows no repeats.
5. **Oracles join the bless** (the per-cell JSON of §8), so D1- and D2-style drift never reaches
   the owner again.

On the day step 1 starts, bless once to a fresh baseline, so the queue starts empty.

## 11. Decisions this needs from the owner (once)

**Approved by the owner on 2026-11-16 ("i approve"), every item below.** Each rule-text change lands in the rollout step that makes it true, not before: CLAUDE.md rule 7 and the `workflow.md` Evidence sentence with step 1, the `exceptions` card line (HARD RULE #28) with step 2.

- The design itself.
- The CI checks it adds: the fence (§7), exception files (§3), and the attribution step (§4).
  These are CI-contract changes (CLAUDE.md, second filter, row 2).
- CLAUDE.md rule 7: add the bless bot to the PR classes that merge themselves.
- HARD RULE #28: the 🚦 card gains an `exceptions` line.
- `workflow.md` §Pre-merge card: what the nightly verifies after merge does not lower the
  Evidence axis. Without this, sessions are pushed to render the whole corpus before asking to
  merge.
- Whether the morning agent runs as a scheduled cloud session on the owner's account.
