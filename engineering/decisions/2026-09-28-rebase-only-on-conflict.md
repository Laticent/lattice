---
status: shipped
summary: >
  Sessions rebased every open PR whenever `main` moved, even though the merge queue
  already re-tests each PR on current `main` before merging. Over 1,000 PR CI runs
  (2026-09-20 to 09-28), 67 re-runs hit a PR that was already green, and ~1,925
  runner-minutes (13%) went to rebase-or-amend pushes. HARD RULE #16 now says rebase
  only on a real conflict, an ejection, or a need for code from `main`; the Stop
  hook warns only when `git merge-tree` finds a conflict.
---

# Rebase only on a conflict — the merge queue owns drift

## 1. The symptom

When several PRs are open and green, one merges and the others "go red": each
session rebases, force-pushes and waits for a full CI run again. The owner asked
whether this is an invariant. It is not.

## 2. What was actually happening

Three things told sessions to rebase on drift, and one setting made drift look
like failure:

- **HARD RULE #16 and CLAUDE.md rule 4** said to `git fetch origin main` and
  rebase "if behind or conflicted" before every push.
- **The CLAUDE.md trigger row** asked to merge only when "the PR is green **and
  rebased**", so every merge ahead of a parked PR made it ineligible again.
- **The Stop hook** warned whenever the branch was behind `origin/main`, with or
  without a conflict.
- **The ruleset's `strict_required_status_checks_policy: true`** ("Require
  branches to be up to date") makes GitHub label every behind PR "out-of-date"
  with an "Update branch" button. Under a merge queue that adds no protection —
  [GitHub's merge-queue docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
  say a PR need not be up to date to join the queue — but sessions read the label
  as red. This repo confirms it with the flag on: the queue branch name
  `gh-readonly-queue/main/pr-<N>-<base-sha>` records the `main` it built on, and
  comparing each merged PR's head to that SHA shows 12 of the last 15 queue
  entries (merge_group runs read on 2026-09-28) were 1–8 commits behind `main`;
  11 merged green and one was still running.

`engineering/workflow.md` also said both "the queue owns the rebase" and
"rebase-before-push still holds", so each session had to work the queue out again.

## 3. The measurement

Source: the last 1,000 `ci.yml` runs with `event=pull_request`, 2026-09-20T21:28Z
to 2026-09-28T18:07Z, read from the Actions API. A push counts as a rebase or
amend when the head SHA changed but the head commit's message and author did not.

| What | Count |
|---|---|
| PR CI runs in the window | 1,000 |
| Rebase-or-amend pushes | 126 |
| …where the previous run was already green | **67** |
| Runner wall-time on those 126 | ~1,925 of 15,017 minutes (13%) |
| New commits whose subject is catch-up work ("regenerate … after the rebase") | 48 |
| Queue (`merge_group`) runs, in a separate pull of all `ci.yml` runs from 2026-09-21 | 137 green, 3 red, 2 cancelled |

The proxy undercounts (a rebase pushed together with new work is missed) and
overcounts slightly (an amend that fixes a real finding counts). The queue's
3-in-142 red rate is the evidence that the queue, not the pre-emptive rebase, is
what keeps `main` green.

## 4. The decision

Rebase an open PR only when:

1. it conflicts with `main` (`mergeable_state: dirty`, or `git merge-tree
   --write-tree HEAD origin/main` exits 1),
2. the queue ejected it, or
3. it needs code that landed on `main`.

Never because the PR page says "out-of-date", `main` moved, or you are about to
ask to merge. The Stop hook now runs the `merge-tree` test and stays silent on a
behind-but-clean branch. The owner is turning off the ruleset's strict flag; the
new rule holds either way.

The polling drift watch stays retired
(`2026-06-15-retire-drift-watch.md`); this note retires the rest of the
rebase-on-drift habit that note left in place.

## 5. What this does not fix

The 48 catch-up commits come from committed generated files that really do
conflict when another PR lands: gallery PDFs, showcase WebPs, the
speech-projection bundle, goldens, and duplicate decision-index rows that the
`merge=union` driver leaves when a row changes. The queue cannot fix a real
conflict. That work is tracked in
`followups.d/2466-p2-committed-generated-files-conflict-across-prs.md`.
