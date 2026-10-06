---
status: in-progress
summary: >
  Replayed every catch-up (rebase or merge from main) on 21 PRs merged 2026-09-30..10-06 on
  GitHub's terms: 28 catch-ups, 19 real conflicts, 9 clean. 2 of the 9 were the backlog bot's
  nightly re-sync, so 7 of 26 agent catch-ups were needless. The decision index and route
  budget, fixed on 09-29, caused none. Of the 19 real conflicts, 11 touched committed PDFs, 6
  committed generated JS, 14 hand-written source. Git hooks now refuse a needless catch-up before it happens.
---

# Conflict reduction: what still conflicts, and what each fix buys

**The owner asked:** changelog.d, followups.d and the decision index already keep
parallel PRs from colliding. What else conflicts, and how much of the merge queue's
churn can we remove? Every real conflict forces a catch-up, and every catch-up
re-runs the PR's CI and then its queue run.

## 1. The measurement

**Source.** The 52 PRs merged from 2026-09-29T12:00Z to 2026-10-06. For each PR,
the head commits CI saw, in order, from the Actions API (`runs?branch=<head>`). A
push counts as a catch-up when the head's merge base with `main` moved: a rebase if
the old head is not an ancestor of the new one, a merge from main if it is.

**Replay.** For each catch-up, `git --attr-source=<empty tree> merge-tree
--write-tree <old head> <new merge base>` asks whether the head being replaced would
have merged cleanly with the main it caught up to. The empty attribute source turns
off `.gitattributes` merge drivers, because GitHub ignores them
(`2026-09-28-rebase-only-on-conflict.md` §4b). This is `tools/queue-precheck.sh`'s
own check.

**Whole window, 2026-09-29 12:00 to 10-06:** 63 catch-ups on 28 PRs, 40 real
conflicts. Every conflict on `docs/route-budget.json` (9) and on
`engineering/decisions/README.md` (7) came from a head created before its fix
landed on 09-29 (#2500, #2480). Both fixes held.

**From 2026-09-30, under today's rules:**

| | Catch-ups |
|---|---|
| All | **28**, on 21 PRs |
| Clean on GitHub's terms | **9**: 7 agent-session catch-ups, which were needless; 2 backlog-bot re-syncs (#2499), which carry new content and are not waste |
| Real conflicts | **19** |
| …only in committed PDFs or generated JS | 5 |
| …in those and in hand-written source | 6 |
| …only in hand-written source | 8 |

Committed PDFs show up in 11 of the 19 real conflicts (48 different PDF files), and
committed generated JS under `lib/` in 6. The hand-written conflicts cluster in two
lines of work that ran in parallel: the plugin system (`lib/plugins/*`,
`tools/build-plugin-registry.js`) and the Studio (`StudioShell.tsx`, `ShareSheet.tsx`,
`CommandPalette.tsx`, `studio-commands.ts`).

`BACKLOG.md` caused none. Only the nightly bot writes it (3 of its 4 commits since
09-01), so nothing else edits it at the same time. Splitting it would buy nothing.

**Re-derive.** The scripts are not committed; the method above is the whole of it.
The replay needs the force-pushed heads, which `git fetch origin <sha>` still returns.

## 2. Fix 1: refuse a needless catch-up at the moment it happens

HARD RULE #16 already says to rebase only on a real conflict, and 7 of 26 agent
catch-ups were clean anyway. **They are an upper bound on waste, now classified.**
The replay sees "clean on text", not intent, so each clean catch-up was checked for a
reason (6 of the 7 still had their heads after a container restart). None followed a
queue ejection. One merged `main` to bring in a named fix (#2518, "bring in ed97ec9 …
fixes studio-smoke's … flake"), which #16 allows. The other five gave no reason.
**About five needless catch-ups a week is the number this targets.** Each re-ran the
PR's CI, plus its queue run if it was already queued.

### 2.1 The design that shipped

`tools/rebase-guard.sh` runs as two git hooks through lefthook: `pre-rebase` (also hit
by `git pull --rebase`) and `pre-merge-commit`. It refuses only when both hold:

1. **The target brings in `main` commits the branch lacks.** Rebasing onto the branch's
   own remote, onto a stacked parent that is not ahead of `main`, or onto the branch's
   own merge base is never checked.
2. **`queue-precheck.sh --head=HEAD --onto=<target>` reports the merge clean on
   GitHub's terms** (merge drivers off). A real conflict, including one only GitHub
   sees through a `merge=union` file, is allowed.

The details that make it safe:

- **It sees the real local head before anything changes.** Unpushed commits count, and
  a refusal leaves the branch exactly as it was.
- **A merge that conflicts never reaches `pre-merge-commit`.** Git stops first, so a
  needed merge cannot be refused.
- **Merge targets come from `/proc`.** Git 2.43 does not write `MERGE_HEAD` before an
  automatic merge commit, so the guard reads the `git merge` command line of an
  ancestor process. Where `/proc` is missing (macOS), the merge is allowed unchecked.
- **History cleanup has a stated path:** `git rebase -i "$(git merge-base HEAD
  origin/main)"`, which does not move the base and is never checked.
- **The escape accepts exactly two forms**, and the reason is printed on every use:
  - `LATTICE_REBASE_REASON="needs <sha>"` passes only if that commit is in the
    target and not yet in the branch.
  - `LATTICE_REBASE_REASON="queue ejected: <why>"` covers a rebase after an ejection.

  Free text is rejected, so the variable cannot quietly become the default.
- **Cost.** About 0.2s, and only when the target brings in newer `main`.
- **`pre-push` is now `piped: true`.** Without it, lefthook ran every remaining job
  after one failed (reproduced with the real binary). This is independent of the guard,
  and it makes the hook's "fail-fast" description true.

**Tests.** `test/unit/tools/rebase-guard.test.js` drives real git through the real
lefthook binary, using the hook sections read from this repo's `lefthook.yml`. It
covers 11 cases:

- needless rebase refused, with the branch unchanged;
- real-conflict rebase allowed;
- unpushed local commit that conflicts → allowed;
- cleanup on the branch's own merge base;
- rebase onto the branch's own upstream;
- stacked branch onto its parent;
- `merge=union` clash allowed;
- needless merge refused, with no merge commit created;
- conflicting merge allowed;
- `needs <sha>` validation;
- `queue ejected:` accepted, free text rejected.

Six deliberately broken guards each fail it: never refuse, drop the "brings `main`"
test, ignore precheck, skip the `needs` validation, accept free text, and skip the
`/proc` merge detection.

### 2.2 The design it replaced, and why

The first version ran at `pre-push` and judged each pushed branch update. The
adversarial trio on PR #2561 refuted it. A push-time check has to reconstruct the
head from before the catch-up, and it reconstructed it wrong:

- **It judged the remote head, not the local one.** When an unpushed local commit was
  what conflicted with `main`, it refused the needed merge. Its undo advice
  (`git reset --hard <remote head>`) would have deleted that unpushed commit.
- **Its patch-id comparison hashed the whole range as one patch.** So it refused a
  squash across files, and it refused rewords, which patch-id cannot see at all.
- **"Rebase, then commit, then push" slipped through.**
- **The escape took free text.**

Checking at rebase and merge time removes the reconstruction, and with it every one of
these.

## 3. Committed generated JS under `lib/`: deferred

40 `lib/**/*.generated.*` files are still committed, although the 2026-08-17 decision
stopped committing `dist/` for the same reason. They were in 6 of the 19 real conflicts.

**Uncommitting is feasible.** Every CI workflow that loads them runs root `npm ci`, and
`npm ci` runs `prepare` (`tools/build.js --only-uncommitted`). The workflows that skip it either
run no repo code or run scripts that import none of them (`labels.yml` and
`sync-backlog.yml` run `tools/*`; three more run `.github/scripts/*.js`). It would add up to ~27s to `npm install`: the full build takes 39s,
against 12.5s for the steps already uncommitted.

**The owner deferred it until the Tauri desktop app lands.** That app embeds the engine,
and nothing in this repo shows whether its build runs `npm install`. Tracked in
`followups.d/2554-p3-uncommit-generated-js-after-desktop-app.md`.

## 4. Splitting `lint-core.js`: dropped

`lib/authoring/lint-core.js` is the busiest hand-written file (22 commits since 09-06), and
it caused 2 conflicts in the whole replay window. A new rule lands in four places in the
file: its imports, the rule's own function, the call in `lintChunksWith`, and
`module.exports`. Two PRs adding rules touch different lines in all four, and git merges
them. No hand-written file caused more than 3 conflicts.

**The hand-written conflicts follow parallel work, not files.** Of the 14 real conflicts
in hand-written code from 09-30, most came from two lines of work that ran side by side:
the plugin system and the Studio. The lever there is in how work is scheduled, for
example at most one open PR per subsystem at a time. That is the owner's call, and it is
not adopted here.
