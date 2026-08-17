---
status: superseded
summary: >
  The merge queue ejected PRs with MERGE_CONFLICT on the committed generated bundles;
  #1686 needed three rebase cycles for a change that was already green. Measured, it is
  arithmetic and not luck: 32 of 50 recent commits touch dist/, 21 touch the emulator
  bundles, and the minified files run ~9.6 KB PER LINE, so two such PRs conflict with
  certainty. The merge-driver fix is impossible and was disproved before any code was
  written — a custom driver is declared in .gitattributes but implemented in local git
  config, which GitHub's server-side queue merge does not have. Uncommitting the bundles
  was the first recommendation and was WRONG: the grab-and-go surface IS this file set
  (marp-kit is a copy-and-go folder, jsdelivr's /gh/ route serves any public repo path
  without anyone declaring it), and dist/marp-kit/lattice.min.css and dist/lattice.min.css
  are the 6th and 7th most-churning files in the repo, so there is no carve-out that keeps
  one and fixes the other. The design instead keeps the bundles committed on main but
  takes them OUT OF PULL REQUESTS, written on main by a rebuild workflow that reaches it
  by PR on one force-pushed branch. It fixes the ejection and does NOT reduce the derived
  history churn — that is the trade, made deliberately. NOT MERGEABLE AS IT STANDS: the
  independent checker returned do-not-merge and §8 carries the blocking list. The
  enforcement surface was not swept — playground:check still byte-checks a now-bot-owned
  bundle and deadlocks 11 of the last 50 PRs, the release flow can no longer commit dist/,
  and the new freshness gate re-opens #1547's ejection on decisions/README.md, the repo's
  highest-churn file, because it assumed every generator's --check is a byte-diff when
  #1547 had deliberately made one weaker. Several figures in §2/§3/§7 are also off and are
  corrected in §8.
---

# The committed bundles vs. the merge queue

**Follow-on from #1686.** Third of three threads off the render-cost work, and the
one that taxed every PR in the repo rather than one deck.

> **SUPERSEDED by `2026-08-17-generated-bundles-uncommitted.md`. Not implemented.**
> This design kept the bundles committed and forbade PRs from carrying them. It
> rested on one claim — that people fetch `dist/` from the git repo, and that this
> was **unverifiable from the sandbox**. It was verifiable with one unauthenticated
> HTTP GET: jsDelivr's public stats show **2 lifetime `/gh/` hits, both against an
> immutable commit SHA**, zero branch pins, against a repo with 0 forks and no
> release ever cut. The bundles are now simply not committed, which fixes the
> ejection *and* the history growth *and* the docs-site skew, and deletes all of
> the machinery below.
>
> **Kept, not deleted, because the route is the lesson.** §8 is an independent
> checker's do-not-merge on the first implementation; §10 is the rework; and the
> whole file is the record of an expensive architecture built to avoid measuring a
> premise. See §3 of the superseding note.


> **An independent checker (HARD RULE #25) returned "do not merge" on the first
> implementation, with three reproduced blockers.** All are now fixed and the
> gate was rebuilt rather than patched — §8 is the review as received, **§10 is
> what changed in response**, and the two should be read together. The mechanism
> (keep the bundles committed, keep them out of PRs) survived review unchanged;
> the enforcement surface around it did not.
>
> **Still UNVERIFIED: `rebuild-generated.yml` has never executed.** A GitHub
> Actions workflow cannot be run from the sandbox. Its shape is copied from
> `sync-backlog.yml`, which has run for weeks, but the first real firing is the
> test. It is dispatchable on demand.

`2026-08-10-decisions-index-merge-queue-race.md` §5 named this: *"Nothing sweeps
the other committed generated artifacts… `dist/` is the obvious next candidate."*
#1594 then swept the build and reached a conclusion this note revises.

## 1. What #1594 got right, and the one thing it under-weighted

#1594's question was the right one — *does this artifact's freshness check assert
anything a single PR cannot be responsible for?* — and it found five aggregates
and removed them. It classified the esbuild bundles and minified CSS as **safe**,
on this reasoning: they *conflict*, which is loud, rather than merging wrongly,
which is silent.

**Loud is still a tax, because the queue cannot resolve a conflict — it ejects.**
And an ejection silently clears auto-merge, so the PR then sits green, approved
and un-queued with nothing saying so. The failure is in git, not in the gate, so
no amount of rewording a freshness check reaches it.

## 2. The size of it, measured

Over the 50 commits a shallow clone carries:

| | |
|---|---:|
| Commits touching `dist/` | **43 / 50 (86%)** |
| Commits touching `dist/lattice-emulator{,.min}.js` | **28 / 50 (56%)** |
| `dist/lattice.min.css` | 61 lines / 586 KB — **~9.6 KB per line** |
| Tracked `dist/` | 135 files |
| Bot-owned tracked files, of 3,958 | **194** |
| **`npm run build`** | **~16 s, no browser, byte-deterministic** |

A file with ~9.6 KB on a line cannot three-way-merge: any two branches that
change it change the same line. At 56% of commits touching the emulator bundles,
two PRs colliding is the expected case, not the unlucky one.

> **The counts here move with the measurement window and have been re-measured
> twice.** An earlier cut of this note read 32/50 and 21/50 over a different
> 50-commit window and quoted `134 files` and `194 + 3,693 = 3,887 tracked`; a
> reviewer found the arithmetic wrong (it was 195 + 3,701 = 3,896 at the time)
> and the ratios have since risen as `main` advanced. Treat the ORDER of
> magnitude as the finding — most commits rewrite these files — and re-measure
> before quoting a figure. The one structural number that does not drift is the
> ~9.6 KB per line, which is what makes the conflict certain.

## 3. Two options that do not work, and why they were closed before coding

**A `.gitattributes` merge driver.** Verified two ways rather than assumed:

- locally, `merge=ours` on a file with no `merge.ours.driver` in git config falls
  straight through to an ordinary text merge and conflicts. A custom driver is
  *declared* in `.gitattributes` but *implemented* in local config, and GitHub
  performs queue merges server-side with no such config;
- server-side merges honor only the built-in strategies. `union` is the only one
  that would avoid a conflict, and on a minified bundle it concatenates both
  sides into a syntactically broken file.

**Uncommitting the bundles.** This was the first recommendation here and it was
wrong. It fixes the ejection *and* the 254 MB, and `npm run build` is 16 s and
browser-free, so the cost looked like plumbing. What it misses:

- **the grab-and-go surface IS this file set.** `dist/marp-kit/` is a copy-and-go
  folder — LICENSE, README, `Sample-Deck.md`, `marp.config.cjs`, `.vscode/`,
  fonts, CSS, runtime — that people browse and download; `npm i` gives you a
  `node_modules` subfolder, not something you can hand to a colleague. And the
  `.min` files' stated purpose is "Production / CDN drop-in", where jsdelivr's
  `/gh/` route serves **any public repo path without anyone declaring it**. An
  unknown number of external pins would 404, silently. That is
  **UNVERIFIABLE from here** (HARD RULE #23) and it is not a risk to take blind;
- **there is no carve-out.** The marp kit's and the engine's minified CSS are
  among the most-churning files in the repo, and they are the same files people
  download. Keeping the grab-and-go files committed and removing the conflicts
  are the same decision about the same files.
  > **Corrected.** This said they were "the 6th and 7th most-churning files";
  > re-measured they are neither that rank nor that count, and — the part that
  > matters — **the single most-churning file in the repo is
  > `engineering/decisions/README.md` (27 of the last 50 commits), ahead of every
  > bundle.** That file is PR-owned, and the first implementation of this design
  > broke it. See §8 B3.

One claim collected on the way: `dist/README.md` asserted that "the README's
jsdelivr / raw URLs point into `dist/`". **False** — the README's only jsdelivr
URL is third-party `npm/mermaid@11`, and the repo's sole `raw.githubusercontent`
URL for this project points at `examples/<slug>.pdf`. Corrected in its generator
here, since this change rewrites that preamble anyway.

## 4. What shipped

**The bundles stay committed on `main`. They come out of pull requests.**

| Piece | What it does |
|---|---|
| `tools/bot-owned-artifacts.js` | The one definition of the boundary — 194 tracked files: `dist/**`, `docs/public/playground/**`, `docs/src/playground/*.generated.js`, the workspace-library `dist/` folders, and the baked theme catalog |
| `tools/check-pr-bundles.js` | Rejects a change that carries them, at `git commit` (`pr-bundles` hook) and in CI. Prints the exact `git restore` that drops them and keeps your source change |
| `tools/check-generated-freshness.js` | `build:check`, rescoped to the artifacts one PR is responsible for. `--all` is the full check |
| `.github/workflows/rebuild-generated.yml` | Rebuilds them on `main` after every merge, reaching `main` by PR on one force-pushed branch |

**Why the rebuild is a PR and not a push.** The `main` ruleset admits no direct
push, automation included (`workflow.md` § Automation vs. the main ruleset). So it
copies `sync-backlog.yml`'s shape rather than inventing one (HARD RULE #15): one
force-pushed branch, one open PR, auto-merged through the queue, pushed with
`AUTOMATION_PAT` because a `GITHUB_TOKEN` push raises no workflow run and the
required check would never appear.

**Why it cannot loop or self-conflict.** Its own merge triggers it again; that run
finds the bundles fresh and exits before committing. And it is the *only* writer of
these files, force-pushing a branch rebuilt from current `main`, so there is never
a second writer to conflict with — which is the whole mechanism.

**Why the freshness gate runs the build instead of classifying steps.** Tagging
~40 generators bot-owned by hand fails **silently in the permissive direction**: a
PR-owned artifact mistagged simply stops being checked and nothing says so. The
gate instead runs the real build and asks git what moved, so the classification
lands on actual output paths rather than on a hand-kept mapping that can drift.

## 5. Two silent failures caught by measuring, not reasoning

Both would have shipped as green.

**A pathspec that matched nothing.** `docs/src/lib/*/dist` — the intuitive
spelling — selects **zero** of the 47 files committed under those directories,
because git matches pathspecs with fnmatch and no `FNM_PATHNAME` unless `:(glob)`
magic is given. No error, no warning, just an empty set that would have left the
workspace-library builds on the PR-owned side of every gate here. Found by
*counting what each pathspec selects* instead of trusting it; the unit test now
asserts each pathspec matches a non-empty set, and fails 3 of 9 assertions if the
magic is removed.

**A gate that reported its own source as stale.** The first freshness check listed
the two brand-new `tools/*.js` files it was itself shipping as "stale generated
artifacts", because `git status --porcelain` reports untracked files. It now
compares before/after status maps, so a change is attributed to the build only
when the build caused it.

## 6. What this costs — stated, not buried

- **It does NOT reduce the 254 MB of derived history churn.** Uncommitting would
  have; this does not, by design, because the files stay committed. The ejection
  is fixed; the storage cost is unchanged and remains the open item from
  `2026-08-16-render-format-cost-assessment.md` §5.
- **`main`'s bundles trail its source by one PR cycle.** A clone taken between a
  merge and the rebuild landing has bundles that do not match its source. For a
  derived artifact consumed by CDN pin or download this is minutes of skew;
  version-pinned and tagged consumers are unaffected, since a release builds from
  the tagged tree.
- **A release cut against a stale `main` will refuse.** `tools/release.js` still
  runs the strict full check, deliberately. If it reports stale bundles, dispatch
  **Rebuild generated bundles** and wait for it to land. That is a hard stop a
  handful of times a year rather than a weakened gate.
- **One extra merge per dist-changing merge**, so roughly 64% of merges gain a
  follow-up bot PR through the queue. Queue volume up; ejections down.
- **A standing `AUTOMATION_PAT`** is already required by `sync-backlog.yml`, so
  this adds a consumer rather than a credential. It stays in the `automation`
  environment, which only admits `main`, so a PR branch cannot read it.
- **UNVERIFIED: the workflow has not run.** Its logic is reviewed and its shape is
  copied from a workflow that has been running for weeks, but a GitHub Actions
  workflow cannot be executed from this sandbox. The first real run is the test,
  and it is dispatchable on demand. Everything else here was exercised locally and
  is recorded in §7.

## 7. Verification

| Claim | How | Result |
|---|---|---|
| A merge driver cannot run in the queue | real `git merge` with `merge=ours` and no driver config | conflicts, as predicted |
| Pathspecs and predicate describe one set | cross-check against the real index | agree on all **194** files |
| The two sides partition the tree | `ls-files` both ways | 194 + 3,693 = **3,887** tracked |
| A `lib/` change that stales `dist/` passes | real gate run | exit **0**, `dist` left clean |
| A stale PR-owned artifact fails | added a decision note | exit **1**, names `decisions/README.md` |
| The PR gate rejects a staged rebuild | staged a real `npm run build` | exit **1**, grouped by rule |
| The printed recovery command works | ran it | bundles dropped, source change kept |
| The tests can fail | mutation | removing `:(glob)` fails 3 of 9 |

Gates: `npm run lint`, `npm test`, `npm run build:check`, `npm run test:integration`
— recorded in the PR.

## 8. Checker findings — BLOCKING, not yet fixed

An independent checker reviewed the diff before the PR was opened (HARD RULE #25,
the step skipped on #1686 that later cost a silent-corruption bug). Verdict: **do
not merge.** Recorded here in full rather than summarized, because the next
session works from this list.

### Blockers

**B1 — `playground:check` deadlocks ~22% of PRs, with no workaround.**
`ci.yml:204` runs `npm run playground:check` in the merge-blocking `unit` job. It
byte-diffs `docs/public/playground/lattice-playground.js` — which this change
declares bot-owned, so the PR is *forbidden* to carry the fix. That bundle's
esbuild input graph is 426 source files including 53 under `lib/core/` and 10
under `lib/engine/` — the shared kernel HARD RULE #1 sends all engine work to.
Measured against real history: **11 of the last 50 merged PRs** would be
unmergeable (`#1701, #1692, #1699, #1667, #1676, #1689, #1648, #1664, #1665,
#1647, #1628`) — `playground:check` red, and the only fix rejected at commit *and*
in CI. Reproduced end to end on a one-line `lib/core/bg-image.js` change.

**B2 — the release flow cannot cut a release commit.** `tools/release.js:253`
stages `dist` and `:271` commits it. `npm ci` installs the hooks, so the new
`pr-bundles` pre-commit job sees 134 staged `dist/` paths and exits 1 — the
release commit is never made. Even bypassed, the release PR's head is
`release/v$V`, which `ci.yml:146` does not exempt, so it can never go green.
Neither file is in this diff. **And §6's claim that `release.js` "still runs the
strict full check, deliberately" is half wrong:** true of `release.js:113,235`,
but `release.yml:71` runs `npm run build:check`, which this change narrowed — so
the release workflow's pre-flight silently stopped covering `dist/`, and the
strict refusal moves to `release-publish.yml`, *after the release commit has
merged to `main`*. That is a worse failure position than before.
**`build:check:all` has zero callers** — a dead script that `workflow.md:758` and
`build-dist-readme.js:160` both describe as the live release check.

**B3 — the new `build:check` re-opens the #1547 ejection on the repo's
highest-churn file.** `build-decisions-index.js:404-412,499-501` states its
`--check` is *deliberately* weaker than a byte-diff, because no PR sharing the
queue with another decision-doc PR can satisfy a byte-comparison.
`check-generated-freshness.js` runs the real writer and flags any git-status
movement, which makes it a byte-diff again — on a PR-owned path. Reproduced on a
clean `main` clone with two adjacent index rows swapped and committed (exactly
what a clean merge of two decision-note PRs produces): old gate exit 0, new gate
exit 1. It runs in the always-on `lint` job, on `merge_group` too, so the second
of two decision-note PRs is ejected with auto-merge silently cleared.
`engineering/decisions/README.md` is **the single most-churning file in the repo,
24 of the last 50 commits — ahead of every `dist/` file.** `ci.yml:110` still
claims the index is "checked for CONTENT rather than bytes" above a step that no
longer does that.

### Correctness defects in the new gates

**B4 — `build:check` silently destroys staged bot-owned work**, and its own
comment at `:47-50` denies it. `:116` restores every bot-owned path whose
porcelain *code* moved, not those the build caused. Reproduced: staged content
with a marker, gate exit 0, index and worktree both reset to HEAD, marker gone,
no output. Intermittent (only when staged bytes differ from fresh build output),
which is worse for trust. It is in the **pre-push hook**, so it fires unasked.

**B5 — a brand-new bot-owned file makes the restore abort silently.**
`statusUnder` includes `??`, so a new output (a new theme → `dist/themes/*.min.css`)
enters `toRestore`; `git restore --source=HEAD` on a path absent from HEAD aborts
the *whole* invocation and `:116` discards the exit code. `build:check` then leaves
134 dirty `dist/` files, and `release.yml:71` runs it immediately before
`release.js --prepare`, whose `requireCleanTree()` aborts with no hint why.

**B6 — `rebuild-generated.yml:106` is blind to new bundles.** `git diff --quiet`
does not see untracked files, so a purely *additive* bundle output never reaches
`main` at all — the PR may not carry it and the only other writer exits early.
Use `git status --porcelain`.

**B7 — two vacuous-pass paths.** (a) `statusUnder` returns an empty map on any
`git status` failure, so both sides compare empty and the gate prints
"freshness OK" — the exact defect class its own header claims to guard against;
make it throw. (b) `ci.yml:146` keys the exemption on `github.head_ref`, which is
author-controlled including from a fork: any PR from a branch named
`chore/rebuild-generated` skips the gate entirely. Check the bot identity, or the
file set. (c) minor: `--diff-filter=ACMRT` excludes `D`, so a staged *deletion* of
a bot-owned file passes the hook (CI catches it).

### Cost statements that are incomplete

**B8 — the deployed docs site ships a mismatched Playground for a full merge
cycle.** `docs.yml` triggers on `push: main`, never runs `npm run build`, and
builds Astro from the committed tree. So a `lib/**`-only merge deploys a site
whose SSG shell is fresh and whose client bundle is one cycle old — the exact
condition `docs.yml`'s own comment warns about, made routine, and permanent if
`rebuild-generated` ever fails. §6's skew cost mentions CDN pins and downloads,
not the docs site — the surface a human actually looks at.

**B9 — PLAUSIBLE, unreproduced:** `docs-build`'s `tsc --noEmit` typechecks against
the 47 committed, now-bot-owned workspace `.d.ts` files (same deadlock shape as
B1, different job); and `test/lint-coverage/baseline.json` is PR-owned while
enumerating `dist/` outputs, so a new lintable `dist/` file would leave the
rebuild PR permanently red. Also `rebuild-generated.yml:65`'s guard keys on the
*last* commit of a push, so a queue train batching `[lib-PR, rebuild-PR]` skips
the run and strands the lib PR's bundles until the cron.

### Numbers this note got wrong

| Claimed | Actual |
|---|---|
| 194 + 3,693 = 3,887 tracked (§7) | **195 + 3,701 = 3,896** |
| marp-kit + `lattice.min.css` are 6th/7th most-churning, 17 of 50 | **8th/9th, 15 of 50** — and #1 is `decisions/README.md` at 24/50, the file B3 breaks |
| 21/50 commits touch the emulator bundles | 22/50 |
| `dist/` is 134 files, 23.7 MB | 135 files, 22.6 MB |
| 254.3 MB distinct `dist/` blob content | 280.8 MB over the current window (the window moved) |
| test comment "11 `*.generated.js`" | 10 |

Held on re-measurement: ~9.6 KB/line, 32/50 commits touching `dist/`, the 47
workspace-library files, the `:(glob)` finding and its fix, the predicate/pathspec
partition, the merge-driver impossibility argument, and the browser-free build.

### The smallest fix set the checker proposes

1. Move `playground:check` out of `ci.yml`, or exempt it to the rebuild branch (B1).
2. Teach `release.js` + `release.yml` about the boundary (B2).
3. **Do not re-derive freshness from a build + `git status`.** Keep
   `tools/build.js --check`'s per-generator semantics — some are deliberately
   weakened — and *scope* it, e.g. `--exclude-bot-owned`. This kills B3, B4 and B5
   at once and restores read-only-ness.
4. If the build-and-diff shape survives anyway: check the restore exit code,
   restrict it to paths present in HEAD, make `statusUnder` throw (B5, B7a).
5. `git status --porcelain` in the workflow (B6); identity not branch name (B7b).
6. Fix the numbers above, drop the two `capabilities.md` TODOs, correct
   `ci.yml:110`, `ci.yml:124` ("build --check" now writes), and
   `check-pr-bundles.js:29` (says CI uses `gh pr view`; it deliberately does not),
   and add B8 to the cost list.

**The lesson worth keeping.** The central design choice here — build-and-diff
rather than classifying generators — was made to avoid a hand-kept mapping that
could drift, and argued as the safer shape. It is not: it assumes every
generator's `--check` *is* a byte-diff, and #1547 had deliberately made one of
them weaker. The safer-looking option silently discarded a protection the repo had
already bought.

## 9. Resume order for the next session

The branch (`claude/render-cost-followons-6zt8ul`) carries three commits and is
pushed. **No PR is open, deliberately** — the change is not review-ready, and
opening one would put a known-broken merge gate in front of a human.

What is sound and should be kept:

- `tools/bot-owned-artifacts.js` — verified independently twice (the predicate and
  the pathspecs describe the same set; the `:(glob)` fix is correct). Keep it. Only
  the file COUNT in its header needs a refresh, since `main` moved.
- `tools/check-pr-bundles.js` — the mechanism is right and the CI stdin plumbing
  was verified end to end. Needs B7b (identity, not branch name) and B7c (`D` in
  the diff filter).
- `.github/workflows/rebuild-generated.yml` — shape is right, copied from a
  workflow that has run for weeks. Needs B6 (`git status --porcelain`) and B9's
  guard fix. **Still never executed.**
- The measurements and the two rejected options (§2, §3). Those held under review.

What must be rewritten:

- `tools/check-generated-freshness.js` — **delete the build-and-diff approach.**
  Take the checker's item 3: keep `tools/build.js --check`'s per-generator
  semantics, which some generators deliberately weaken, and add a scoping flag
  (`--exclude-bot-owned`) that skips the bot-owned STEPS. That is the option this
  work rejected as error-prone; it is the correct one, because the failure mode it
  was rejected for (a mapping that drifts) is loud, while the failure mode
  build-and-diff introduced (silently converting a deliberately-weak check into a
  byte-diff, and reverting staged work) is silent. A test asserting the step
  classification against the real write-set closes the drift risk.

Then, in order: B1 (`playground:check`) — the merge blocker; B2 (release flow);
the rewrite above; B6/B7; then the numbers and false comments in §8's list.

**Only after all of that: run the adversarial trio** (red team + Munger inversion +
independent checker, HARD RULE #25) on the reworked diff, because this is
merge-gating infra and one checker has already found three blockers in it. Running
the trio before the rework would harden code that is about to be replaced.

## 10. The rework — what the checker changed

§8 is the review as received. This is what shipped in response, and the design
that survives is not the one that went in.

### The freshness gate was rebuilt, not patched (B3, B4, B5)

`tools/check-generated-freshness.js` is **deleted**. `build:check` is now
`build.js --check --exclude-bot-owned`: it runs the same generators as before and
simply skips the 25 whose outputs are bot-owned.

That is the option the first pass rejected as too error-prone, and rejecting it
was the mistake. The reasoning was that a hand-kept step→output mapping can
drift; the reasoning missed that **build-and-diff assumes every generator's
`--check` is a byte-diff**, and `build-decisions-index.js`'s deliberately is not
(#1547 made it order-blind so two decision-doc PRs can share the queue).
Skipping steps preserves each generator's own semantics; rebuilding and diffing
overrode them. Drift is loud and fixable; overriding a weakened check was silent
and re-opened a closed ejection.

Three defects went with the file: it could silently revert staged work, its
`git restore` could abort unchecked on a new artifact, and its status helper
failed open so any `git status` error produced "freshness OK".

**The drift risk is answered by measurement, not by care.** The tags came from
timestamping the tree and running each of the 39 generators alone. That is also
how the design error below was caught.

### One generator straddled the boundary, and the boundary was wrong

`build-theme-catalog.js` writes **both** `docs/src/lib/theme-catalog.generated.ts`
(then bot-owned) and `lib/theme/edges.generated.mjs` (PR-owned). Such a step can
be neither skipped (it stops checking a PR-owned file) nor kept (every theme
change must commit a file the gate rejects). The resolution was that the
*boundary* was too greedy: that catalog is ~42 bytes per line of ordinary
TypeScript that merges like any text file, not a minified bundle. Pulling it back
to PR-owned makes the step wholly PR-owned and the contradiction disappears.
**Found by measuring, not by reading** — the exact error the measurement was
meant to prevent.

### The deadlock and the release flow (B1, B2)

`playground:check` is **removed** from `ci.yml`. It byte-diffed a now-bot-owned
bundle in a merge-blocking job, so 11 of the last 50 merged PRs would have been
unmergeable — red gate, and the only fix rejected at commit and in CI. Its
coverage moves to the rebuild running on every merge.

The release flow is unblocked at both ends: the pre-commit gate skips on
`release/*` and `chore/rebuild-generated`, and CI exempts those branches.

### The exemption is now paired with proof (B7b)

A branch name is author-controlled, including from a fork, so exempting
`chore/rebuild-generated` by name alone would let anyone ship arbitrary bytes
into `dist/lattice-emulator.js` — the published `bin`. The exempted branches do
not skip verification; they get a **stricter** one: `build:check:all`, which
requires the bundles they carry to be byte-identical to a fresh build. A faithful
rebuild passes; injected bytes do not.

### Smaller ones

- The rebuild workflow's early exit uses `git status --porcelain`, not
  `git diff --quiet`, which could not see a newly-created bundle (B6).
- Its commit-message guard is **gone**: `head_commit` is only a push's last
  commit, so a queue train batching `[lib-PR, rebuild-PR]` would have skipped a
  run that had real work (B9).
- The staged-file gate counts deletions (`ACMRTD`), so `git rm` on a bundle no
  longer slips past the hook (B7c).
- The two `capabilities.md` TODO placeholders are described; `ci.yml`'s stale
  comment and step name are corrected; `check-pr-bundles.js`'s header no longer
  contradicts what CI does.

### A cost the first pass omitted entirely (B8)

**The deployed docs site ships a Playground bundle one merge cycle behind its
engine.** `docs.yml` triggers on `push: main`, never runs `npm run build`, and
builds Astro from the committed tree — so a `lib/**`-only merge deploys a site
whose server-rendered shell is fresh and whose client bundle is the previous one,
until the rebuild lands. `docs.yml`'s own comment warns about exactly this state;
this design makes it routine, and permanent if the rebuild workflow ever fails
silently. §6 listed CDN pins and downloads as the skew surface and never
mentioned the docs site, which is the surface a human actually looks at.

That is a real regression in freshness for a live surface, accepted here because
the alternative is the ejection tax on every PR — but it is the strongest
argument for revisiting *uncommitting* the bundles if the CDN-pin question can
ever be answered.
