---
status: in-progress
summary: >
  Replayed every catch-up (rebase or merge from main) on 21 PRs merged 2026-09-30..10-06 on
  GitHub's terms: 28 catch-ups, 19 real conflicts, 9 clean. 2 of the 9 were the backlog bot's
  nightly re-sync, so 7 of 26 agent catch-ups were needless. The decision index and route
  budget, fixed on 09-29, caused none. Of the 19 real conflicts, 11 touched committed PDFs, 6
  committed generated JS, 14 hand-written source. A pre-push guard now refuses a needless catch-up.
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
| Clean on GitHub's terms, so needless | **9**: 2 are the backlog bot's nightly re-sync (#2499), 7 are agent sessions |
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

## 2. Fix 1 (shipped): refuse a needless catch-up at pre-push

HARD RULE #16 already says to rebase only on a real conflict, and 7 of 26 agent
catch-ups broke it anyway. `tools/rebase-guard.sh` runs first in lefthook's
`pre-push` stage, with `use_stdin: true`. For each branch update that moves the
branch onto a newer main, it asks `queue-precheck.sh --head=<remote head>
--onto=<new merge base>` whether the head being replaced merged cleanly. If it did,
the guard refuses the push and prints how to undo the catch-up.

- **It refuses only on proof.** It lets through a new branch, a deletion, a push to
  `main`, an amend or ordinary push on the same main, an old head this clone does not
  have, and anything queue-precheck cannot decide (its exit 3).
- **The rule's own exception has an escape.** When you need a specific commit from
  main: `LATTICE_REBASE_REASON="needs <sha>: <why>" git push`. The guard prints the
  reason and allows the push.
- **The bot is not affected.** `sync-backlog.yml` pushes from CI, where no hook runs.
  Its re-sync carries new content, so it is not waste.
- **Cost.** One `merge-tree` per catch-up push; nothing on any other push.
- **Tests.** `test/unit/tools/rebase-guard.test.js` builds real throwaway repos and
  covers seven cases: a needless rebase, a needless merge from main, a real conflict,
  a `merge=union` clash that only GitHub sees, the escape, an amend, and the four
  pass-through cases. Two deliberately broken guards each fail it (2 and 3 failures).

`queue-precheck.sh` gained `--head=<rev>` and `--onto=<rev>` (defaults `HEAD` and
`origin/main`), so the guard reuses its GitHub-terms merge rather than copying it.

## 3. Committed generated JS under `lib/`: deferred

34 `lib/**/*.generated.*` files are still committed, although the 2026-08-17 decision
stopped committing `dist/` for the same reason. They were in 6 of the 19 real conflicts.

**Uncommitting is feasible.** Every CI workflow that loads them runs root `npm ci`, and
`npm ci` runs `prepare` (`tools/build.js --only-uncommitted`). The two workflows that skip
it import none of them. It would add up to ~27s to `npm install`: the full build takes 39s,
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
