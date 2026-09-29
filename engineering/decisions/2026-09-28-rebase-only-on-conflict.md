---
status: shipped
summary: >
  Sessions rebased every open PR whenever `main` moved, even though the merge queue
  already re-tests each PR on current `main` before merging. Over 1,000 PR CI runs
  (2026-09-20 to 09-28), 67 rebases were of a PR that GitHub would have merged
  cleanly (33 of them already green), costing ~895 minutes of CI wall-clock time
  (6.0%). HARD RULE #16 now says rebase only on a real conflict, an ejection, or a
  need for code from `main`; `npm run queue:precheck` makes the call the way GitHub
  does, which means ignoring `merge=union` — GitHub does not apply it.
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

Each of those pushes was then split by replaying it. `git fetch origin <sha>`
fetches the old, force-pushed head by SHA. `git merge-base <sha> origin/main` gives
the `main` it sat on before and after the push; the same base on both sides means an
amend, not a rebase. For a rebase, `git merge-tree --write-tree <old-head> <new-base>`
says whether the old head would have merged cleanly with the `main` the session
rebased onto. The merge runs **on GitHub's terms**, with merge drivers from
`.gitattributes` switched off (`git --attr-source=<empty tree>`), because GitHub
does not apply them (§4b).

| Push kind | All | Previous run green | CI wall-clock minutes |
|---|---|---|---|
| Rebase of a PR that would have merged cleanly — **the waste this note removes** | **67** | **33** | **~895 (6.0%)** |
| Rebase of a PR that really conflicted — still required (8 on the decision index alone) | 27 | 26 | ~456 (3.0%) |
| Amend on the same base — not a rebase | 32 | 8 | ~574 (3.8%) |
| **Total** | 126 | 67 | ~1,925 of 15,017 (12.8%) |

Two more readings from the same window:

- 48 new-commit pushes have a subject line matching the case-insensitive regex
  `rebase|regenerat|re-?bless|merge (origin/)?main|resolve conflict|refresh (generated|dist|index)|after .*merge|sync with main|re-?run|index|capabilities`.
  It is a loose filter: it also catches some ordinary work, so read 48 as an upper
  bound on catch-up commits, not a count.
- Queue (`merge_group`) runs, in a separate pull of the latest 1,000 `ci.yml`
  runs (the API's cap), which reached back to 2026-09-21T23:37Z: 137 green, 3 red, 2 cancelled.

**Correction.** The first draft of this note, and the PR that shipped it, quoted
"67 re-runs of an already-green PR, ~1,925 minutes, 13%" as the waste. That
counted amends and required conflict rebases too. The adversarial review asked for
the split. A second correction followed: the split was first computed with a local
merge, which applies `merge=union` to the decision index, and read 75 / 41 /
~1,005 minutes. GitHub does not apply that driver (§4b), so 8 of those "clean"
rebases were real conflicts on GitHub. The table above is the GitHub-terms figure.

The proxy still undercounts: a rebase pushed together with new work is missed. The
queue's 3-in-142 red rate shows that the queue, not the pre-emptive rebase, is what
keeps `main` green. Most of those runs predate this rule, so it says little about
how often a behind PR will now be ejected; §4a covers that.

## 3b. What would have happened without those rebases — replayed

The table in §3 counts rebases that merged cleanly *with the `main` the session
rebased onto*. The question that decides this note is different: had the session
skipped the rebase, would the merge queue have taken the PR anyway?

**Method.** 75 rebases looked clean under a local merge; 63 of them belong to a PR
that later went through the queue (42 distinct PRs). The queue's branch name,
`gh-readonly-queue/main/pr-<N>-<base-sha>`, records the `main` it tested on. For each
case, the pre-rebase head was merged with that base in a scratch worktree, and the
merged tree was put through `node tools/build.js --check --exclude-uncommitted` (the
queue's generated-file gate). Every failure was re-run on the base alone as a
control, and every control passed.

| Outcome without the rebase, on GitHub's terms | Cases | `npm run queue:precheck` |
|---|---|---|
| Conflict with the queue's `main` in real content | 30 | exit 1 |
| Conflict on the decision index only | 9 | exit 1 |
| Merges cleanly; the merged tree passes `build:check` | 24 | exit 0 |

The first pass of this replay merged locally, with `merge=union` applied. It
reported the 9 index-only cases as clean, and 3 of those then failed `build:check`
with a duplicate index row (PRs #2404, #2446). That looked like a gap for a second
arm of the check to close. It was a symptom of the real gap instead: on GitHub
those 9 are conflicts, the PR shows `dirty`, and neither CI nor the queue will
touch it. Merging on GitHub's terms calls all 63 correctly with one arm.

The 39 conflicts do not erase the saving. Under the old rule those PRs were rebased
on every move of `main` *and* again for the real conflict. Under the new rule they
are rebased once, when the check says so.

**The unit tier, sampled.** The sample was drawn during the first, local-merge pass,
so it came from the 30 trees that pass looked clean. One tree from each of 10
distinct PRs (chosen by
a seeded shuffle: #2247, #2250, #2264, #2303, #2331, #2344, #2367, #2387, #2399,
#2416) was built with `node tools/build.js` and put through the whole unit suite.
All 10 passed; 8 of the 10 are among the 24 trees that are clean on GitHub's
terms, and the other 2 are index-only conflicts. `test/unit/tools/wait-for.test.js` was left out: it fails the same
way on the queue's `main` alone in the replay sandbox (it takes a real lock, and
the sandbox already held one), so it could not tell the two trees apart.

**Still not replayed:** the unit tier on the other 16 of the 24 clean trees, and
the integration and docs-build tiers on all 24. The queue runs those, so a break there
costs an ejection, not a broken `main`.

## 4. The decision

Rebase an open PR only when:

1. it conflicts with `main` on GitHub's terms (`mergeable_state: dirty`, or
   `npm run queue:precheck` exits 1 — a plain `git merge-tree` is not enough,
   because it applies `merge=union` and GitHub does not; §4b),
2. the queue ejected it, or
3. it needs code that landed on `main`.

Never because the PR page says "out-of-date" or `main` moved. "Code from `main`"
means a specific commit your change calls or your tests need. Name it in the
commit message, or the reason does not apply. The Stop hook now runs the `merge-tree` test and stays silent on a
behind-but-clean branch. The owner is turning off the ruleset's strict flag; the
new rule holds either way.

The polling drift watch stays retired
(`2026-06-15-retire-drift-watch.md`); this note retires the rest of the
rebase-on-drift habit that note left in place.

## 4a. What the adversarial review found, and what changed because of it

The adversarial trio (red team, inversion, checker) ran on the PR. Nothing it found
lets a red tree reach `main`: `merge_group` runs every tier and `ALLGREEN` merges
only green groups. What it found are places where a session believes a PR is fine
when it is not.

- **Silence from the Stop hook means "no conflict with the `main` you last
  fetched".** The hook never fetches, so a stale `origin/main` reads as clean.
  §Keeping an open PR mergeable now says so.
- **Some breaks merge cleanly as text and fail only in the queue.** Example: a
  committed demo PDF or golden built against an older `main`. The old rule caught
  these with a local `build:check` after the rebase. Now the queue ejects the PR,
  the ejection clears auto-merge, and no webhook tells the session. So the step
  before the merge ask now runs `npm run queue:precheck`, which is a check, not a
  rebase; §3b measures what it catches. A parked session also confirms
  `auto_merge` is still set whenever it wakes.
- **The hook read `.gitattributes` from the working tree, not from `HEAD`.** A
  dirty tree could flip its answer for the `merge=union` decision index. Moot now:
  the check ignores `.gitattributes` altogether, as GitHub does (§4b).
- **`golden-diff` and `studio-smoke` run only on `pull_request`.** On a behind PR
  their before/after images compare against the base of the last push. `ci` still
  gates correctness; the images a reviewer signs off on can be a few merges old.

## 4b. GitHub does not apply `merge=union`

Found on this note's own PR. After three pushes, #2466 had no `ci` run on its head,
and GitHub reported `mergeable_state: dirty`. The local check said the branch merged
cleanly. The only difference was `engineering/decisions/README.md`: with the repo's
`merge=union` attribute, `git merge-tree` merges the two sides' new index rows;
with attributes switched off (`git --attr-source=<empty tree> merge-tree …`) it
reports exactly the conflict GitHub reports.

Consequences:

- GitHub runs no `pull_request` workflow on a PR it cannot merge, so a `dirty` PR
  goes quiet rather than red. A session waiting for a CI-green notice on it waits
  forever. Check `mergeable_state` when CI has not started.
- `merge=union` still helps a *local* rebase: git resolves the index without a
  prompt, and `npm run decisions:index` then tidies it. It does nothing for GitHub's
  view of the PR. `2026-09-14-the-decision-index-merges-as-a-union.md` should be read
  with that limit in mind.
- The decision index is the largest single source of real conflicts in the window:
  8 of the 27 required rebases in §3, and 9 of the 39 replayed conflicts in §3b,
  conflicted on the index and nothing else. That raises the stakes of the follow-up
  in §5.

## 5. What this does not fix

The 48 catch-up commits come from committed generated files that really do
conflict when another PR lands: gallery PDFs, showcase WebPs, the
speech-projection bundle, goldens, and the decision index, which conflicts on
GitHub even though `merge=union` resolves it locally (§4b). The queue cannot fix
a real conflict. On the table in §3 the conflict side costs less than the waste
this note removes (~456 minutes of required rebases, plus the catch-up commits,
against ~895), so the follow-up stays P2. It is tracked in
`followups.d/2466-p2-committed-generated-files-conflict-across-prs.md`.

**Update 2026-09-29.** The decision index is off that list: its rows now sort by topic
slug instead of date, so two PRs that each add a note no longer share an insertion point
(`2026-09-29-decision-index-rows-scatter.md`). The other files remain in the follow-up.
