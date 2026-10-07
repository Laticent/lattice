---
status: in-progress
summary: >
  Replayed every catch-up (rebase or merge from main) on 21 PRs merged 2026-09-30..10-06 on
  GitHub's terms: 28 catch-ups, 19 real conflicts, 9 clean. 2 of the 9 were the backlog bot's
  nightly re-sync, so 7 of 26 agent catch-ups were needless. The decision index and route
  budget, fixed on 09-29, caused none. Of the 19 real conflicts, 11 touched committed PDFs, 6
  committed generated JS, 14 hand-written source. A Claude Code hook now warns before a needless catch-up; two blocking designs were refuted.
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

## 2. Fix 1: warn before a needless catch-up; two blocking designs refuted

HARD RULE #16 already says to rebase only on a real conflict, and 7 of 26 agent
catch-ups were clean anyway. **They are an upper bound on waste, now classified.**
The replay sees "clean on text", not intent, so each clean catch-up was checked for a
reason (6 of the 7 still had their heads after a container restart). None followed a
queue ejection. One merged `main` to bring in a named fix (#2518, "bring in ed97ec9 …
fixes studio-smoke's … flake"), which #16 allows. The other five gave no reason.
**About five needless catch-ups a week is the number this targets.** Each re-ran the
PR's CI, plus its queue run if it was already queued.

### 2.1 What shipped: a warning, before git starts

`.claude/hooks/warn-needless-catchup.sh` is a Claude Code `PreToolUse(Bash)` hook,
next to `warn-unbounded-wait.sh`. It works in three steps:

1. **It matches the command.** It reads only the payload's `command` field and looks,
   one shell segment at a time, for either form:
   - `git … rebase|merge|pull` that names `main`;
   - a bare `git pull` (or `git pull --rebase`) on a branch that tracks `origin/main`.

   A segment using `merge-base` is skipped.
2. **It runs the same check as the Stop hook.** That is `tools/queue-precheck.sh
   --no-fetch`, run in the shell's starting directory (the payload's `cwd`; a `cd`
   inside the command is not followed). The two cannot disagree.
3. **It warns only when the branch is behind and merges cleanly** on GitHub's terms.
   The warning says the catch-up is not needed, lists the cases #16 allows, names
   GitHub's "Update branch" as the same cost, and gives the cleanup command that does
   not move the base.

The properties that make it safe:

- **It never blocks.** It exits 0 on every input, garbage included.
- **It acts before git starts,** so it can strand no stash, merge state or rebase.
- **It does not affect git state or shells,** and ref names are never evaluated.
- **It is cheap.** About 5 ms on a command that names none of rebase/merge/pull, which
  is nearly all of them. That is the same as the existing `warn-unbounded-wait.sh`,
  measured the same way. About 14 ms when a keyword appears but no catch-up matches,
  and about 80 ms when it runs the precheck.

**Its limits, stated.**

- It sees only agent sessions' Bash commands. A human at a terminal and GitHub's
  "Update branch" button are out of its reach.
- A warning can be ignored.
- The coarse match can fire on a command that only mentions such a rebase. It did
  exactly that, live, on this PR's own benchmark command. That costs one ignorable
  line.

**Tests.** `test/unit/tools/warn-needless-catchup.test.js` has 30 cases, driving the
hook with real payloads against real scratch repos:

- **Warns on six command forms:** rebase, fetch-then-rebase, merge, pull,
  `pull --rebase`, and `git -C`.
- **Stays quiet on nine others:** a real conflict, a branch already level with
  `main`, cleanup on the branch's own merge base (two spellings), `merge-base`,
  `status`, `log`,
  a rebase onto another branch, and two separate commands.
- **Exits 0 on bad input:** empty input, input that isn't JSON, and running outside
  a repo.
- **Covers the final checker's gaps (five cases):**
  - a bare `git pull` while tracking `origin/main` warns;
  - a bare pull while tracking the branch's own remote stays quiet;
  - a description mentioning merge and main does not trigger it;
  - `merge-base` in one segment does not silence a rebase in the next;
  - the payload's `cwd` is the repo judged.
- **Covers the second checker's gaps (six cases):**
  - a bare pull on its own line of a multi-line command warns;
  - lines are separate commands, so `git status` then `npm run pull` does not warn;
  - quoted or suffixed refs warn: `'origin/main'`, `origin/main~0`, `origin/main^`;
  - `origin/maint` is not `main`.

  The previous version of the hook fails five of them; it already got `origin/maint` right.
- **Is registered** in `.claude/settings.json`.

Six deliberately broken hooks each fail it: ignore the precheck, drop the cleanup
skip, drop bare-pull detection, drop the upstream check, ignore the payload's `cwd`,
and drop the level-branch silence.

**Also shipped:** `pre-push` is now `piped: true`. Without it, lefthook ran every
remaining job after one failed (reproduced with the real binary). This is independent
of the catch-up work, and it makes the hook's "fail-fast" description true.

### 2.2 Why not block: two designs, two trio rounds

The owner asked for a blocking guard first. Both versions were built, tested, and then
refuted by the adversarial trio (red team, Munger inversion, checker) on PR #2561.

**At pre-push.** It judged each pushed branch update after the fact.

- **It judged the remote head, not the local one.** When an unpushed local commit was
  what conflicted with `main`, it refused the needed merge. Its undo advice
  (`git reset --hard <remote head>`) would have deleted that commit.
- **Its patch-id comparison hashed the whole range as one patch.** So it refused a
  squash across files, and it refused rewords, which patch-id cannot see.
- **"Rebase, then commit, then push" slipped through.**

**At pre-rebase and pre-merge-commit.** It judged the catch-up as it started.

- **Git had already acted when the hook refused.**
  - `--autostash` had stashed uncommitted edits. They were stranded in
    `.git/rebase-merge/autostash`, and git's printed advice (`rm -fr`) deleted them.
  - A refused merge stayed half-done, and git's own hint, `git commit`, finished it
    with no check.
- **Lefthook's `{0}` passed ref names to `sh -c`.** A branch named
  `y$(touch PWNED)` ran code, and an ordinary `fix(ui)` could not be rebased.
- **Syncing with your own PR was refused** when someone had used "Update branch".
- **Several forms got through unchecked:** `git rebase --root` broke outright, macOS
  bash 3.2 would likely refuse every merge, and `--onto`, `git -C`, `--no-commit` and
  `--squash` bypassed it.

**The lesson.** A git hook that refuses runs *inside* a git operation that may already
have changed state. Making it safe means handling every partial state git can leave
behind, and every round of fixes added surface for the next round to break. All of it
to save about five CI runs a week. The owner chose the warning.

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
