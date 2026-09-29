---
status: shipped
summary: >
  The per-route byte ledger held one number per metric, set to the measurement plus about
  280 bytes, so nearly every PR that touched the Studio edited the same line and prepended
  to the same 48KB note string in `docs/route-budget.json`: 14 of 49 commits on `main` in about
  36 hours. Each number is now a SOFT target; the HARD limit is soft × 1.03, computed in the
  gate and never stored. Between the two the build passes and warns. A PR edits the ledger
  only to cross the hard limit (owner's OK first) or to bank a stale win, and history moved
  to `docs/route-budget.history.md`. Each PR also gets its own allowance: 2KB of eager JS
  over `main`, measured in CI, past which it adds an explanation file in
  `docs/route-budget.d/`.
---

# The route budget gets a soft target and a hard limit

## 1. The problem

`docs/scripts/check-route-budget.mjs` fails the docs build when a route's eager JS or HTML
grows past its number in `docs/route-budget.json`
([2026-08-17-studio-dynamic-loading-audit.md](2026-08-17-studio-dynamic-loading-audit.md) §9.7).
The owner's rule set the Studio's number to the measurement plus about 280 bytes. That kept
growth visible in the PR that caused it, but it put every Studio PR on one shared line:

- **14 of 49 commits** on `main` edited the file, all of them in 2026-09-27 23:28 to
  09-29 12:15, and the Studio's `eagerJsGz` went 623,460 → 637,490 (+14KB in about
  36 hours, roughly 9KB/day). The window is this clone's 50-commit depth, not a choice.
  [#2466's follow-up](../../followups.d/2466-p2-committed-generated-files-conflict-across-prs.md)
  counted 50 of the last 300 commits.
- **Every raise also prepended to `_eagerJsGzNote`**, a single JSON string that had reached
  48KB. Two PRs raising at once always conflicted in git.
- **Two PRs could each fit and fail together.** Each measured its own branch, so the second
  into the merge queue was over the budget on the combined tree and had to re-measure and
  raise again. The note already recorded this ("RE-SET ON THE MERGED TREE", #2322).

## 2. The decision

| Measured | Gate | Ledger edit? |
|---|---|---|
| ≤ soft | pass | no |
| soft < measured ≤ hard | **pass, and print the room left** | no |
| > hard | fail | a reset, with the owner's OK |
| < soft − 5% | fail as STALE | a reset (routine) |

- **Hard = soft + 3%** (`HARD_HEADROOM_PCT`). The owner chose 3% on 2026-09-29: the margin
  the other four routes already carried, and about 19KB on the Studio. At the recent
  ~9KB/day that is about two days of growth before a reset. (The owner picked 3% against
  a first estimate of four days; the corrected pace was reported back the same day.) It lives in the script, not the ledger, so a PR cannot widen its own
  room by editing a number.
- **A reset needs the owner's OK before it raises anything.** The owner chose this over an
  any-session reset. `npm run route-budget:rebaseline -- --reason "…"` (in `docs/`)
  lowers each stale soft target to the measurement and prepends a dated entry to
  `docs/route-budget.history.md`. It raises a target only with `--raise`, which a session
  types after the owner's OK; without it, it lists the raise it refused. Lowering is routine.
- **All five routes** follow the same rule, so the gate has one code path.
- **The notes left the JSON.** They moved verbatim to `route-budget.history.md`. Only a
  reset writes there, and resets are rare, so conflicts there are rare too, though two
  resets in flight at once would still collide. A unit test pins the ledger to `html`, `eagerJsGz`
  and `htmlRaw` so no note string grows back.

## 3. What soft/hard alone gives up

Growth under the hard limit no longer shows up as a line in the PR's diff. On its own
that turns the band into a commons: the first PRs to arrive spend it without accounting
for it, and whichever PR finally crosses the hard limit pays for the reset, even if it
added 200 bytes. It happened within an hour of the switch: #2493 and #2494 grew the Studio
by 1.4KB with no line in either diff. §5 closes this with a per-PR allowance.

Two PRs that together use more than the remaining band still collide in the merge queue.
With 19KB of room and PRs that grew the Studio by 245 bytes to 2.2KB each (one outlier at
5.2KB) in the 36 hours before, that is the exception, and it lands at the moment a reset was
due anyway.

## 4. Numbers at the switch

One number changed in the switch, with the owner's OK: the Studio's `eagerJsGz` soft target
went 637,490 → 626,300. CI's docs-build on `60279f5` measured 611.4KB (626,022–626,124
bytes gz, 101 chunks), and a local build read 625,997, so the old target held about 11KB of
room that no PR had claimed. Under soft/hard that room would have stacked on top of the 3%
band. The last recorded measurement before this change was 637,211 in 99 chunks, so a
change on `main` shrank the eager path; this note does not track down which one.

The four content routes' numbers already carried about 3% headroom above their
measurements, so under this rule their hard limits sit about 6% above measured until a
reset lowers them.

## 5. The per-PR allowance

The owner asked for a budget per session on top of soft/hard. The gate cannot see a
session, but it can see a PR, and one PR per line of work makes the two the same thing.

- **Each PR may add up to 2KB (gzipped) of eager JS to any route, measured against
  `main`** (`PR_ALLOWANCE_BYTES`). The owner set 2KB: 8 of the Studio's last 10 raises
  before the switch were under it; the two over were +2,220 and +5,202 bytes.
- **Past the allowance, the build fails unless the PR adds its own file under
  `docs/route-budget.d/`** saying what grew and why. One file per PR, so two PRs never edit
  the same line, the same way `changelog.d/` works. The next reset folds those files into
  `route-budget.history.md` and deletes them.
- **The growth is measured, not declared.** On `pull_request`, CI's docs-build job runs
  `docs/scripts/measure-route-base.sh`: it builds the PR's base in a git worktree, with
  `node_modules` hard-linked from the checkout when the lockfiles match, and passes the
  numbers to the gate. Measured locally: 61–85s, depending on load. The owner approved adding this CI step
  over publishing `main`'s numbers from the deploy workflow, which costs no build time but
  adds moving parts and can lag behind a PR's real base.
- **Only eager JS has an allowance.** Two builds of the same `main` gave identical eager JS
  and HTML sizes a few bytes apart (1–6), and HTML has soft/hard.
- **Not in the merge queue.** There the base already carries the PRs ahead, so the
  difference would not be this PR's own. The queue still enforces soft/hard.
- **A base that fails to build does not fail the PR.** The step writes no numbers and the
  gate logs the allowance as NOT checked, because a PR cannot fix `main`.
- **Locally**, `npm run check:route-budget` says the allowance was not checked; the header
  of `measure-route-base.sh` shows how to run it against `origin/main`.
- **Known gaps.** A base whose docs build stops before `inject-modulepreload` is skipped,
  not measured. And the allowance runs only where docs-build runs: CI's `docs` path filter
  does not include the root `package.json`/lockfile or `tools/**`, so a root dependency bump
  or a bundler change that grows a route meets only soft/hard.

Together the three layers give each PR a limit (2KB unless explained), the total a limit
(soft + 3%), and the owner a checkpoint (every raise of soft).
