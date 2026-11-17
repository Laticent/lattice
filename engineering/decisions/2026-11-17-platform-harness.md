---
status: in-progress
summary: >
  A warm harness for the macOS and Windows platform suites. A dispatch of platform-suites.yml with `harness=<PR>` gets one
  runner that installs and builds once, then takes `/harness` commands from that pull request's comments (a registry suite,
  a bash block, a re-run), syncs each new push with an incremental rebuild, and replies with the result. It removes the
  ~17 minutes of queue wait and setup an iOS dispatch pays per round. Only the dispatching login's comments run; no token
  reaches a job. It is a mode of the existing workflow, not a new one, so a branch can prove it before it merges.
builds-on:
  - 2026-10-18-platform-suites.md
  - 2026-11-04-ci-flake-audit.md
---

# A warm harness for the platform suites (2026-11-17)

## Why

Iterating on an iOS or Windows problem meant one `workflow_dispatch` per attempt. Each dispatch paid its whole setup again
before the first test. Run 44138306176 (PR #3288, one iPhone suite, today) is typical:

| Step | Time |
|---|---|
| `plan` + `docs-site` (Linux) | 5 m 05 s |
| waiting for a macOS runner | 7 m 50 s |
| checkout, `npm ci`, `npm run build` on the Mac | 4 m 00 s |
| **before the first test** | **17 m 02 s** |
| the suite | 12 m 58 s |

The same commit went through that twice in a day (runs 44119244333 and 44138306176). The owner asked for "a harness we
build once and submit jobs to" (2026-11-17), and chose this design and the PR thread as its mailbox in one round.

## The decision (owner, 2026-11-17)

- **A mode of `platform-suites.yml`, not a new workflow.** A `workflow_dispatch` workflow can only be dispatched once its
  file is on the default branch, so a new file could not be proven on the branch that adds it. With `harness` set, `plan` is
  skipped (and with it `docs-site`, `run` and `alert`) and the `harness` job runs alone.
- **The mailbox is the pull request thread.** Commands are PR comments that start with `/harness`; replies are PR comments
  marked `<!-- lattice-harness -->`. The session that subscribed to the PR may receive the replies as events. Whether a
  bot's comment reaches it that way is checked on first use and recorded below.
- **Pushing is the common trigger.** Before each job the harness fetches the branch (an explicit `refs/heads/` refspec, so a
  tag of the same name cannot shadow it) and rebuilds from the commit it last built, not the one it last checked out, so a
  failed or `--no-build` round is rebuilt on the next job. `rebuildFor` skips the rebuild only when every changed path is
  one no build reads: the iOS probes under `docs/scripts/ios-safari/` (run.sh loads them from source), `followups.d/` and
  `changelog.d/`. Anything else rebuilds `dist/` and the docs site, because nearly everything feeds one: `.md` feeds the site
  and the component docs, `docs/scripts/*.mjs` run inside `build:e2e`, the baseline decks feed the portal. A lockfile
  reinstalls (the docs lockfile reinstalls the docs only). With `watch` on (the default), a new commit re-runs the last job
  without a comment, once per commit. The registry is re-read after each sync, so a suite a push adds can run.
- **One at a time, bounded.** Job-level `concurrency: platform-harness` without cancel: a second dispatch waits, so a
  harness never takes a second macOS slot from the nightly (GitHub keeps one waiting job per group, so a third dispatch
  replaces the second). The 90-minute deadline counts from the job's first step; a running job is killed at it (its whole
  process group), and the loop ends a minute before it, leaving 15 of the job's 105 minutes for the artifact upload. It
  also stops after 15 idle minutes or on `/harness stop`. A `/harness stop` waits for the running job to end: commands
  are read between jobs.
- **A transient error does not end the session.** A failed poll, reply or fetch is logged and the loop carries on; five
  failures in a row end it with a reply.

## Threat model

The repository is public, and the harness executes comment text as shell. What keeps that safe:

1. **Who.** A comment runs only when its author is the login that dispatched the run (`github.triggering_actor`), with an
   `author_association` of OWNER, MEMBER or COLLABORATOR, and it was posted after the harness started. Dispatching needs write
   access already, so the harness grants nobody a power they did not hold: they could push the same commands as a commit.
2. **Which PR.** At start the harness checks that the PR's head is this repository and this branch. A fork PR, or another
   branch's PR, is refused, so one branch's code never reports into another's thread.
3. **No secrets, and the token stays with the poller.** The job is given no repository secrets. Its token
   (`contents: read`, `issues: write`, `pull-requests: read`) is a short-lived `GITHUB_TOKEN` that could edit any comment
   in the repository, including a fresh `/harness` command before the poll reads it, so it must not leak. Three guards:
   the checkout uses `persist-credentials: false`, so it is not in `.git/config` (checkout's default writes it there, where
   any job could read it, as the review of this change found); `jobEnv` strips every `*TOKEN*`, `*SECRET*` and `ACTIONS_*`
   variable, and `GITHUB_ENV`/`GITHUB_PATH`/`GITHUB_OUTPUT`/`GITHUB_STATE`, so a job cannot plant `NODE_OPTIONS` in the
   later upload and cache steps that hold the runtime token; and `redact` removes the token, raw and in its base64 forms,
   from every reply, because a comment posted through the API bypasses the Actions log's masking. A `/harness suite` also
   refuses `PATH`, `NODE_OPTIONS`, `BASH_ENV` and similar, but that list is hygiene, not a boundary: `/harness sh` runs
   any bash the dispatcher writes.
4. **Its own replies never run.** A comment carrying the marker is ignored, so an echoed log cannot become a command, and a
   reply's code fence cannot be closed by the log (`tail` breaks every ```` ``` ````).

What it does not defend: a person with write access running something harmful, which they can do with a commit today
(with watch on, any write-access push re-runs the last job on the new code, which is the same power); and the PR thread
getting noisy, which `/harness stop` and the idle stop limit.

The review (one `checker`, 2026-11-17) found the `.git/config` token, a stale build after a failed rebuild, a rebuild rule
that skipped paths a build reads, a tag-shadowed fetch that made watch re-run back to back, an unenforced deadline, and a
loop that one transient error ended. All are fixed in the same change, and the loop was driven end to end against a fake
API and a local origin (stranger ignored, token stripped and redacted, a pinned variable refused, one re-run per push, a
failed rebuild retried, status and stop) before the first real run.

## What it does not change

- **Evidence.** A harness reply is a real run on the real OS, so it can back a card's claim, with the reply and the
  `harness-<os>` artifact linked. The nightly and the registry are unchanged; the harness runs the registry's own `run`
  command for a suite.
- **The simulator still boots once per suite run.** `docs/scripts/ios-safari/run.sh` creates a fresh device and shuts it
  down on exit, which its comments explain is what made safaridriver reliable. Keeping a device booted across jobs is a
  change to that script, measured on the harness itself before anyone adopts it. Until then a round saves the queue wait and
  the setup, not the boot.

## Open

- **First real use.** Record how long a round takes after the first (sync + rebuild + suite), and whether the reply
  comments reach a subscribed session as events.
