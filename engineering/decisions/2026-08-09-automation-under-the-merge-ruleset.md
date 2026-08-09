---
status: shipped
summary: The "Main Merge Queue" ruleset has no bypass actors, so every workflow that pushed straight to main was rejected with GH013 — sync-backlog had failed 100% of its runs (73 of the last ~100 red runs repo-wide) and the never-yet-exercised release workflow carried the same latent break. Rejects the tempting bypass (granted to the INTEGRATION, it would let any GITHUB_TOKEN workflow push main) and instead routes BOTH workflows through the normal path — branch, PR, merge queue — with auto-merge switched on, so they land unattended through the same gate as human work. Hinges on one non-obvious constraint: GitHub suppresses workflow runs for events raised by GITHUB_TOKEN, so a bot-opened PR never starts ci and sits unmergeable forever; every event-raising step therefore runs as an AUTOMATION_PAT secret, and both workflows fail loudly without it. That PAT is fine-grained (one repo, Contents + Pull requests write — less than a write collaborator already holds) and lives in an ENVIRONMENT restricted to main rather than in repo secrets, because a repo secret is readable by any workflow in the repo including one added on a PR branch, and in an agent-driven repo that is a live exfiltration path; NPM_TOKEN belongs there too. A GitHub App was weighed as the stronger credential and deferred. The mirror also drops to a NIGHTLY cron (+ dispatch) from per-issue-event, since a queue trip is no longer free — one CI run and one merge-train entry a night, off-hours, against ~14 during working hours; it force-pushes ONE fixed branch so a dispatch updates the open PR in flight; release.yml splits into prepare (commit → PR → auto-merge) and release-publish.yml (tag the squashed commit, zip, Release, npm). Auto-merging the release narrows CLAUDE.md rule 7 in writing: the dispatch is the authorization. Two latent release-killers found by exercising the real flow and fixed: the US-English ratchet counted the gitignored release/ notes file and aborted the build mid-release, and the 1.4 MB notes body exceeded GitHub's 125,000-character Release-body cap.
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

## One rule, no exceptions — the answer for both

The tempting fix is "grant the bot a bypass and move on." It was considered and
**rejected**: a bypass is granted to the *integration*, so once set, any
workflow holding `GITHUB_TOKEN` can push `main` — a standing hole in the one
guarantee the ruleset exists to give, opened to fix one generated file.

Both workflows instead do what a human does: push a branch, open a PR, let the
queue land it. What makes them *automatic* is not a shortcut around the gate but
**auto-merge**: `gh pr merge --auto --squash` queues the PR the instant `ci` is
green, so it merges with nobody watching. Same gate, same tests, no human, no
exception. `required_approving_review_count` is `0`, so nothing in the ruleset
demands a reviewer — the merge queue is a *testing* gate here, not a review one.

### The catch that makes this non-obvious

**GitHub suppresses workflow runs for events raised by `GITHUB_TOKEN`.** It is a
loop-breaker and it is absolute: a PR opened with the repo token never starts
`ci`, and a push that updates such a PR never re-starts it. The required check
never appears, so the PR does not fail — it *sits*, unmergeable, forever.

This is the whole reason a naive "just open a PR" rewrite fails, and the reason
this design needs a secret at all. Every step that raises an event another
workflow must observe — the branch push, the `gh pr create`, and the
`gh pr merge --auto` whose merge must in turn trigger `release-publish.yml` —
runs as **`AUTOMATION_PAT`**. Both workflows fail loudly when it is missing
rather than opening a PR that can never land.

### Where the credential lives, and why it matters here

The token is a fine-grained PAT scoped to this repo with **Contents: write** and
**Pull requests: write** — strictly less than a write collaborator already holds,
and far less than the rejected bypass, which would have let any workflow reach
`main` with **no CI at all**. So it is not a privilege escalation; it automates
an authority that already existed.

What it *is* is a standing credential, and a repo secret is readable by any
workflow that runs in the repo — including one added on a PR branch. Sizing that
by "how many humans have write access" gives one. But **this repo is driven by
agents**: an agent session that misbehaves, or one steered by injected text in
an issue body or a CI log it reads, can open a PR whose workflow prints the
token in obfuscated form. Log masking does not survive base64. That is the
realistic exfiltration path, and it needs no malicious human.

So the token is an **environment** secret: environment `automation`, deployment
branch rule `main` only, declared by every job that needs it. A PR branch cannot
read it — a job referencing the environment from another ref fails outright — so
an attacker must first land a malicious workflow on `main`, which is loud,
reviewable, and goes through the queue. `NPM_TOKEN` belongs in the same
environment for the same reason, and `release-publish.yml` declares it on that
basis alone (it needs no PAT — it pushes a tag, which the ruleset does not
cover).

**The environment carries a branch rule and nothing else.** Required reviewers
there would be an approval gate, parking every unattended run on a click — the
precise thing this design exists to remove.

Not adopted, and worth naming: a **GitHub App** is the stronger credential —
installation tokens are minted per run and expire in an hour, are not tied to a
personal account, never silently expire, and (like a PAT, unlike `GITHUB_TOKEN`)
their events do trigger CI. It was weighed against a PAT-in-an-environment and
deferred as more setup than the current threat justifies for a
single-collaborator repo. It is the upgrade path if that stops being true.

### What it costs

| | Backlog mirror | Release |
|---|---|---|
| Trigger | nightly cron (+ dispatch) | manual dispatch |
| Frequency | once a night, and only when the render changed | a few times a year |
| CI on the PR | `lint` only — `BACKLOG.md` matches neither `code` nor `docs` | full |
| CI in the queue | **full** — `changes` forces everything true on `merge_group` | full |
| Human | none | the dispatch |

The merge-queue run is the real cost, and it is deliberate on their side: the
`changes` job forces `code` and `docs` true for `merge_group` because that is
the final pre-merge gate and "path-skipping is the wrong economy" there. So a
backlog sync costs roughly one full CI run plus one merge-train entry every open
PR must rebase past.

**That price is what set the mirror's cadence.** The direct push was free, so
the mirror fired on every issue state change — up to ~14 a day. Through the
queue that is ~14 full CI runs and ~14 rebase nudges arriving during working
hours, to keep a generated file current to the minute. So the `issues:` triggers
were dropped with the push that made them cheap: **the mirror is nightly**, at
06:17 UTC, plus manual dispatch when someone wants it now. One CI run, one
merge-train entry, off-hours, and only on a night when the render actually
changed. The 24h lag is not a regression in kind — the mirror already
reconciled label/assignee drift on exactly that cron; this extends it to
title/state. Issues remain the source of truth, and the mirror was never the
board.

If even that ever bites, the remaining lever is to retire the mirror from `main`
entirely onto an orphan artifact branch — the `ci-drift-images` idiom — which
costs nothing at all. It needs no ruleset change either, which is exactly the
property worth keeping.

### Where the human went, for the release

Auto-merging a release narrows `CLAUDE.md` rule 7 ("a human authorizes every
merge"), so the narrowing is written down rather than left as a contradiction
between the docs and the machine: **dispatching Release (prepare) IS the
authorization.** The human decision moved from approving a PR to running the
workflow, which is the more honest place for it — by the time the PR exists,
every input (the changelog, the bump) was already decided. The backlog mirror
has no human at all, and needs none: it is a rendering of issues a human already
curated.

### One branch, one open PR

`sync-backlog.yml` force-pushes a fixed branch (`chore/backlog-sync`) at
`main` + 1 commit, so a dispatch fired while last night's PR is still in flight
updates that PR rather than opening a second one. Force-pushing drops a queued
PR from the queue, which is correct — the newer snapshot supersedes it. The workflow also
must never `cancel-in-progress`: a run killed between "PR opened" and
"auto-merge enabled" would park a PR forever with nothing to land it.

## The release, restructured

`release.yml` cut the commit, tagged it, and pushed both to `main` in one job.
Under the ruleset that job cannot complete, and the failure lands *after* the
version bump, the changelog roll and the tag — a half-cut release.

It is now two phases across a merge:

1. **`release.yml` — Release (prepare).** Gates, then
   `tools/release.js --prepare`: bump, roll `## Unreleased`, rebuild `dist/`,
   commit. No tag, no zip, no push to `main`. It pushes `release/v<x.y.z>`,
   opens the PR, and switches auto-merge on; the queue does the rest.
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
- **Tags are outside the ruleset.** It targets `refs/heads/main`; there is no
  tag ruleset, so phase 2's `git push origin v<x.y.z>` needs nothing special.

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

- **Do not add a `git push` to `main` in a workflow.** It cannot work — there is
  no bypass and there is deliberately not going to be one. Push a branch, open a
  PR as `AUTOMATION_PAT`, and `gh pr merge --auto`.
- **Never raise an event with `GITHUB_TOKEN` that another workflow must see.**
  Opening a PR, or pushing to an open PR's head, with the repo token produces a
  PR that can never merge — silently. Use `AUTOMATION_PAT`.
- **`sync-backlog` failing with GH013 would mean someone reintroduced a direct
  push.** The workflow no longer pushes `main` at all.
- Both automated merges are narrow and written down: `CLAUDE.md` rule 7 and
  `workflow.md` § Merging scope "a human authorizes every merge" to *authored*
  work. Don't read them as licence to auto-merge your own PRs.
- The full mechanism, the cost, and the two frequency levers if it ever bites
  are in `engineering/workflow.md` § Automation vs. the main ruleset.
