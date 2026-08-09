---
status: shipped
summary: The "Main Merge Queue" ruleset has no bypass actors, so every workflow that pushed straight to main was rejected with GH013 — sync-backlog had failed 100% of its runs (73 of the last ~100 red runs repo-wide) and the never-yet-exercised release workflow carried the same latent break. Splits repo automation into two classes with two different answers: HIGH-FREQUENCY GENERATED MIRRORS (BACKLOG.md) get a ruleset bypass for the GitHub Actions integration, because routing a generated file through the queue would spend a full CI run per issue event; ANYTHING THAT CHANGES WHAT SHIPS (the release) goes through the queue like every other change, so the tag names a tree `ci` actually passed on. release.yml split into prepare (cut the commit on a branch → PR) and release-publish.yml (tag the squashed commit, zip, GitHub Release, npm). Two latent release-killers found by exercising the real flow and fixed: the US-English ratchet counted the gitignored release/ notes file and aborted the build mid-release, and the 1.4 MB notes body exceeded GitHub's 125,000-character Release-body cap.
---

# Automation under the merge ruleset

**Date:** 2026-08-09
**Status:** decided, implemented
**Issue:** #1439
**Rules touched:** none renumbered; HARD RULE #16's "never let an open PR merge
conflicted, stale, or CI-red" is unchanged — this is about *bot* writes, not PRs.

## Symptom

Filing an issue by hand on github.com produced a red workflow run every time:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through the merge queue
remote: - Changes must be made through a pull request.
remote: - Required status check "ci" is expected.
 ! [remote rejected] main -> main (push declined due to repository rule violations)
```

It was not rare. Of the ~100 failed workflow runs in the five days to
2026-08-09, **73 were the backlog mirror** — 68 issue-triggered, 5 scheduled —
and every `sync-backlog` run in that window had failed. `BACKLOG.md` on `main` had
last moved on 2026-08-02, and then only because a human PR happened to carry it.

## Root cause

The `Main Merge Queue` ruleset (id 18317422) targets `refs/heads/main` and
requires a pull request, the merge queue, and a green `ci`. Its
**`bypass_actors` list is empty**, and `current_user_can_bypass` reads `never`
for everyone. So a direct push to `main` is refused for *every* actor — the
Actions bot, an agent, and a human alike.

Nothing about this was a regression in the workflows. `sync-backlog.yml` and
`release.yml` were written against branch protection *before* the merge queue
went live (2026-06-30, `2026-06-17-workflow-efficiency-review.md` §F), and both
carried a header note saying a protected `main` would need a bypass. The
setting was simply never made. The merge queue then made the requirement
structural rather than optional.

The failure was also **noisier than it needed to be**. `sync-backlog`'s push
loop treated every rejection as a race and rebased three times before giving
up, so each run buried the real verdict under three identical GH013 blocks and
a message that guessed at two causes at once.

## Two classes of automation, two answers

The tempting fix — "grant the bot a bypass and move on" — is right for one
class of write and wrong for the other. What separates them is **frequency**
and **whether the write changes what ships**.

| | Backlog mirror | Release |
|---|---|---|
| Trigger | issue opened/closed/edited + daily | manual, a few times a year |
| Frequency | ~14 pushes/day at recent rates | ~0.02/day |
| Content | generated from issues; the file is a *view* | the version, the changelog, `dist/` — the artifact itself |
| Cost of a queue trip | a full `ci` run **per issue event** | one `ci` run per release |
| Cost of a bypass | a drift event for every open PR | — |

**The mirror takes the bypass.** A generated read-only view is not worth a CI
run per issue event, and a release-grade review of a file no human edits is
theater. Adding GitHub Actions (integration id `15368`) to the ruleset's bypass
list is a one-time repo setting.

**The release takes the queue.** A release is exactly the write that *should*
be reviewed and tested on the tree that merges. Under a bypass, the release
commit would reach `main` having been tested only on the pre-merge state; under
the queue, the required `ci` check runs on the combined post-rebase state, and
the tag then names a commit that check actually passed on. It is rare enough
that the CI cost is irrelevant.

Note what the bypass does **not** buy: it applies to the whole GitHub Actions
integration, so *any* workflow using `GITHUB_TOKEN` may push `main` once it is
granted. That is the accepted cost, and it is the reason the release does not
lean on it — the narrow, auditable path is preferred wherever the cost of using
it is affordable.

### Rejected: the mirror opens a PR and auto-merges

`required_approving_review_count` is `0`, so a bot PR *could* auto-merge with no
human in the loop. Rejected on cost and on churn: ~14 full CI runs a day for a
generated doc, each one a merge-train entry that every open PR must rebase past
— the exact thrash `2026-06-14-drift-watch-rebase-thrash.md` and
`2026-06-17-workflow-efficiency-review.md` §D were written to prevent.

### Rejected: move the mirror off `main` to an orphan branch

The `ci-drift-images` idiom (a pure artifact branch, never merged) would work
and would cost nothing. Rejected as the *default* because it takes `BACKLOG.md`
off the repo root, where its lock-in-insurance job
(`2026-06-14-github-project-management.md`) depends on it being the first thing
a clone shows. Kept in reserve: if the bypass ever proves to churn the merge
queue in practice, this is the fallback, and it needs no ruleset change.

## The release, restructured

`release.yml` cut the commit, tagged it, and pushed both to `main` in one job.
Under the ruleset that job cannot complete, and the failure lands *after* the
version bump, the changelog roll and the tag — a half-cut release.

It is now two phases across a merge:

1. **`release.yml` — Release (prepare).** Gates, then
   `tools/release.js --prepare`: bump, roll `## Unreleased`, rebuild `dist/`,
   commit. No tag, no zip, no push to `main`. It pushes `release/v<x.y.z>` and
   opens the PR. A human approves and enables auto-merge; the queue does the
   rest.
2. **`release-publish.yml` — Release (publish).** Fires on the resulting push
   to `main`, and no-ops unless `package.json`'s version is untagged.
   `tools/release.js --publish` tags **that** commit, rederives the notes,
   builds the zip from the tagged tree, and pushes the tag. Then the GitHub
   Release, then npm.

Three consequences worth stating plainly:

- **The tag must be cut in phase 2, not phase 1.** The queue squashes the PR
  into a new commit, so a tag made on the branch would name a sha that never
  reaches `main`.
- **Nothing survives the phase boundary except what is in git.** `release/` is
  gitignored, so phase 2 cannot inherit phase 1's notes file — it reads back
  the dated `## <version>` section the release PR committed
  (`changelog.extractVersion`).
- **Tags need no bypass.** The ruleset targets `refs/heads/main`; there is no
  tag ruleset, so phase 2's `git push origin v<x.y.z>` is unaffected.

### The PR cannot be opened by `GITHUB_TOKEN`

GitHub suppresses workflow runs for events raised by the repo token, so a PR
opened with `GITHUB_TOKEN` would never receive the required `ci` check and could
never merge. Phase 1 therefore opens the PR only when a `RELEASE_PAT` secret is
present; without it the branch is pushed and the run prints the compare link for
a human to open in one click — which is an ordinary user event, so CI runs. Both
paths work; the PAT only removes a click.

## Two release-killers found by running it

Exercising both phases on a real clone (not a harness — HARD RULE #23) surfaced
defects that would each have broken the first real release, both pre-existing:

- **The US-English ratchet counted `release/`.** `listRepoTextFiles` walks from
  the repo root, so the notes file the release writes was scanned at ~70 hits
  and pushed the count from 1307 to 1360 — the build aborted **mid-release**,
  after the version bump. `release/` now joins the documented class of
  gitignored build artifacts the walk skips (the `docs/public/playground/v`
  precedent): the notes are a verbatim copy of a CHANGELOG section, and
  `CHANGELOG.md` is itself exempt, so counting them double-charged an exempt
  source. Skipped **by path**, not by name — `test/unit/release/` stays in scope.
- **The Release body exceeded GitHub's cap.** Everything in this repo still
  sits under `## Unreleased`, so the generated notes were 1.4 MB against a
  125,000-character limit. `gh release create` would have failed at the last
  step of the release, after the tag was pushed. `changelog.fitReleaseBody`
  now trims on a line boundary and appends a pointer to `CHANGELOG.md`.

A third, smaller edge: `--prepare` commits four paths (`package.json`,
`package-lock.json`, `CHANGELOG.md`, `dist`), but `npm run build` regenerates 36
artifacts. If it touches anything else, the release commit is silently
incomplete and the symptom appears two phases later as `--publish` refusing a
dirty tree. `--prepare` now fails immediately and names the stray files.

## What a future agent needs to know

- **Do not add a `git push` to `main` in a workflow.** It works only under the
  bypass, and the bypass exists for one file. Push a branch and open a PR.
- **`sync-backlog` failing with GH013 is a settings gap, not a race.** The
  workflow now says so and exits immediately instead of rebasing three times.
  If it reappears, check the ruleset's bypass list first — that is the whole
  diagnosis.
- The one-time setting, and the `gh api` call that applies it, are in
  `engineering/workflow.md` § Automation vs. the main ruleset.
