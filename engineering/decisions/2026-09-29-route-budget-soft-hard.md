---
status: shipped
summary: >
  The per-route byte ledger held one number per metric, set to the measurement plus about
  280 bytes, so nearly every PR that touched the Studio edited the same line of
  `docs/route-budget.json` (14 of 49 commits on `main` in about 36 hours) and any two
  conflicted. Each metric now has a soft target and a ceiling set 10% above it. A PR gets
  2KB of eager JS free while the route stays at or under soft; every byte above soft is
  declared per route in the PR's own `docs/route-budget.d/` file. A test holds the ledger to
  its history file. The measurement now follows static imports, which had hidden 183KB gz
  on the home route.
---

# The route budget gets a soft target, a ceiling and a per-PR allowance

## 1. The problem

`docs/scripts/check-route-budget.mjs` fails the docs build when a route's eager JS or HTML
grows past its number in `docs/route-budget.json`
([2026-08-17-studio-dynamic-loading-audit.md](2026-08-17-studio-dynamic-loading-audit.md) §9.7).
The owner's rule set the Studio's number to the measurement plus about 280 bytes. That kept
growth visible in the PR that caused it, but it put every Studio PR on one shared line:

- **14 of 49 commits** on `main` edited the file, all of them in 2026-09-27 23:28 to
  09-29 12:15, and the Studio's `eagerJsGz` went 623,460 → 637,490 (+14KB in about
  36 hours, roughly 9KB/day). The window is this clone's 50-commit depth, not a choice.
  #2466's follow-up (closed; see [conflict reduction §5](2026-10-06-conflict-reduction.md))
  counted 50 of the last 300 commits.
- **Every raise also prepended to `_eagerJsGzNote`**, a single JSON string that had reached
  48KB. Two PRs raising at once always conflicted in git.
- **Two PRs could each fit and fail together.** Each measured its own branch, so the second
  into the merge queue was over the budget on the combined tree and had to re-measure and
  raise again. The note already recorded this ("RE-SET ON THE MERGED TREE", #2322).

## 2. The decision

Each metric of each route carries two numbers in `route-budget.json`: a **soft** target and
a **ceiling** (`hard`).

| Measured | Gate |
|---|---|
| ≤ soft | pass |
| soft < measured ≤ ceiling | pass, with a warning on the CI summary page |
| > ceiling | fail |
| < soft − 5% | fail as STALE; lower it (routine) |

And per PR, against `main` (§5):

| The PR's growth | Gate |
|---|---|
| up to 2KB, and the route stays at or under soft | pass, nothing to write |
| any byte that lands above soft | declare it: `studio: +N` plus why, in the PR's own `docs/route-budget.d/<slug>.md` |

- **The ceiling starts 10% above soft** (`CEILING_PCT`), about 64KB on the Studio: weeks of
  growth, not days. The owner chose this on 2026-09-29 over a hard limit at soft + 3%, which
  at ~9KB/day would have asked for a raise every two days (§3).
- **Every number moves only through `npm run route-budget:rebaseline`**, which writes the
  ledger and a dated entry in `docs/route-budget.history.md` together, in a PR of its own. It
  lowers stale soft targets on its own. Raising soft needs `--raise`, and moving a ceiling
  needs `--ceiling`; each needs the owner's OK first. It refuses to run on a branch behind
  `origin/main`, whose numbers would be stale.
- **A test holds `route-budget.json` to the newest history row** for every route and metric,
  so a hand edit to the ledger alone fails the unit tier. Editing both files by hand still
  passes, so on pull requests the gate also lists every number the PR raises over its base,
  on the summary page, where the owner looks before approving.
- **The notes left the JSON.** The ten per-route note strings moved verbatim to
  `route-budget.history.md`, below the dated entries.

## 3. What the adversarial review changed

The first cut had a hard limit at soft + 3%, computed rather than stored, and a flat 2KB per
PR. An inversion pass and a red team (HARD RULE #25) found it recorded growth without ever
refusing it:

- **The band was a commons.** Nine PRs of +2,047 bytes filled the whole soft-to-hard band
  with nothing written down. Now nothing above soft is free.
- **One explanation file cleared every route for any amount.** `echo x > route-budget.d/a.md`
  passed +100KB. Now a file must declare bytes per route, cover what CI says is owed, and
  give a reason.
- **Soft could be raised by hand**, and the hard limit followed it. Now the history test
  catches a ledger-only edit, and CI flags any raise over the base on the summary page.
- **At soft + 3% the hard limit was hit about every two days**, by whichever PR tipped it,
  with every Studio PR in flight tipping together and each asking the owner for a raise.
  The 10% ceiling turns that into a rare decision.
- **The base was the event's `base.sha`**, which can be an older `main` than the test-merge
  commit CI builds, charging a PR for other PRs' growth. Now CI measures the merge commit's
  first parent.
- **The measurement missed most of three routes** (§4).
- **The warning printed only in a log nobody reads.** The gate now writes its table, the
  per-PR growth and any "NOT checked" to the job's summary page.

## 4. The measurement now follows static imports

`measure()` counted only the `/_astro/*.js` a route's HTML names. The Studio and Playground
list most of their static-import closure there (`inject-modulepreload.mjs` `ENTRIES`), though
not all of it: following imports adds 8 chunks (3.9KB gz) on the Studio and 14 (27KB) on the
Playground. The content routes list only their island entry points, so React and the shared
UI chunks their islands import were invisible.
The red team appended 300KB to two shared chunks and three routes read +0.

`measure()` now follows each counted chunk's static imports (`import … from "./x.js"`,
`import "./x.js"`, `export … from "./x.js"`), never `import()`. Measured on `bbe5a60`:

| Route | Old budget (bytes gz) | Measured now (bytes gz) | Chunks |
|---|---|---|---|
| studio | 637,490 | 636,788 | 111 |
| playground | 602,240 | 629,388 | 62 |
| home | 80,300 | 262,124 | 52 |
| components | 81,400 | 167,399 | 38 |
| getting-started | 76,600 | 149,548 | 37 |

The owner approved one reset for the switch: every eager-JS soft target is set to that
measurement, every ceiling 10% above. HTML soft targets are unchanged. The first entry in
`route-budget.history.md` records all ten.

Still not counted: code a page loads with `import()` at startup unless
`inject-modulepreload.mjs` lists it, scripts served outside `/_astro/`, inline scripts
(counted only as HTML bytes), and CSS.

## 5. The per-PR allowance

The owner asked for a budget per session. The gate cannot see a session, but it can see a
PR, and one PR per line of work makes the two the same thing.

- **Free bytes: up to 2KB, and only the part that stays at or under soft**
  (`PR_ALLOWANCE_BYTES`, `freeBytes()`). The owner set 2KB: 8 of the Studio's last 10 raises
  before the switch were under it; the two over were +2,220 and +5,202 bytes.
- **The growth is measured, not declared.** On `pull_request`, CI's docs-build job runs
  `docs/scripts/measure-route-base.sh` on the test-merge commit's first parent: it builds that
  base in a git worktree, with `node_modules` hard-linked when the lockfiles and
  `docs/patches` match, and hands the numbers to the gate. 67s on a GitHub runner, 61–85s
  locally. The owner approved this CI step.
- **A base that fails to build does not fail the PR.** No numbers are written, and the gate
  reports the allowance as NOT checked, on the summary page, because a PR cannot fix `main`.
- **Locally**, `npm run check:route-budget` reports the allowance as NOT checked; the header
  of `measure-route-base.sh` shows how to run it against `origin/main`.

## 6. What this does not cover, by choice

The owner declined each of these on 2026-09-29 as more CI or settings than the value
justifies. They are the remaining ways growth goes unaccounted:

- **The merge queue skips the allowance.** A PR measured against an older `main` can still
  re-eager something another PR made lazy; only the ceiling catches it.
- **PRs the docs path filter skips skip the allowance**: the root `package.json`, its lockfile
  and `tools/**`, including Dependabot bumps that merge themselves. Only the ceiling catches
  them.
- **No code-owner review on the ledger.** The history test, the raise flag on the summary
  page and the owner's merge approval are what stand between a session and a raise.
- **A PR can edit the gate itself**, since CI runs the PR's own copy. The unit tests pin the
  owner's numbers (10%, 2KB), so doing it is a visible edit to a test.

Watch for: explanation files that do not match the growth (each reset records declared
bytes against the raise), and PRs that move eager code behind `import()` to dodge the count.

## 7. The base and the branch must build the same bytes (2026-10-15)

The allowance in §5 compares two builds, so it is only as exact as the build is repeatable.
It was not: `measure-route-base.sh` at `9cef5d6`, run twice, measured the Studio 2 bytes and
the Playground 3 bytes apart, and #2708, which changed no bundled code, failed the docs build
on +2 bytes.

**Cause: the checkout path reached the chunk names.** Two builds in one folder were
byte-identical; two builds of one commit in two folders were not. The only content that
differed was the engine's asset version in `/playground/v/<hash>/`, which
`sync-playground-assets.mjs` hashes from the staged engine files. Those differed only in their
`chunk-[hash]` names. esbuild keys a `file` module relative to `absWorkingDir`, but a plugin
namespace keeps the path text the plugin returns, and the keys feed the chunk hash. Two plugins
in `tools/build-playground.js` returned absolute paths: `lazy-chart-registry` and
`lint-boundary-parser`. The base is built in a fresh `mktemp -d` folder, so every run named the
chunks differently.

**Fix: both plugins return repo-relative paths, with `/` on every OS**, and
`assertCheckoutIndependent()` fails the engine build when any module key, namespace stripped, is
an absolute path, so a new plugin cannot bring it back. It tests for an absolute path rather than
searching for the checkout's text: a checkout at `/src` would match `docs/src/…`. `test/unit/tools/build-playground-determinism.test.js` runs the shipped build options.

**The HTML had the same bug, in Astro.** Astro names each island
`uid = shorthash(componentUrl + html + props)`, and at build time `componentUrl` is the
component's absolute source path. shorthash is variable-length, so `htmlRaw` moved 1–3 bytes
between folders even after the engine fix. It never failed a PR, because only `eagerJsGz` is
compared against `main`, but it meant `htmlRaw` never measured the same twice. A patch to Astro would have to be re-made on every
Astro upgrade, so `docs/scripts/stable-island-uids.mjs` rewrites each uid after the build instead,
next to `hoist-stylesheets.mjs`. The new uid hashes the island's own tag without its uid, plus its
position among identical tags, at a fixed length of 8. Astro's uids run 5–7 characters, so a
page grows 1–3 bytes per island, once (13–17 bytes on the pages with seven islands). Rewriting is safe: Astro's island runtime never
reads the uid (it is for dev-mode HMR), no `/_astro` chunk reads it, the site uses neither view
transitions nor server islands, and React's ids come from the separate `prefix` attribute.

So the gate needs no noise band: three `measure-route-base.sh` runs of one commit, each in a
fresh temp folder, measure every metric of every route identically. #2709 records the runs.
