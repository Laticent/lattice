---
status: in-progress
summary: >
  A registry of platform suites, checks that must run on a real macOS or Windows runner, and one report-only workflow that
  runs the ones a piece of work needs. Each suite declares its OS list, the paths that select it, its command and what it
  proves that Linux cannot. The nightly runs all of them, a manual dispatch picks some, and a pull request runs the suites its
  diff touches, so new work gets real-OS evidence by adding a registry entry instead of a workflow. Report-only until a
  suite is promoted. The first entry is the file-confine check (`export-confine`, macOS).
builds-on:
  - 2026-10-16-media-plugins.md
---

# Platform suites: real macOS and Windows evidence, selected by the work (2026-10-18)

## Why

The per-PR CI is Linux only. HARD RULE #23 says a "verified" claim needs an artifact from the real surface, and for anything
that depends on the operating system (symlinked temp folders, path separators, a native tool) Linux is not that surface.
Until now the answer was UNVERIFIED in the PR body (`engineering/development.md` still carries "macOS itself remains UNVERIFIED").
GitHub-hosted `macos-latest` and `windows-latest` runners are free on this public repository, so the only cost is the
workflow's own upkeep and each run's wall-clock.

The trigger was the file-confine work (#2771): a real-path check is exactly the code that macOS's `/tmp` → `/private/tmp`
symlink breaks, and there was no way to show it did not.

## The decision (owner, 2026-10-18)

The owner asked for the general capability, not a one-off job: "a nightly build that allows selective build capability based on
what is needed, so new work can leverage the CI to test against these OS". Settled by two questions:

- **Selection:** nightly runs every suite; manual dispatch names suites; a PR runs the suites whose `paths` match its diff.
- **Policy:** report-only. A suite's check is not in the required set, and a red suite is shown honestly. Promoting one to
  required is a later, separate decision made after it has run clean for a while.

## The shape

- `.github/platform-suites.json`: the registry. Fields: `name` (kebab-case), `os` (runner labels), `paths` (globs), `run` (the command,
  from the repo root after `npm ci` and `npm run build`), `why` (what this proves that Linux cannot).
- `tools/platform-suites-plan.js`: the selection rule, pure and unit-tested. Editing the registry, the planner or the workflow
  runs every suite on a PR, so the plumbing proves itself.
- `.github/workflows/platform-suites.yml`: a short `plan` job on Linux builds the matrix; a `run` job fans out suite × OS.
- `checkPlatformSuites` in `tools/check-ownership.js` (via `build:check`): fails on a malformed entry, a duplicate, an OS
  outside the allowed labels, and a `run` that names a test or tool file that no longer exists. It adds no CI job or hook.

## First entry, and what it leaves out

`export-confine` on `macos-latest` runs the CLI confinement test and the confine and inliner unit tests. **Windows runs as `export-confine-windows`** (2026-10-19), after a `build-windows` suite that runs the full `npm run build`. The CLI now builds
its file URLs with `pathToFileURL`. `npm run build` first failed on a `windows-latest` runner at `tools/check-ownership.js`
(backslash paths against forward-slash allowlists; run 39197530212), then at the Biome launch (the `.bin` shim), the command length
(8,948 paths in one call) and Biome's backslash paths and invalid JSON on Windows. Each was fixed in `tools/check-ownership.js` or
`tools/check-lint-coverage.js` and the build now passes (run 39266738239). A per-suite `build` field was added to get a Windows run in the
meantime and removed once the full build passed.
The first PR runs showed 28 of 63 `wait-for` tests failing on a macOS runner (stock: perl only, no timeout, gtimeout or flock). The cause was
the test's own lock probe calling `flock(1)`, so it now falls back to perl (and `isLive` to `ps`, since macOS has no /proc); the entry installs coreutils first, the state the notes call supported.

## How to add a suite

Add an entry to the registry with a `why` that names the OS-dependent behavior, list the `paths` that should select it, and run
`npm run build:check`. Dispatch it by hand with the Actions tab or `gh workflow run platform-suites.yml -f suites=<name>`.

## The nightly alert (2026-10-19)

The workflow stays report-only (owner ruling 2026-10-18), but a red nightly used to raise nothing beyond a red row in the Actions tab and
GitHub's default failure email to whoever last edited the cron line. The `alert` job now files the failure: on a scheduled or manual
run, when `plan` or any suite fails, it opens an issue titled "Nightly platform suites failed" (or comments on the open one; the lookup matches the exact title and the bot author, like the nightly family, so overlapping failing runs could still open two) with the
failed jobs and the run link. No labels, so it touches no shared board state. A person closes the issue; nothing closes it automatically.

## The first scheduled run (2026-10-19)

The cron trigger works. Run 39235883310 was the first `schedule` run: due at 04:41 UTC, it started at 10:13 UTC, 5 h 32 m late,
and went green. GitHub delays scheduled runs when its queue is busy and can drop one under heavy load, so a late nightly is normal,
and a day with no run at all is possible without any failure to alert on. The run checked out 2e2755d, which predates the Windows and wait-for
suites (#2786), so it ran one suite: `plan` 19 s and `export-confine` on macOS 2 m 20 s (`npm ci` 46 s, build 51 s, the suite 10 s).
What it proves is the trigger, the plan job's full-registry selection on a schedule, and the run job on that path. What it does not
prove is the four-suite matrix on a schedule: the dispatch run 39297285443 is the only evidence for that so far, and the next cron run
is the first scheduled one to carry it.

### The first run that carried every suite (2026-10-20)

Run 39401817610 (https://github.com/Laticent/lattice/actions/runs/39401817610) is the first `schedule` run with the full matrix. Due at
04:41 UTC, it started at 09:35 UTC (4 h 54 m late) on 23073cb and went green: `plan` and all six suite jobs passed, and `alert` was
skipped. The registry had grown since the follow-up was written: an `os-sandbox-measure` job now runs on both macOS and Windows, so this run
carries more than the four jobs the follow-up counted. Whole-job times, from the job list:

| Job | Runner | Time |
|---|---|---|
| `plan` | ubuntu | 22 s |
| `export-confine` | macOS | 2 m 49 s |
| `wait-for-macos` | macOS | 2 m 35 s |
| `os-sandbox-measure` | macOS | 3 m 06 s |
| `build-windows` | Windows | 3 m 40 s |
| `export-confine-windows` | Windows | 3 m 36 s |
| `os-sandbox-measure` | Windows | 4 m 14 s |

These match the dispatch-run times (within about 45 s each), so a scheduled run costs the same as a manual one. The whole run took
under 5 minutes of wall-clock time once it started. Two scheduled runs have now been late by about five hours, so treat a nightly as
"some time before midday UTC", not 04:41.
