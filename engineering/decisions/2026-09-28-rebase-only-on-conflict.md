---
status: shipped
summary: >
  Sessions rebased every open PR whenever `main` moved, even though the merge queue
  already re-tests each PR on current `main` before merging. Over 1,000 PR CI runs
  (2026-09-20 to 09-28), 67 rebases were of a PR that GitHub would have merged
  cleanly (33 of them already green), costing ~895 minutes of CI wall-clock time
  (6.0%). HARD RULE #16 now says rebase only on a real conflict, an ejection, or a
  need for code from `main`; `npm run queue:precheck` makes the call the way GitHub
  does, which means ignoring `merge=union` — GitHub does not apply it. Re-measured
  2026-10-14 (§6): agent-session needless rebases fell from 50 to 3, and drift caused no
  queue ejection.
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
against ~895), so the follow-up stays P2. It was tracked in
`followups.d/2466-p2-committed-generated-files-conflict-across-prs.md`, closed on 2026-10-14
by `2026-10-06-conflict-reduction.md` §5.

**Update 2026-09-29.** The decision index is off that list: its rows now sort by topic
slug instead of date, so two PRs that each add a note no longer share an insertion point
(`2026-09-29-decision-index-rows-scatter.md`). The other files remain in the follow-up.

## 6. Re-measured on 2026-10-14 — the rule holds

**Answer.** Needless agent-session rebases fell from 50 to 3, and pure catch-ups (a catch-up
that carried no new work) fell from 53 to 4. Only 1 of those 4 came after the catch-up
warning hook merged (#2561, 2026-10-07T01:28Z). The queue's red rate rose from 2.6% to 5.5%,
but drift caused none of the rise: cross-PR breaks stayed at 2 per window. One real index-only conflict happened after #2480. It was the residual case that
note predicted, and the class is now gone, because #2622 stopped committing the index.

**Windows.** The source is the same as §3: `ci.yml` runs, read from the Actions API on
2026-10-14.

- **Before:** the §3 window. 1,000 `pull_request` runs from 2026-09-20T21:28Z to
  09-28T18:07Z (15,017 CI minutes), and 152 `merge_group` runs from 2026-09-21T23:37Z to
  09-29T02:05:15Z. The queue window runs on to #2466's merge so the two windows meet, which
  is why it holds 10 more runs than §3's 142, and one more red run (#2453).
- **After:** every run created from 2026-09-29T02:05:15Z (#2466 merged) to
  2026-10-14T12:00Z. That is 835 `pull_request` runs (13,883 CI minutes) and 199
  `merge_group` runs.

The classifier is §3's: a push is a rebase or an amend when the head SHA changed but the
head commit's message and author did not, and the replay runs
`git --attr-source=<empty tree> merge-tree --write-tree <old head> <new base>`. Run on the
before window, it reproduces §3's table exactly (67 / 27 / 32 pushes, ~895 / ~456 / ~574
minutes, 8 index-only), so the two columns compare like with like.

### Same-message pushes, by who pushed

| Push kind | Before: pushes (previous run green) · CI minutes | After |
|---|---|---|
| Needless rebase by an agent session — **what #16 targets** | **50 (27) · ~857** | **3 (0) · ~78** |
| Needless rebase by Dependabot | 11 (0) · ~30 | 16 (0) · ~140 |
| Backlog-bot re-sync (new content, not waste) | 6 (6) · ~8 | 7 (7) · ~48 |
| **Needless total, as §3 counted it** | **67 · ~895 (6.0%)** | **26 · ~266 (1.9%)** |
| Required rebase: a real conflict on GitHub's terms | 27 · ~456 (3.0%) | 20 · ~423 (3.0%) |
| …on the decision index and nothing else | 8 | 0 |
| Amend on the same base | 32 · ~574 | 18 · ~355 |

The 3 agent rebases ran on 09-29, 10-05 and 10-06, all before the hook merged.
Dependabot rebases its own branches, so HARD RULE #16 cannot reach it. Its 16 cost ~1% of
the window's CI minutes, and `followups.d/2466-p3-dependabot-rebases-clean-prs.md` tracks
them. The backlog bot regenerates its branch from current issues each night, which is new
content (`2026-10-06-conflict-reduction.md` §1).

**A wider count.** The same-message proxy misses a merge from `main` and a rebase pushed
together with new work. Counting every push whose merge base with `main` moved forward:
425 catch-ups before (284 clean on GitHub's terms, 141 real conflicts), and 141 after (67
clean, 74 conflicts). Per 1,000 PR runs, that is 425 → 169 catch-ups and 284 → 80 clean
ones. Most clean ones were pushed together with new work, which needs a CI run anyway. Counting
only agent-session catch-ups whose new head carries no commit subject the old head lacked
(a pure catch-up): 53 before, and 4 after, of which 3 came before the hook merged and 1
after it. Those 4 are the waste the rule and the hook target, and they are what the
confidence call below rests on.

### The merge queue

| `merge_group` runs | Before | After |
|---|---|---|
| All | 152 | 199 |
| Green | 146 | 173 |
| Red | 4 (2.6%) | **11 (5.5%)** |
| Canceled (`cancelled`) | 2 | 15 |

The red rate doubled, which is the condition the #2466 raise path said would reopen the
rule. Each of the 11 red runs was read job by job:

| Cause | Red runs | PRs | Would a pre-queue rebase have prevented it? |
|---|---|---|---|
| One flaky smoke test, `playground-first-paint.spec.ts:198`, 10-04 to 10-05 10:30Z | 4 | #2492, #2424, #2508, #2515 | No. Each PR re-entered unchanged and merged. #2519 fixed the test's seed (merged 10-05 13:04Z), and it has not failed in the queue since |
| A second smoke flake, a click timeout in `library-image-metadata.spec.ts:598` | 1 | #2681 | No. It re-entered unchanged and merged 10 minutes later |
| The `changes` job ran 15 minutes with no steps against a 5-minute timeout and was canceled, so every test tier was skipped | 2 | #2525, #2535 | No. Runner-side, 10-05 evening |
| Collateral: GitHub canceled the tiers when #2525, ahead in the same group, failed | 1 | #2534 | No |
| The backlog bot's PR failed an integration test | 1 | #2499 | No. The next night's re-sync merged |
| **A real cross-PR break** | **2** | #2548, #2606 | See below |

- **#2548** pinned message wording in a test, and #2551 changed that wording. #2551 was
  ahead of #2548 in the queue: the group #2548 was tested in was built on #2551's commit
  (12:48Z), and #2551 merged at 13:18Z. No rebase can pick up a PR that has not merged, so
  the old rule would not have caught this either. The queue caught it, and `main` stayed
  green.
- **#2606** failed `test/unit/cli/retired-cli-name.test.js`, which #2601 added: the test
  rejects the retired CLI name, and #2606 had added a follow-up file that used it. #2601
  was ahead of #2606 in the queue, and #2606's last push (12:38Z) came before #2601 even
  entered it. Its fix commit rebuilt the file with the renamed CLI.

Both are the same kind of break: a test that lands on `main` rejects content in a PR
running beside it. It is a real and ongoing class, and catching it is the queue's job.

Read the same way, the before window's 4 red runs hold 2 cross-PR breaks (#2417 and #2439
pushed a fix after their ejection) and 2 that re-entered unchanged (#2365, #2453). So
cross-PR breaks went from 2 in 152 queue runs to 2 in 199. The rise in red runs is flakes
and runner trouble, both since fixed or one-off. The 15 canceled runs were not read one
by one.

**Confidence moves from `high` to `very high`.** The raise path asked for a week of data.
Two weeks show the targeted waste down about nine-tenths (~857 → ~78 minutes of agent
rebases, over 835 runs against 1,000; pure catch-ups 53 → 4, and 1 after the hook), and
no ejection that a rebase would have prevented.

### The decision index after #2480

Five catch-ups in the after window conflicted on `engineering/decisions/README.md`. Four
came from heads created before #2480 merged (2026-09-29T08:56Z): that is the one-time
conflict `2026-09-29-decision-index-rows-scatter.md` §4 predicted. The fifth is real. On
2026-10-06 at 05:33Z, `claude/lattice-p2p-collaboration-uy2h2l` had inserted
`studio-live-collaboration` directly below `studio-lessons` in the Active group, and #2540
on `main` moved `studio-lessons` to the Shipped group. A new row beside an edited row is
the residual case that note's §5 names. So the raise path for #2480 ("zero real index-only
conflicts") is not met, and #2480 stays at `high`.

That no longer matters: since #2622 (2026-10-09), the index is built into `dist/` and is
not committed (`2026-10-09-generated-indexes-uncommitted.md`). Two PRs cannot conflict on
a file neither of them commits.
